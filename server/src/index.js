import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 3001);
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const widgets = new Map();
const widgetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/widget.js');

app.use(cors());
app.use(express.json({ limit: '32kb' }));

const validHex = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
const cleanText = (value, fallback, max) => String(value || fallback).trim().slice(0, max);

app.get('/health', (_request, response) => response.json({ ok: true }));

app.post('/api/widgets', (request, response) => {
  const body = request.body || {};
  if (!validHex(body.primaryColor) || !validHex(body.textColor)) {
    return response.status(400).json({ error: 'Colors must be six-digit hex values.' });
  }

  const id = crypto.randomUUID();
  const widget = {
    id,
    name: cleanText(body.name, 'Assistant', 60),
    systemPrompt: cleanText(body.systemPrompt, 'You are a helpful assistant.', 4000),
    primaryColor: body.primaryColor,
    textColor: body.textColor,
    createdAt: new Date().toISOString()
  };
  widgets.set(id, widget);
  return response.status(201).json({ ...widget, embedCode: `<script src="${publicBaseUrl}/widget.js" data-widget-id="${id}" async></script>` });
});

app.get('/api/widgets/:id', (request, response) => {
  const widget = widgets.get(request.params.id);
  if (!widget) return response.status(404).json({ error: 'Widget not found.' });
  const { systemPrompt: _systemPrompt, ...publicConfig } = widget;
  return response.json(publicConfig);
});

app.post('/api/chat', async (request, response) => {
  const { widgetId, messages } = request.body || {};
  const widget = widgets.get(widgetId);
  if (!widget || !Array.isArray(messages) || messages.length === 0) return response.status(400).json({ error: 'A valid widgetId and messages are required.' });
  if (messages.length > 30) return response.status(400).json({ error: 'Conversation is too long.' });

  const safeMessages = messages.map(({ role, content }) => ({ role: role === 'assistant' ? 'assistant' : 'user', content: String(content || '').slice(0, 4000) }));
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: 'The LLM API key is not configured on the server.' });

  try {
    const llmResponse = await fetch(`${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.7, messages: [{ role: 'system', content: widget.systemPrompt }, ...safeMessages] })
    });
    if (!llmResponse.ok) return response.status(502).json({ error: 'The LLM provider returned an error.' });
    const result = await llmResponse.json();
    return response.json({ message: result.choices?.[0]?.message?.content || 'I could not produce a response.' });
  } catch {
    return response.status(502).json({ error: 'Unable to reach the LLM provider.' });
  }
});

app.get('/widget.js', async (_request, response) => {
  response.type('application/javascript').send(await fs.readFile(widgetPath, 'utf8'));
});

app.listen(port, () => console.log(`Widget Factory API listening on ${publicBaseUrl}`));