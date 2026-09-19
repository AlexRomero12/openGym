// The one-session weight override the Coach's load estimate writes on your confirmation.
//
// A Coach load proposal is not a plan edit: the progression engine owns the routine, and the
// engine is the thing that decides every session after the one you asked about. So the
// confirmed weights live here instead — `S.prefill[iso].ex[exerciseId].w` — where `beginWorkout`
// reads them once, only for that date, and only after the engine and the plan have had their
// say. The entry is consumed when the session is finished; a day that passes untrained is
// swept on load. Nothing here needs a provider, a server or a clock it is not handed.
//
// The shape mirrors what the proposal stored: a date, when it was written (`at`, the tie-break
// for sync), and one weight per exercise id. It never edits `routines`, `week` or `exWeights`,
// so reverting the Coach is still reverting a plan change, and a prefill that is never applied
// simply ages out.
import { todayISO } from './format.js'

// Two weeks of future dates is already more than anyone asks for; the cap is here so a stuck
// sync cannot grow the state blob a little every day.
export const PREFILL_MAX_DATES = 14

function trimPrefill(s) {
  const map = s.prefill || {}
  const keys = Object.keys(map).sort()
  while (keys.length > PREFILL_MAX_DATES) delete map[keys.shift()]
}

/** `{ [exId]: { w } }` for a date, or null. Never the map itself — callers mutate state drafts. */
export function prefillFor(S, iso) {
  const ex = S?.prefill?.[iso]?.ex
  return ex && Object.keys(ex).length ? ex : null
}

/** One weight for one exercise on one date. Returns false when the weight is not a weight. */
export function setPrefill(s, iso, exId, w, at) {
  const weight = Number(w)
  if (!iso || !exId || !Number.isFinite(weight) || weight <= 0) return false
  const map = (s.prefill = s.prefill || {})
  const day = (map[iso] = map[iso] || { at: 0, ex: {} })
  day.ex[exId] = { w: weight }
  day.at = at || Date.now()
  trimPrefill(s)
  return true
}

/** The session happened (or was discarded): the override has served its purpose. */
export function clearPrefill(s, iso) {
  if (s.prefill && s.prefill[iso]) delete s.prefill[iso]
}

/**
 * Drop dates that are no longer askable: anything before today, and anything beyond the cap.
 * Called on load, so a phone that sat unused for a month does not carry a month of overrides.
 */
export function sweepPrefill(s, today = todayISO()) {
  const map = s.prefill
  if (!map) return
  Object.keys(map).forEach(iso => { if (iso < today) delete map[iso] })
  trimPrefill(s)
}
