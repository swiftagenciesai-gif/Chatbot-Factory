import React, { useState } from 'react';
import { Check, Clipboard, Code2, MessageCircle, Sparkles } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const initial = {
  name: 'Nova',
  systemPrompt: 'You are a thoughtful, concise customer support assistant. Be warm, useful, and honest when you do not know something.',
  primaryColor: '#D95D39',
  textColor: '#FFFFFF'
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
    const sanitized = value.trim();
    if (!isColorField(name)) {
      update(event);
      return;
    }
    const nextValue = sanitized.startsWith('#') ? sanitized : `#${sanitized}`;
    setForm((current) => ({ ...current, [name]: /^#[0-9A-Fa-f]{6}$/.test(nextValue) ? nextValue : current[name] }));
  };
  const createWidget = async (event) => {
    event.preventDefault();
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
        <form onSubmit={createWidget} className="mt-10 space-y-7">
          <Field label="Widget name" hint="Shown in the chat header"><input name="name" value={form.name} onChange={update} required /></Field>
          <Field label="System prompt" hint="Sets the assistant's behavior"><textarea name="systemPrompt" rows="4" value={form.systemPrompt} onChange={update} required /></Field>
          <div className="grid gap-5 sm:grid-cols-2"><ColorField label="Primary color" name="primaryColor" value={form.primaryColor} onChange={handleColorChange} /><ColorField label="Text color" name="textColor" value={form.textColor} onChange={handleColorChange} /></div>
          <button className="primary-button" type="submit"><Code2 size={18} /> Generate embed code</button>
          {status && <p className="text-sm font-semibold text-[#69716f]">{status}</p>}
        </form>
        {embedCode && <div className="code-panel mt-9"><div className="mb-3 flex items-center justify-between"><span className="eyebrow">Your embed</span><button className="copy-button" onClick={copy}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy'}</button></div><textarea readOnly value={embedCode} aria-label="Generated embed code" /></div>}
      </section>
      <section className="preview-wrap lg:pt-20"><div className="preview-label"><span className="live-dot" /> Live preview</div><div className="preview-canvas"><div className="site-lines"><span /><span /><span /></div><div className="fake-site-title">A quieter way to get help.</div><div className="fake-site-copy">Good support should feel close, clear, and human.</div><div className="preview-widget"><div className="preview-header" style={{ backgroundColor: form.primaryColor, color: form.textColor }}><span>{form.name || 'Assistant'}</span><span>×</span></div><div className="preview-messages"><div className="preview-bubble assistant-bubble">Hi, I’m {form.name || 'your assistant'}. How can I help?</div><div className="preview-bubble user-bubble" style={{ backgroundColor: form.primaryColor, color: form.textColor }}>Tell me more</div></div><div className="preview-input">Ask a question... <span>↑</span></div></div><div className="preview-fab" style={{ backgroundColor: form.primaryColor, color: form.textColor }}><MessageCircle size={23} /></div></div></section>
    </div>
  </main>;
}

function Field({ label, hint, children }) { return <label className="field"><span className="flex justify-between"><strong>{label}</strong><small>{hint}</small></span>{children}</label>; }
function ColorField({ label, name, value, onChange }) { return <Field label={label} hint="Hex code"><div className="color-input"><input type="color" value={value} onChange={onChange} name={name} /><input name={name} value={value} onChange={onChange} title="Use a six-digit hex color like #D95D39" required /></div></Field>; }

createRoot(document.getElementById('root')).render(<App />);