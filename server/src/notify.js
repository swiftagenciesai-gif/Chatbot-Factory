// Best-effort notifications. Set ALERT_WEBHOOK_URL to a Slack or Discord
// incoming webhook URL (both accept this JSON shape - Slack reads "text",
// Discord reads "content") to receive both usage alerts and failure alerts
// below. If it's unset, these are silent no-ops - notifications are opt-in.
const postWebhook = async (text, extra) => {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text, ...extra })
    });
  } catch {
    // A failed notification should never break the chat response it rode in on.
  }
};

// Fires when a widget crosses 75%, 90%, or 95% of its message limit.
export const sendUsageAlert = async ({ widget, messagesUsed, percentage, threshold }) => {
  const text = `"${widget.name}" hit ${threshold}% of its message limit (${messagesUsed}/${widget.messageLimit} messages, ~$${widget.costUsd.toFixed(2)} so far).`;
  await postWebhook(text, {
    kind: 'usage_threshold',
    widgetId: widget.id,
    widgetName: widget.name,
    messagesUsed,
    messageLimit: widget.messageLimit,
    percentage,
    threshold
  });
};

// Fires when /api/chat has failed several times in a row for one provider
// (e.g. an expired API key, a deprecated model, the provider being down) -
// the kind of outage that previously only surfaced when a customer
// complained or the operator happened to test the widget themselves.
export const sendFailureAlert = async ({ provider, consecutiveFailures, lastError }) => {
  const text = `Chatbot Factory: ${consecutiveFailures} ${provider} requests in a row have failed. Latest error: ${String(lastError).slice(0, 200)}`;
  await postWebhook(text, { kind: 'provider_failure', provider, consecutiveFailures, lastError: String(lastError).slice(0, 500) });
};
