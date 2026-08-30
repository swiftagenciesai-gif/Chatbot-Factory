import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasDatabase, insertWidget, listWidgets, getWidget, updateWidget, deleteWidget, incrementUsage, resetUsage } from './db.js';
import { estimateCostUsd } from './pricing.js';

const app = express();
const publicBaseUrl = (
  process.env.PUBLIC_BASE_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  `http://localhost:${process.env.PORT || 3001}`
).replace(/\/$/, '');
const widgetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/widget.js');
const defaultLlmProvider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
// Estimated human minutes a handled message would otherwise take a person to
// answer - used only to compute the "hours saved" figure shown per widget.
const minutesSavedPerMessage = Number(process.env.MINUTES_SAVED_PER_MESSAGE) || 4;

app.use(cors());
app.use(express.json({ limit: '32kb' }));

const validHex = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
const cleanText = (value, fallback, max) => String(value || fallback).trim().slice(0, max);
const validProvider = (value) => ['openai', 'anthropic'].includes(String(value || '').toLowerCase());
const cleanWebsiteUrl = (value) => {
  const trimmed = String(value || '').trim().slice(0, 300);
  if (!trimmed) return '';
  try {
    return new URL(trimmed).toString();
  } catch {
    return '';
  }
};
const cleanMessageLimit = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

const timingSafeEqual = (a, b) => {
  const bufA = crypto.createHash('sha256').update(String(a)).digest();
  const bufB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(bufA, bufB);
};

const requireAdmin = (request, response, next) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return response.status(500).json({ error: 'ADMIN_PASSWORD is not configured on the server.' });
  const header = request.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !timingSafeEqual(token, adminPassword)) {
    return response.status(401).json({ error: 'Invalid admin password.' });
  }
  return next();
};

const requireDatabase = (request, response, next) => {
  if (!hasDatabase()) return response.status(500).json({ error: 'DATABASE_URL is not configured on the server.' });
  return next();
};

const requestChatCompletion = async (provider, systemPrompt, messages) => {
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key is not configured on the server.');
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
    const body = {
      model,
      system: systemPrompt,
      max_tokens: 1024,
      messages: messages.map(({ role, content }) => ({ role, content: String(content || '') }))
    };
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Anthropic request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const result = await response.json();
    return {
      message: result.content?.[0]?.text || 'I could not produce a response.',
      model,
      inputTokens: result.usage?.input_tokens || 0,
      outputTokens: result.usage?.output_tokens || 0
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured on the server.');
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const result = await response.json();
  return {
    message: result.choices?.[0]?.message?.content || 'I could not produce a response.',
    model,
    inputTokens: result.usage?.prompt_tokens || 0,
    outputTokens: result.usage?.completion_tokens || 0
  };
};

const embedCodeFor = (id) => `<script src="${publicBaseUrl}/widget.js" data-widget-id="${id}" async></script>`;
const withStats = (widget) => ({
  ...widget,
  embedCode: embedCodeFor(widget.id),
  hoursSaved: Math.round(((widget.messagesUsed * minutesSavedPerMessage) / 60) * 10) / 10
});

app.get('/health', (_request, response) => response.json({ ok: true, database: hasDatabase() }));

// --- Admin routes: password-gated, used by the factory dashboard to provision and manage customer widgets. ---

app.post('/api/admin/widgets', requireAdmin, requireDatabase, async (request, response) => {
  const body = request.body || {};
  if (!validHex(body.primaryColor) || !validHex(body.textColor)) {
    return response.status(400).json({ error: 'Colors must be six-digit hex values.' });
  }
  const provider = validProvider(body.provider) ? body.provider.toLowerCase() : defaultLlmProvider;
  const id = crypto.randomUUID();
  const widget = await insertWidget({
    id,
    provider,
    name: cleanText(body.name, 'Assistant', 60),
    systemPrompt: cleanText(body.systemPrompt, 'You are a helpful assistant.', 4000),
    primaryColor: body.primaryColor,
    textColor: body.textColor,
    websiteUrl: cleanWebsiteUrl(body.websiteUrl),
    openingMessage: cleanText(body.openingMessage, '', 500),
    messageLimit: cleanMessageLimit(body.messageLimit)
  });
  return response.status(201).json(withStats(widget));
});

app.get('/api/admin/widgets', requireAdmin, requireDatabase, async (_request, response) => {
  const widgets = await listWidgets();
  return response.json(widgets.map(withStats));
});

app.patch('/api/admin/widgets/:id', requireAdmin, requireDatabase, async (request, response) => {
  const body = request.body || {};
  const patch = {};
  if (body.name !== undefined) patch.name = cleanText(body.name, 'Assistant', 60);
  if (body.systemPrompt !== undefined) patch.systemPrompt = cleanText(body.systemPrompt, 'You are a helpful assistant.', 4000);
  if (body.websiteUrl !== undefined) patch.websiteUrl = cleanWebsiteUrl(body.websiteUrl);
  if (body.openingMessage !== undefined) patch.openingMessage = cleanText(body.openingMessage, '', 500);
  if (body.messageLimit !== undefined) patch.messageLimit = cleanMessageLimit(body.messageLimit);
  if (body.primaryColor !== undefined && validHex(body.primaryColor)) patch.primaryColor = body.primaryColor;
  if (body.textColor !== undefined && validHex(body.textColor)) patch.textColor = body.textColor;
  const widget = await updateWidget(request.params.id, patch);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  return response.json(withStats(widget));
});

app.delete('/api/admin/widgets/:id', requireAdmin, requireDatabase, async (request, response) => {
  await deleteWidget(request.params.id);
  return response.status(204).end();
});

app.post('/api/admin/widgets/:id/reset-usage', requireAdmin, requireDatabase, async (request, response) => {
  const widget = await resetUsage(request.params.id);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  return response.json(withStats(widget));
});

// --- Public routes: called by widget.js from customer sites, so no admin auth here. ---

app.get('/api/widgets/:id', requireDatabase, async (request, response) => {
  const widget = await getWidget(request.params.id);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  const { systemPrompt: _systemPrompt, provider: _provider, messageLimit: _messageLimit, messagesUsed: _messagesUsed, costUsd: _costUsd, ...publicConfig } = widget;
  return response.json(publicConfig);
});

app.post('/api/chat', requireDatabase, async (request, response) => {
  const { widgetId, messages } = request.body || {};
  if (!widgetId || !Array.isArray(messages) || messages.length === 0) return response.status(400).json({ error: 'A valid widgetId and messages are required.' });
  if (messages.length > 30) return response.status(400).json({ error: 'Conversation is too long.' });

  const widget = await getWidget(widgetId);
  if (!widget) return response.status(400).json({ error: 'A valid widgetId and messages are required.' });
  if (widget.messageLimit !== null && widget.messagesUsed >= widget.messageLimit) {
    return response.status(402).json({ error: 'This widget has reached its message limit. Contact the site owner to increase it.' });
  }

  const safeMessages = messages.map(({ role, content }) => ({ role: role === 'assistant' ? 'assistant' : 'user', content: String(content || '').slice(0, 4000) }));
  try {
    const completion = await requestChatCompletion(widget.provider || defaultLlmProvider, widget.systemPrompt, safeMessages);
    const costUsd = estimateCostUsd(completion.model, completion.inputTokens, completion.outputTokens);
    await incrementUsage(widget.id, costUsd);
    return response.json({ message: completion.message });
  } catch (error) {
    const message = error.message || 'Unable to reach the LLM provider.';
    return response.status(502).json({ error: message });
  }
});

app.get('/widget.js', async (_request, response) => {
  response.type('application/javascript').send(await fs.readFile(widgetPath, 'utf8'));
});

export { publicBaseUrl };
export default app;
