(function () {
  'use strict';
  var script = document.currentScript;
  var widgetId = script && script.dataset.widgetId;
  if (!widgetId) return;
  var apiBase = new URL(script.src).origin;
  var host;
  var root;
  var state = { messages: [], config: null, open: false, busy: false };

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text) node.textContent = text;
    return node;
  }

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.setAttribute('data-ai-widget', widgetId);
    document.body.appendChild(host);
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    fetch(apiBase + '/api/widgets/' + encodeURIComponent(widgetId)).then(function (res) { return res.json(); }).then(function (config) {
      if (!config.id) throw new Error('Widget config unavailable');
      state.config = config;
      render();
    }).catch(function () { /* A failed config should not disturb the host page. */ });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });

  function render() {
    var config = state.config;
    root.innerHTML = '<style>' +
      ':host{all:initial;font-family:ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}' +
      '.fab{position:fixed;right:24px;bottom:24px;width:58px;height:58px;border:0;border-radius:50%;background:' + config.primaryColor + ';color:' + config.textColor + ';font-size:24px;cursor:pointer;box-shadow:0 8px 24px #0003;z-index:2147483647}' +
      '.panel{position:fixed;right:24px;bottom:94px;width:min(360px,calc(100vw - 32px));height:520px;display:' + (state.open ? 'flex' : 'none') + ';flex-direction:column;overflow:hidden;background:#fff;color:#17202a;border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 18px 50px #0002;z-index:2147483647}' +
      '.head{padding:16px;background:' + config.primaryColor + ';color:' + config.textColor + ';font-weight:700;display:flex;justify-content:space-between}.close{border:0;background:transparent;color:inherit;font-size:20px;cursor:pointer}.messages{flex:1;padding:14px;overflow:auto;background:#f8fafc}.bubble{max-width:82%;padding:10px 12px;margin:0 0 10px;border-radius:12px;white-space:pre-wrap;line-height:1.4;font-size:14px}.user{margin-left:auto;background:' + config.primaryColor + ';color:' + config.textColor + '}.assistant{background:#e9eef2;color:#17202a}.form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb}.input{min-width:0;flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit}.send{border:0;border-radius:8px;padding:0 14px;background:' + config.primaryColor + ';color:' + config.textColor + ';font-weight:700;cursor:pointer}' +
      '</style>';
    var panel = el('section', { class: 'panel', 'aria-label': config.name + ' chat' });
    var head = el('header', { class: 'head' });
    head.append(el('span', {}, config.name), el('button', { class: 'close', 'aria-label': 'Close chat' }, '×'));
    head.lastChild.onclick = function () { state.open = false; render(); };
    var messages = el('div', { class: 'messages' });
    state.messages.forEach(function (message) { messages.appendChild(el('div', { class: 'bubble ' + message.role }, message.content)); });
    var form = el('form', { class: 'form' });
    var input = el('input', { class: 'input', placeholder: 'Ask a question...', 'aria-label': 'Message' });
    var send = el('button', { class: 'send', type: 'submit' }, state.busy ? '...' : 'Send');
    form.append(input, send);
    form.onsubmit = function (event) { event.preventDefault(); sendMessage(input); };
    panel.append(head, messages, form);
    var fab = el('button', { class: 'fab', 'aria-label': state.open ? 'Close chat' : 'Open chat' }, state.open ? '×' : '✦');
    fab.onclick = function () { state.open = !state.open; render(); };
    root.append(panel, fab);
    if (state.open) input.focus();
  }

  function sendMessage(input) {
    var content = input.value.trim();
    if (!content || state.busy) return;
    state.messages.push({ role: 'user', content: content });
    state.busy = true;
    render();
    fetch(apiBase + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ widgetId: widgetId, messages: state.messages }) })
      .then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data.error); return data; }); })
      .then(function (data) { state.messages.push({ role: 'assistant', content: data.message }); })
      .catch(function (error) { state.messages.push({ role: 'assistant', content: error.message || 'Something went wrong.' }); })
      .finally(function () { state.busy = false; render(); });
  }
}());