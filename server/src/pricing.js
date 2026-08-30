// Rough, editable cost-per-token table, in USD per 1,000,000 tokens.
// These are estimates based on published rates at the time this was written -
// providers change pricing over time, so treat the resulting costUsd as an
// approximation for budgeting, not a billing-accurate figure. Update the
// numbers below if a provider changes its pricing.
const RATES = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'claude-sonnet-5': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-latest': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 }
};

// Used for any model not listed above, so an unrecognized/newer model still
// gets tracked instead of silently costing "$0" - intentionally on the high
// side so a stale rate table underestimates usage risk rather than hiding it.
const FALLBACK_RATE = { input: 5.00, output: 15.00 };

export const estimateCostUsd = (model, inputTokens, outputTokens) => {
  const rate = RATES[model] || FALLBACK_RATE;
  return ((inputTokens || 0) / 1e6) * rate.input + ((outputTokens || 0) / 1e6) * rate.output;
};
