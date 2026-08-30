// Best-effort usage-threshold notifications. Set ALERT_WEBHOOK_URL to a
// Slack or Discord incoming webhook URL (both accept this JSON shape - Slack
// reads "text", Discord reads "content") to get pinged when a widget crosses
// 75%, 90%, or 95% of its message limit. If it's unset, this is a silent
// no-op - notifications are opt-in.
export const sendUsageAlert = async ({ widget, messagesUsed, percentage, threshold }) => {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const text = `"${widget.name}" hit ${threshold}% of its message limit (${messagesUsed}/${widget.messageLimit} messages, ~$${widget.costUsd.toFixed(2)} so far).`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        content: text,
        widgetId: widget.id,
        widgetName: widget.name,
        messagesUsed,
        messageLimit: widget.messageLimit,
        percentage,
        threshold
      })
    });
  } catch {
    // A failed notification should never break the chat response it rode in on.
  }
};
