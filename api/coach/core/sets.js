/* The one set-reading rule the payload and the 1RM estimate both need.
 *
 * It used to live in payload.js, and moving it here is what lets core/onerm.js filter warm-ups
 * without importing the payload builder (which imports the estimate back). The rule itself is
 * unchanged: an explicit `phase` wins, the legacy boolean is the fallback, and anything else is
 * a work set.
 */
export const isWarmupSet = s => {
  const ph = typeof s?.phase === 'string' ? s.phase.trim().toLowerCase() : ''
  if (ph) return ph === 'warmup' || ph === 'warm-up' || ph === 'warm_up'
  return s?.warmup === true
}
