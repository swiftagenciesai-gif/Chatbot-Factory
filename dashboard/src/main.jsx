import React, { useEffect, useState } from 'react';
import { Check, Clipboard, Code2, LogOut, MessageCircle, Pencil, RotateCcw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const initial = {
  name: 'Nova',
  systemPrompt: 'You are a thoughtful, concise customer support assistant. Be warm, useful, and honest when you do not know something.',
  primaryColor: '#D95D39',
  textColor: '#FFFFFF',
  websiteUrl: '',
  openingMessage: 'Hi! How can I help you today?',
  messageLimit: '',
  capabilities: []
};

// Matches CAPABILITIES in server/src/app.js - keep the two in sync.
const CAPABILITIES = [
  'Lead generation',
  'Rapid customer support',
  'Appointment booking',
  'Ongoing support and optimization',
  'Sophisticated AI behavior',
  'AI-to-AI workflows',
  'Advanced chatbot management'
];

const TOKEN_KEY = 'chatbotFactoryAdminToken';
const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(String(value || ''));

const adminFetch = (token, url, options = {}) => fetch(url, {
  ...options,
  headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
});

function LoginScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setChecking(true);
    setError('');
    try {
      const response = await adminFetch(password, '/api/admin/widgets');
      if (response.status === 401) throw new Error('Incorrect password.');
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not reach the admin API.');
      const widgets = await response.json();
      onUnlock(password, widgets);
    } catch (err) {
      setError(err.message || 'Could not unlock the admin panel.');
    } finally {
      setChecking(false);
    }
  };

  return <main className="min-h-screen flex items-center justify-center bg-[#f5f1eb] text-[#18212b]">
    <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-[#e7e0d4] bg-white p-8 shadow-sm">
      <div className="flex items-center gap-3"><div className="brand-mark"><Sparkles size={18} /></div><span className="font-bold tracking-tight">widget<span className="text-[#d95d39]">/</span>factory</span></div>
      <Field label="Admin password" hint="Required to manage widgets"><input type="password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
      <button className="primary-button w-full justify-center" type="submit" disabled={checking}>{checking ? 'Checking...' : 'Unlock admin panel'}</button>
      {error && <p className="text-sm font-semibold text-[#b3261e]">{error}</p>}
    </form>
  </main>;
}

function App({ token, initialWidgets, onLogout }) {
  const [form, setForm] = useState(initial);
  const [embedCode, setEmbedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const [widgets, setWidgets] = useState(initialWidgets);
  const [widgetsError, setWidgetsError] = useState('');
  const [limitDrafts, setLimitDrafts] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editStatus, setEditStatus] = useState('');
  const [testChatId, setTestChatId] = useState(null);

  const loadWidgets = async () => {
    try {
      const response = await adminFetch(token, '/api/admin/widgets');
      if (response.status === 401) return onLogout();
      if (!response.ok) throw new Error('Could not load widgets.');
      setWidgets(await response.json());
      setWidgetsError('');
    } catch (error) { setWidgetsError(error.message || 'Could not load widgets.'); }
  };

  useEffect(() => { loadWidgets(); }, []);

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
  const toggleCapability = (capability) => setForm((current) => ({
    ...current,
    capabilities: current.capabilities.includes(capability)
      ? current.capabilities.filter((item) => item !== capability)
      : [...current.capabilities, capability]
  }));
  const createWidget = async (event) => {
    event.preventDefault();
    if (!isValidHexColor(form.primaryColor) || !isValidHexColor(form.textColor)) {
      setStatus('Colors must be valid six-digit hex values like #D95D39.');
      return;
    }
    setStatus('Creating widget...');
    try {
      const response = await adminFetch(token, '/api/admin/widgets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (response.status === 401) return onLogout();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEmbedCode(data.embedCode);
      setStatus('Widget ready to ship.');
      loadWidgets();
    } catch (error) { setStatus(error.message || 'Could not create widget.'); }
  };
  const copy = async () => { await navigator.clipboard.writeText(embedCode); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const copyText = async (text) => { await navigator.clipboard.writeText(text); };

  const saveLimit = async (id) => {
    const raw = limitDrafts[id];
    const messageLimit = raw === undefined ? undefined : (raw.trim() === '' ? null : Number(raw));
    const response = await adminFetch(token, `/api/admin/widgets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageLimit }) });
    if (response.status === 401) return onLogout();
    if (response.ok) loadWidgets();
  };

  const startEdit = (widget) => {
    setEditingId(widget.id);
    setTestChatId(null);
    setEditStatus('');
    setEditDraft({
      name: widget.name,
      systemPrompt: widget.systemPrompt || '',
      websiteUrl: widget.websiteUrl || '',
      openingMessage: widget.openingMessage || '',
      primaryColor: widget.primaryColor,
      textColor: widget.textColor,
      capabilities: widget.capabilities || []
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditDraft(null); };
  const updateEditDraft = (event) => setEditDraft({ ...editDraft, [event.target.name]: event.target.value });
  const toggleEditCapability = (capability) => setEditDraft((current) => ({
    ...current,
    capabilities: current.capabilities.includes(capability)
      ? current.capabilities.filter((item) => item !== capability)
      : [...current.capabilities, capability]
  }));
  const saveEdit = async (id) => {
    if (!isValidHexColor(editDraft.primaryColor) || !isValidHexColor(editDraft.textColor)) {
      setEditStatus('Colors must be valid six-digit hex values like #D95D39.');
      return;
    }
    setEditStatus('Saving...');
    try {
      const response = await adminFetch(token, `/api/admin/widgets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editDraft) });
      if (response.status === 401) return onLogout();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      cancelEdit();
      loadWidgets();
    } catch (error) { setEditStatus(error.message || 'Could not save changes.'); }
  };

  const removeWidget = async (id) => {
    if (!window.confirm('Delete this widget? Its embed will stop working immediately.')) return;
    const response = await adminFetch(token, `/api/admin/widgets/${id}`, { method: 'DELETE' });
    if (response.status === 401) return onLogout();
    loadWidgets();
  };

  const resetWidgetUsage = async (id) => {
    if (!window.confirm('Reset messages used, cost, and hours saved back to zero for this widget? This cannot be undone.')) return;
    const response = await adminFetch(token, `/api/admin/widgets/${id}/reset-usage`, { method: 'POST' });
    if (response.status === 401) return onLogout();
    if (response.ok) loadWidgets();
  };

  return <main className="min-h-screen bg-[#f5f1eb] text-[#18212b]">
    <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
      <div className="flex items-center gap-3"><div className="brand-mark"><Sparkles size={18} /></div><span className="font-bold tracking-tight">widget<span className="text-[#d95d39]">/</span>factory</span></div>
      <div className="flex items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7d817f]">Configuration studio</span>
        <button type="button" className="copy-button" onClick={onLogout}><LogOut size={14} /> Log out</button>
      </div>
    </nav>
    <div className="mx-auto grid max-w-7xl gap-10 px-6 pb-16 lg:grid-cols-[1fr_0.9fr] lg:px-10">
      <section className="pt-8 lg:pt-16">
        <p className="eyebrow">Ship a helpful presence</p>
        <h1 className="display mt-4 max-w-xl">Your AI, in every conversation.</h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-[#69716f]">Shape the personality and palette. We will hand you one clean script tag for any website.</p>
        <form onSubmit={createWidget} noValidate className="mt-10 space-y-7">
          <p className="text-xs text-[#7d817f]">All widgets currently run on Claude Haiku 4.5.</p>
          <Field label="Widget name" hint="Shown in the chat header"><input name="name" value={form.name} onChange={update} required /></Field>
          <Field label="System prompt" hint="Sets the assistant's behavior"><textarea name="systemPrompt" rows="4" value={form.systemPrompt} onChange={update} required /></Field>
          <Field label="Website URL" hint="Where this widget will be embedded"><input name="websiteUrl" type="url" placeholder="https://example.com" value={form.websiteUrl} onChange={update} /></Field>
          <Field label="What would you like the opening message to be?" hint="Shown as the first bubble when chat opens; blank = none"><textarea name="openingMessage" rows="2" placeholder="Hi! How can I help you today?" value={form.openingMessage} onChange={update} /></Field>
          <Field label="Message limit" hint="Blank = unlimited"><input name="messageLimit" type="number" min="0" placeholder="e.g. 500" value={form.messageLimit} onChange={update} /></Field>
          <CapabilityPicker label="Capabilities" hint="What this widget was built for - reference only" value={form.capabilities} onToggle={toggleCapability} />
          <div className="grid gap-5 sm:grid-cols-2"><ColorField label="Primary color" name="primaryColor" value={form.primaryColor} onChange={handleColorChange} /><ColorField label="Text color" name="textColor" value={form.textColor} onChange={handleColorChange} /></div>
          <button className="primary-button" type="submit"><Code2 size={18} /> Generate embed code</button>
          {status && <p className="text-sm font-semibold text-[#69716f]">{status}</p>}
        </form>
        {embedCode && <div className="code-panel mt-9"><div className="mb-3 flex items-center justify-between"><span className="eyebrow">Your embed</span><button className="copy-button" onClick={copy}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy'}</button></div><textarea readOnly value={embedCode} aria-label="Generated embed code" /></div>}
        <div className="mt-12">
          <div className="mb-3 flex items-center justify-between"><span className="eyebrow">Admin panel &middot; customer widgets</span></div>
          <p className="mb-4 text-sm text-[#69716f]">Widgets are stored in Postgres and persist across redeploys. Set a message limit per widget to cap what each customer can cost on your LLM key. Cost and hours-saved figures are estimates (based on token usage and 4 min/message respectively), not billing-accurate.</p>
          {widgetsError && <p className="text-sm font-semibold text-[#b3261e]">{widgetsError}</p>}
          {!widgetsError && widgets.length === 0 && <p className="text-sm text-[#69716f]">No widgets yet.</p>}
          <ul className="space-y-3">
            {widgets.map((widget) => (
              <li key={widget.id} className="widget-row rounded-xl border border-[#e7e0d4] bg-white px-4 py-3">
                {editingId === widget.id ? (
                  <div className="space-y-4 py-2">
                    <Field label="Widget name" hint="Shown in the chat header"><input name="name" value={editDraft.name} onChange={updateEditDraft} required /></Field>
                    <Field label="System prompt" hint="Sets the assistant's behavior"><textarea name="systemPrompt" rows="4" value={editDraft.systemPrompt} onChange={updateEditDraft} required /></Field>
                    <Field label="Website URL" hint="Where this widget will be embedded"><input name="websiteUrl" type="url" placeholder="https://example.com" value={editDraft.websiteUrl} onChange={updateEditDraft} /></Field>
                    <Field label="What would you like the opening message to be?" hint="Shown as the first bubble when chat opens; blank = none"><textarea name="openingMessage" rows="2" value={editDraft.openingMessage} onChange={updateEditDraft} /></Field>
                    <CapabilityPicker label="Capabilities" hint="What this widget was built for - reference only" value={editDraft.capabilities} onToggle={toggleEditCapability} />
                    <div className="grid gap-5 sm:grid-cols-2"><ColorField label="Primary color" name="primaryColor" value={editDraft.primaryColor} onChange={updateEditDraft} /><ColorField label="Text color" name="textColor" value={editDraft.textColor} onChange={updateEditDraft} /></div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="primary-button" onClick={() => saveEdit(widget.id)}><Check size={15} /> Save changes</button>
                      <button type="button" className="copy-button" onClick={cancelEdit}><X size={14} /> Cancel</button>
                      {editStatus && <p className="text-sm font-semibold text-[#69716f]">{editStatus}</p>}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{widget.name}</p>
                        <p className="truncate text-xs text-[#7d817f]">{widget.websiteUrl || 'No website URL set'}</p>
                        <p className="truncate text-xs text-[#7d817f]">{widget.messagesUsed} messages used{widget.messageLimit != null ? ` / ${widget.messageLimit}` : ' (unlimited)'}</p>
                        <p className="truncate text-xs text-[#7d817f]">~${widget.costUsd.toFixed(4)} cost &middot; ~{widget.hoursSaved}h saved</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <input
                          className="limit-input"
                          type="number"
                          min="0"
                          placeholder="Limit"
                          defaultValue={widget.messageLimit ?? ''}
                          onChange={(event) => setLimitDrafts((current) => ({ ...current, [widget.id]: event.target.value }))}
                        />
                        <button type="button" className="copy-button" onClick={() => saveLimit(widget.id)}>Save limit</button>
                        <button type="button" className="copy-button" onClick={() => startEdit(widget)}><Pencil size={14} /> Edit</button>
                        <button type="button" className="copy-button" onClick={() => setTestChatId(testChatId === widget.id ? null : widget.id)}><MessageCircle size={14} /> Test chat</button>
                        <button type="button" className="copy-button" onClick={() => resetWidgetUsage(widget.id)}><RotateCcw size={14} /> Reset usage</button>
                        <button type="button" className="copy-button" onClick={() => copyText(widget.embedCode)}><Clipboard size={14} /> Copy</button>
                        <button type="button" className="copy-button" onClick={() => removeWidget(widget.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                    {widget.capabilities && widget.capabilities.length > 0 && (
                      <p className="mt-2 flex flex-wrap gap-1">
                        {widget.capabilities.map((capability) => <span key={capability} className="capability-tag">{capability}</span>)}
                      </p>
                    )}
                  </div>
                )}
                {testChatId === widget.id && editingId !== widget.id && (
                  <TestChatPanel token={token} widget={widget} onLogout={onLogout} onSent={loadWidgets} />
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="preview-wrap lg:pt-20"><div className="preview-label"><span className="live-dot" /> Live preview</div><div className="preview-canvas"><div className="site-lines"><span /><span /><span /></div><div className="fake-site-title">A quieter way to get help.</div><div className="fake-site-copy">Good support should feel close, clear, and human.</div><div className="preview-widget"><div className="preview-header" style={{ backgroundColor: form.primaryColor, color: form.textColor }}><span>{form.name || 'Assistant'}</span><span>×</span></div><div className="preview-messages"><div className="preview-bubble assistant-bubble">{form.openingMessage || `Hi, I'm ${form.name || 'your assistant'}. How can I help?`}</div><div className="preview-bubble user-bubble" style={{ backgroundColor: form.primaryColor, color: form.textColor }}>Tell me more</div></div><div className="preview-input">Ask a question... <span>↑</span></div></div><div className="preview-fab" style={{ backgroundColor: form.primaryColor, color: form.textColor }}><MessageCircle size={23} /></div></div></section>
    </div>
  </main>;
}

function TestChatPanel({ token, widget, onLogout, onSent }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (event) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy) return;
    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const response = await adminFetch(token, `/api/admin/widgets/${widget.id}/test-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages })
      });
      if (response.status === 401) return onLogout();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessages([...nextMessages, { role: 'assistant', content: data.message }]);
      onSent();
    } catch (err) {
      setError(err.message || 'Could not reach the model.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="test-chat">
    <p className="mb-2 text-xs text-[#7d817f]">Test messages here use your real API key and count toward this widget's cost, but not toward its message limit or usage alerts.</p>
    <div className="test-chat-messages">
      {messages.length === 0 && <p className="text-xs text-[#7d817f]">Send a message to see how {widget.name} responds with its current prompt.</p>}
      {messages.map((message, index) => (
        <div key={index} className={`test-chat-bubble ${message.role}`}>{message.content}</div>
      ))}
      {busy && <div className="test-chat-bubble assistant">...</div>}
    </div>
    <form onSubmit={send} className="flex gap-2">
      <input className="flex-1" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a test message..." />
      <button type="submit" className="copy-button" disabled={busy}><Send size={14} /></button>
    </form>
    {error && <p className="mt-2 text-sm font-semibold text-[#b3261e]">{error}</p>}
  </div>;
}

function CapabilityPicker({ label, hint, value, onToggle }) {
  return <div className="field">
    <span className="flex justify-between"><strong>{label}</strong><small>{hint}</small></span>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {CAPABILITIES.map((capability) => (
        <label key={capability} className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={value.includes(capability)} onChange={() => onToggle(capability)} />
          {capability}
        </label>
      ))}
    </div>
  </div>;
}

function Field({ label, hint, children }) { return <label className="field"><span className="flex justify-between"><strong>{label}</strong><small>{hint}</small></span>{children}</label>; }
function ColorField({ label, name, value, onChange }) {
  return <Field label={label} hint="Hex code"><div className="color-input"><span className="color-chip" style={{ backgroundColor: isValidHexColor(value) ? value : '#000000' }} aria-hidden="true" /><input name={name} value={value} onChange={onChange} title="Use a six-digit hex color like #D95D39" placeholder="#D95D39" /></div></Field>;
}

function Root() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [widgets, setWidgets] = useState(null);

  useEffect(() => {
    if (!token) return;
    adminFetch(token, '/api/admin/widgets').then((response) => {
      if (response.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken('');
        return;
      }
      return response.json().then(setWidgets);
    });
  }, []);

  const onUnlock = (password, initialWidgets) => {
    sessionStorage.setItem(TOKEN_KEY, password);
    setToken(password);
    setWidgets(initialWidgets);
  };
  const onLogout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setWidgets(null);
  };

  if (token && widgets === null) return <main className="min-h-screen flex items-center justify-center bg-[#f5f1eb] text-[#69716f]">Loading...</main>;
  if (!token) return <LoginScreen onUnlock={onUnlock} />;
  return <App token={token} initialWidgets={widgets} onLogout={onLogout} />;
}

createRoot(document.getElementById('root')).render(<Root />);
