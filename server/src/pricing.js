// Rough, editable cost-per-token table, in USD per 1,000,000 tokens.
// These are estimates based on published rates at the time this was written -
// providers change pricing over time, so treat the resulting costUsd as an
// approximation for budgeting, not a billing-accurate figure. Update the
// numbers below if a provider changes its pricing.
const RATES = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'claude-sonnet-5': { input: 2.00, output: 10.00 },
  'claude-3-5-sonnet-latest': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 }
};

// Used for any model not listed above, so an unrecognized/newer model still
// gets tracked instead of silently costing "$0" - intentionally on the high
// side so a stale rate table underestimates usage risk rather than hiding it.
const FALLBACK_RATE = { input: 5.00, output: 15.00 };

// Anthropic prices cache writes at 1.25x the base input rate and cache reads
// at 0.1x - both are billed separately from (and in addition to) plain
// input_tokens, so a cost estimate that only looks at input/output would
// undercount every cached request.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export const estimateCostUsd = (model, inputTokens, outputTokens, cacheCreationTokens = 0, cacheReadTokens = 0) => {
  const rate = RATES[model] || FALLBACK_RATE;
  const input = ((inputTokens || 0) / 1e6) * rate.input;
  const output = ((outputTokens || 0) / 1e6) * rate.output;
  const cacheWrite = ((cacheCreationTokens || 0) / 1e6) * rate.input * CACHE_WRITE_MULTIPLIER;
  const cacheRead = ((cacheReadTokens || 0) / 1e6) * rate.input * CACHE_READ_MULTIPLIER;
  return input + output + cacheWrite + cacheRead;
};
