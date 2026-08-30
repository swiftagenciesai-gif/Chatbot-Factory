import React, { useState } from 'react';
import { Check, Clipboard, Code2, MessageCircle, Sparkles } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const initial = {
  provider: 'anthropic',
  name: 'Nova',
  systemPrompt: 'You are a thoughtful, concise customer support assistant. Be warm, useful, and honest when you do not know something.',
  primaryColor: '#D95D39',
  textColor: '#FFFFFF',
  websiteUrl: ''
};

const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(String(value || ''));
const isValidWebsiteUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

function App() {
  const [form, setForm] = useState(initial);
  const [embedCode, setEmbedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');

  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const isColorField = (name) => name === 'primaryColor' || name === 'textColor';
  const handleColorChange = (event) => {
    const { name, value } = event.target;
    if (!isColorField(name)) {
      update(event);
      return;
    }
    const sanitized = String(value || '').trim();
    const nextValue = sanitized.startsWith('#') ? sanitized : `#${sanitized}`;
    setForm((current) => ({ ...current, [name]: nextValue }));
  };
  const createWidget = async (event) => {
    event.preventDefault();
    if (!isValidHexColor(form.primaryColor) || !isValidHexColor(form.textColor)) {
      setStatus('Colors must be valid six-digit hex values like #D95D39.');
      return;
    }
    if (!isValidWebsiteUrl(form.websiteUrl)) {
      setStatus('Enter the full website URL where this widget will be embedded, e.g. https://example.com.');
      return;
    }
    setStatus('Creating widget...');
    try {
      const response = await fetch('/api/widgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEmbedCode(data.embedCode);
      setStatus('Widget ready to ship.');
    } catch (error) { setStatus(error.message || 'Could not create widget.'); }
  };
  const copy = async () => { await navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  return <main className="min-h-screen bg-[#f5f1eb] text-[#18212b]">
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
      <div className="flex items-center gap-3"><div className="brand-mark"><Sparkles size={18} /></div><span className="font-bold tracking-tight">widget<span className="text-[#d95d39]">/</span>factory</span></div>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d817f]">Configuration studio</span>
    </nav>
    <div className="mx-auto grid max-w-7xl gap-10 px-6 pb-16 lg:grid-cols-[1fr_0.9fr] lg:px-10">
      <section className="pt-8 lg:pt-16">
        <p className="eyebrow">Ship a helpful presence</p>
        <h1 className="display mt-4 max-w-xl">Your AI, in every conversation.</h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-[#69716f]">Shape the personality and palette. We will hand you one clean script tag for any website.</p>
        <form onSubmit={createWidget} noValidate className="mt-10 space-y-7">
          <Field label="AI provider" hint="Model backend"><select name="provider" value={form.provider} onChange={update}><option value="anthropic">Claude (Anthropic)</option><option value="openai">OpenAI</option></select></Field>
          <Field label="Widget name" hint="Shown in the chat header"><input name="name" value={form.name} onChange={update} required /></Field>
          <Field label="Website URL" hint="Where this widget will be embedded"><input type="url" name="websiteUrl" value={form.websiteUrl} onChange={update} placeholder="https://example.com" required /></Field>
          <Field label="System prompt" hint="Sets the assistant's behavior"><textarea name="systemPrompt" rows="4" value={form.systemPrompt} onChange={update} required /></Field>
          <div className="grid gap-5 sm:grid-cols-2"><ColorField label="Primary color" name="primaryColor" value={form.primaryColor} onChange={handleColorChange} /><ColorField label="Text color" name="textColor" value={form.textColor} onChange={handleColorChange} /></div>
          <button className="primary-button" type="submit"><Code2 size={18} /> Generate embed code</button>
          {status && <p className="text-sm font-semibold text-[#69716f]">{status}</p>}
        </form>
        {embedCode && <div className="code-panel mt-9"><div className="mb-3 flex items-center justify-between"><span className="eyebrow">Your embed</span><button className="copy-button" onClick={copy}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy'}</button></div><textarea readOnly value={embedCode} aria-label="Generated embed code" /><p className="mt-3 text-sm text-[#69716f]">Paste this anywhere in the <code>&lt;head&gt;</code> of {form.websiteUrl || 'your site'} — nothing else to configure. It will load, talk to this API, and respond using your configured key.</p></div>}
      </section>
      <section className="preview-wrap lg:pt-20"><div className="preview-label"><span className="live-dot" /> Live preview</div><div className="preview-canvas"><div className="site-lines"><span /><span /><span /></div><div className="fake-site-title">A quieter way to get help.</div><div className="fake-site-copy">Good support should feel close, clear, and human.</div><div className="preview-widget"><div className="preview-header" style={{ backgroundColor: form.primaryColor, color: form.textColor }}><span>{form.name || 'Assistant'}</span><span>×</span></div><div className="preview-messages"><div className="preview-bubble assistant-bubble">Hi, I’m {form.name || 'your assistant'}. How can I help?</div><div className="preview-bubble user-bubble" style={{ backgroundColor: form.primaryColor, color: form.textColor }}>Tell me more</div></div><div className="preview-input">Ask a question... <span>↑</span></div></div><div className="preview-fab" style={{ backgroundColor: form.primaryColor, color: form.textColor }}><MessageCircle size={23} /></div></div></section>
    </div>
  </main>;
}

function Field({ label, hint, children }) { return <label className="field"><span className="flex justify-between"><strong>{label}</strong><small>{hint}</small></span>{children}</label>; }
function ColorField({ label, name, value, onChange }) {
  return <Field label={label} hint="Hex code"><div className="color-input"><span className="color-chip" style={{ backgroundColor: isValidHexColor(value) ? value : '#000000' }} aria-hidden="true" /><input name={name} value={value} onChange={onChange} title="Use a six-digit hex color like #D95D39" placeholder="#D95D39" /></div></Field>;
}

createRoot(document.getElementById('root')).render(<App />);