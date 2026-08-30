(function () {
  'use strict';
  var script = document.currentScript;
  var widgetId = script && script.dataset.widgetId;
  if (!widgetId) return;
  var apiBase = new URL(script.src).origin;
  var host;
  var root;
  var state = { messages: [], config: null, open: false, busy: false };

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatContent(text) {
    var escaped = escapeHtml(text);
    var bolded = escaped.replace(/\*\*([^*<>]+)\*\*/g, '<strong>$1</strong>');
    return bolded.replace(/https?:\/\/[^\s<]+[^\s<.,)]/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
  }

  var closeIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var chatIcon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var sendIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  var botIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6"/><circle cx="9" cy="14" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.3" fill="currentColor" stroke="none"/></svg>';

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-ai-widget', widgetId);
    document.body.appendChild(host);
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    fetch(apiBase + '/api/widgets/' + encodeURIComponent(widgetId)).then(function (res) { return res.json(); }).then(function (config) {
      if (!config.id) throw new Error('Widget config unavailable');
      state.config = config;
      if (config.openingMessage) state.messages.push({ role: 'assistant', content: config.openingMessage });
      render();
    }).catch(function () { /* A failed config should not disturb the host page. */ });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  function render() {
    var config = state.config;
    var canSend = !state.busy;
    root.innerHTML = '<style>' +
      ':host{all:initial;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,ui-sans-serif,sans-serif}' +
      '*{box-sizing:border-box}' +
      '.fab{position:fixed;right:24px;bottom:24px;width:60px;height:60px;border:0;border-radius:50%;background:' + config.primaryColor + ';color:' + config.textColor + ';cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.22);z-index:2147483647;display:flex;align-items:center;justify-content:center;transition:transform .18s ease,box-shadow .18s ease}' +
      '.fab:hover{transform:scale(1.06);box-shadow:0 14px 36px rgba(0,0,0,.28)}' +
      '.panel{position:fixed;right:24px;bottom:96px;width:min(376px,calc(100vw - 32px));height:min(600px,calc(100vh - 140px));display:flex;flex-direction:column;overflow:hidden;background:#fff;color:#1a1d21;border-radius:22px;box-shadow:0 24px 64px rgba(15,15,20,.18),0 2px 8px rgba(15,15,20,.06);z-index:2147483647;' +
        'transform-origin:bottom right;transition:opacity .16s ease,transform .16s ease;' +
        (state.open ? 'opacity:1;transform:scale(1) translateY(0);pointer-events:auto' : 'opacity:0;transform:scale(.94) translateY(8px);pointer-events:none') + '}' +
      '.head{display:flex;align-items:center;gap:11px;padding:16px 16px;background:' + config.primaryColor + ';color:' + config.textColor + '}' +
      '.avatar{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.22)}' +
      '.head-text{flex:1;min-width:0}' +
      '.head-name{font-weight:600;font-size:14.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.head-status{display:flex;align-items:center;gap:5px;font-size:11.5px;opacity:.85;margin-top:1px}' +
      '.dot{width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 2px rgba(74,222,128,.35)}' +
      '.close{flex:none;border:0;background:rgba(255,255,255,.16);color:inherit;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease}' +
      '.close:hover{background:rgba(255,255,255,.3)}' +
      '.messages{flex:1;padding:16px;overflow-y:auto;background:#f7f7f9;display:flex;flex-direction:column;gap:10px}' +
      '.bubble{max-width:84%;padding:10px 14px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word;line-height:1.48;font-size:14.5px}' +
      '.bubble a{color:inherit;text-decoration:underline}' +
      '.bubble strong{font-weight:700}' +
      '.user{align-self:flex-end;background:' + config.primaryColor + ';color:' + config.textColor + ';border-bottom-right-radius:6px}' +
      '.assistant{align-self:flex-start;background:#fff;color:#1a1d21;border:1px solid #ececef;border-bottom-left-radius:6px;box-shadow:0 1px 2px rgba(15,15,20,.03)}' +
      '.typing{align-self:flex-start;display:flex;gap:4px;padding:13px 16px;background:#fff;border:1px solid #ececef;border-radius:18px;border-bottom-left-radius:6px}' +
      '.typing span{width:6px;height:6px;border-radius:50%;background:#b7bac0;animation:bounce 1.2s infinite ease-in-out}' +
      '.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}' +
      '@keyframes bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}' +
      '.form{display:flex;align-items:center;gap:8px;padding:12px;border-top:1px solid #ececef;background:#fff}' +
      '.input{min-width:0;flex:1;border:1px solid #e2e3e7;background:#f7f7f9;border-radius:22px;padding:11px 16px;font:inherit;font-size:14.5px;color:#1a1d21;outline:none;transition:border-color .15s ease,background .15s ease}' +
      '.input:focus{border-color:' + config.primaryColor + ';background:#fff}' +
      '.send{flex:none;border:0;width:38px;height:38px;border-radius:50%;background:' + config.primaryColor + ';color:' + config.textColor + ';cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .12s ease,opacity .12s ease}' +
      '.send:hover{transform:scale(1.05)}' +
      '.send:disabled{opacity:.4;cursor:not-allowed;transform:none}' +
      '</style>';
    var panel = el('section', { class: 'panel', 'aria-label': config.name + ' chat', role: 'dialog', 'aria-hidden': state.open ? 'false' : 'true' });

    var avatar = el('div', { class: 'avatar' }, botIcon);
    var headText = el('div', { class: 'head-text' },
      '<p class="head-name">' + escapeHtml(config.name) + '</p>' +
      '<p class="head-status"><span class="dot"></span>Online now</p>');
    var close = el('button', { class: 'close', 'aria-label': 'Close chat', type: 'button' }, closeIcon);
    close.onclick = function () { state.open = false; render(); };
    var head = el('header', { class: 'head' });
    head.append(avatar, headText, close);

    var messages = el('div', { class: 'messages' });
    state.messages.forEach(function (message) {
      messages.appendChild(el('div', { class: 'bubble ' + message.role }, formatContent(message.content)));
    });
    if (state.busy) {
      messages.appendChild(el('div', { class: 'typing', 'aria-label': 'Assistant is typing' }, '<span></span><span></span><span></span>'));
    }

    var form = el('form', { class: 'form' });
    var input = el('input', { class: 'input', placeholder: 'Type a message...', 'aria-label': 'Message', autocomplete: 'off' });
    input.value = state.draft || '';
    input.oninput = function () { state.draft = input.value; };
    var send = el('button', { class: 'send', type: 'submit', 'aria-label': 'Send message' }, sendIcon);
    if (!canSend) send.setAttribute('disabled', 'true');
    form.append(input, send);
    form.onsubmit = function (event) { event.preventDefault(); sendMessage(input); };

    panel.append(head, messages, form);

    var fab = el('button', { class: 'fab', 'aria-label': state.open ? 'Close chat' : 'Open chat', type: 'button' }, state.open ? closeIcon : chatIcon);
    fab.onclick = function () { state.open = !state.open; render(); };

    root.append(panel, fab);
    // Must happen after the panel is actually in the document - scrollHeight
    // on a still-detached element isn't reliably the final laid-out height.
    messages.scrollTop = messages.scrollHeight;
    if (state.open) input.focus();
  }

  function sendMessage(input) {
    var content = input.value.trim();
    if (!content || state.busy) return;
    state.messages.push({ role: 'user', content: content });
    state.draft = '';
    state.busy = true;
    render();
    fetch(apiBase + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ widgetId: widgetId, messages: state.messages }) })
      .then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.error); return data; }); })
      .then(function (data) { state.messages.push({ role: 'assistant', content: data.message }); })
      .catch(function (error) { state.messages.push({ role: 'assistant', content: error.message || 'Something went wrong.' }); })
      .finally(function () { state.busy = false; render(); });
  }
}());
