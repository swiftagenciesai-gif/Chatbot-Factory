import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
app.set('trust proxy', true);
const port = Number(process.env.PORT || 3001);
const resolveBaseUrl = (request) => process.env.PUBLIC_BASE_URL || `${request.protocol}://${request.get('host')}`;
const widgets = new Map();
const widgetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/widget.js');
const defaultLlmProvider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const availableProviders = [process.env.ANTHROPIC_API_KEY && 'anthropic', process.env.OPENAI_API_KEY && 'openai'].filter(Boolean);
const demoProvider = availableProviders.includes(defaultLlmProvider) ? defaultLlmProvider : (availableProviders[0] || defaultLlmProvider);

const demoWidgetId = process.env.DEMO_WIDGET_ID || '1fcbebb0-effe-495e-b3af-6f1a33c6bb16';
widgets.set(demoWidgetId, {
  id: demoWidgetId,
  provider: demoProvider,
  name: 'Nova',
  systemPrompt: 'You are a thoughtful, concise customer support assistant. Be warm, useful, and honest when you do not know something.',
  primaryColor: '#D95D39',
  textColor: '#FFFFFF',
  authorizedOrigins: [],
  createdAt: new Date().toISOString()
});

const adminPassword = process.env.ADMIN_PASSWORD || 'NewGame';

app.use(cors());
app.use(express.json({ limit: '32kb' }));

const validHex = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
const cleanText = (value, fallback, max) => String(value || fallback).trim().slice(0, max);
const validProvider = (value) => ['openai', 'anthropic'].includes(String(value || '').toLowerCase());
const hostnameOf = (value) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
};
const validWebsiteUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const requestChatCompletion = async (provider, systemPrompt, messages) => {
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Anthropic API key is not configured on the server.');
    const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
    const body = {
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      system: systemPrompt,
      max_tokens: 1024,
      messages: messages.map(({ role, content }) => ({ role, content: String(content || '') }))
    };
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...(workspaceId ? { 'anthropic-workspace-id': workspaceId } : {})
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Anthropic request failed', response.status, detail);
      const failure = new Error(`Anthropic request failed (status ${response.status}).`);
      failure.status = response.status;
      failure.detail = detail;
      throw failure;
    }
    const result = await response.json();
    return result.content?.[0]?.text || 'I could not produce a response.';
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key is not configured on the server.');
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.7,
      messages: [{ role: 'system', content: systemPrompt }, ...messages]
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('OpenAI request failed', response.status, detail);
    const failure = new Error(`OpenAI request failed (status ${response.status}).`);
    failure.status = response.status;
    failure.detail = detail;
    throw failure;
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content || 'I could not produce a response.';
};

app.get('/health', (_request, response) => response.json({ ok: true }));

app.get('/api/debug-llm', async (request, response) => {
  const provider = validProvider(request.query.provider) ? request.query.provider.toLowerCase() : demoProvider;
  try {
    const message = await requestChatCompletion(provider, 'Reply with the single word: OK.', [{ role: 'user', content: 'ping' }]);
    return response.json({ ok: true, provider, message });
  } catch (error) {
    return response.status(502).json({ ok: false, provider, status: error.status || null, detail: error.detail || error.message });
  }
});

const requireAdmin = (request, response) => {
  if (String(request.body?.password || '') !== adminPassword) {
    response.status(401).json({ error: 'Incorrect admin password.' });
    return false;
  }
  return true;
};

app.post('/api/admin/origins/list', (request, response) => {
  if (!requireAdmin(request, response)) return;
  const widget = widgets.get(request.body?.widgetId || demoWidgetId);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  return response.json({ authorizedOrigins: widget.authorizedOrigins || [] });
});

app.post('/api/admin/origins/add', (request, response) => {
  if (!requireAdmin(request, response)) return;
  const widget = widgets.get(request.body?.widgetId || demoWidgetId);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  const url = String(request.body?.url || '').trim();
  if (!validWebsiteUrl(url)) return response.status(400).json({ error: 'Enter a valid URL, including https://.' });
  const host = hostnameOf(url);
  widget.authorizedOrigins = widget.authorizedOrigins || [];
  if (!widget.authorizedOrigins.some((existing) => hostnameOf(existing) === host)) {
    widget.authorizedOrigins.push(url);
  }
  return response.json({ authorizedOrigins: widget.authorizedOrigins });
});

app.post('/api/admin/origins/remove', (request, response) => {
  if (!requireAdmin(request, response)) return;
  const widget = widgets.get(request.body?.widgetId || demoWidgetId);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  const host = hostnameOf(String(request.body?.url || ''));
  widget.authorizedOrigins = (widget.authorizedOrigins || []).filter((existing) => hostnameOf(existing) !== host);
  return response.json({ authorizedOrigins: widget.authorizedOrigins });
});

app.post('/api/widgets', (request, response) => {
  const body = request.body || {};
  if (!validHex(body.primaryColor) || !validHex(body.textColor)) {
    return response.status(400).json({ error: 'Colors must be six-digit hex values.' });
  }
  if (!validWebsiteUrl(body.websiteUrl)) {
    return response.status(400).json({ error: 'A valid website URL (including https://) is required.' });
  }
  const provider = validProvider(body.provider) ? body.provider.toLowerCase() : defaultLlmProvider;

  const id = crypto.randomUUID();
  const websiteUrl = cleanText(body.websiteUrl, '', 2000);
  const widget = {
    id,
    provider,
    name: cleanText(body.name, 'Assistant', 60),
    systemPrompt: cleanText(body.systemPrompt, 'You are a helpful assistant.', 4000),
    primaryColor: body.primaryColor,
    textColor: body.textColor,
    websiteUrl,
    authorizedOrigins: [websiteUrl],
    createdAt: new Date().toISOString()
  };
  widgets.set(id, widget);
  const baseUrl = resolveBaseUrl(request);
  return response.status(201).json({ ...widget, embedCode: `<script src="${baseUrl}/widget.js" data-widget-id="${id}" async></script>` });
});

app.get('/api/widgets/:id', (request, response) => {
  const widget = widgets.get(request.params.id);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  const { systemPrompt: _systemPrompt, provider: _provider, websiteUrl: _websiteUrl, authorizedOrigins: _authorizedOrigins, ...publicConfig } = widget;
  return response.json(publicConfig);
});

app.post('/api/chat', async (request, response) => {
  const { widgetId, messages } = request.body || {};
  const widget = widgets.get(widgetId);
  if (!widget || !Array.isArray(messages) || messages.length === 0) return response.status(400).json({ error: 'A valid widgetId and messages are required.' });
  if (messages.length > 30) return response.status(400).json({ error: 'Conversation is too long.' });

  const originHeader = request.get('origin') || request.get('referer');
  const requestHost = originHeader ? hostnameOf(originHeader) : null;
  const authorizedOrigins = widget.authorizedOrigins || [];
  if (requestHost && authorizedOrigins.length > 0) {
    const selfHost = hostnameOf(resolveBaseUrl(request));
    const allowedHosts = authorizedOrigins.map(hostnameOf).filter(Boolean);
    if (requestHost !== selfHost && !allowedHosts.includes(requestHost)) {
      return response.status(403).json({ error: 'This widget is not authorized for this website.' });
    }
  }

  const safeMessages = messages.map(({ role, content }) => ({ role: role === 'assistant' ? 'assistant' : 'user', content: String(content || '').slice(0, 4000) }));
  try {
    const message = await requestChatCompletion(widget.provider || defaultLlmProvider, widget.systemPrompt, safeMessages);
    return response.json({ message });
  } catch (error) {
    const message = error.message || 'Unable to reach the LLM provider.';
    return response.status(502).json({ error: message });
  }
});

app.get('/widget.js', async (_request, response) => {
  response.type('application/javascript').send(await fs.readFile(widgetPath, 'utf8'));
});

if (!process.env.VERCEL) {
  const localBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
  app.listen(port, () => console.log(`Widget Factory API listening on ${localBaseUrl}`));
}

export default app;