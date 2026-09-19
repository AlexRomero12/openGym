/* Estimated 1RM, server-side — the mirror of frontend/src/lib/onerm.js.
 *
 * The Coach is asked "what is my 1RM on this" and must not do arithmetic: a 3B model on a CPU
 * gets Epley wrong often enough to matter. So the payload carries the estimate this module
 * computes, and the prompt tells the model to quote it, never recompute it. The phone runs
 * this same file when it brings its own key (coach-local.js imports the core), so there is no
 * second opinion there either.
 *
 * Field for field the same rules as the frontend's copy — REP_CAP, warm-ups excluded, single
 * reps returned unchanged — because a card that shows one number in Stats and another in the
 * chat is worse than no number. coach-parity.test.js pins both against a shared table.
 */
import { isWarmupSet } from './sets.js'

export const REP_CAP = 12
export const DEFAULT_FORMULA = 'epley'
export const FORMULAS = {
  epley: (w, r) => w * (1 + r / 30),
  brzycki: (w, r) => w * 36 / (37 - r),
  lombardi: (w, r) => w * Math.pow(r, 0.1)
}

/** One set into an estimate, or null for anything it cannot honestly answer. */
export function estimate1RM(w, r, formula = DEFAULT_FORMULA) {
  const weight = Number(w)
  const reps = Number(r)
  if (!isFinite(weight) || !isFinite(reps)) return null
  if (weight <= 0 || reps < 1) return null
  if (reps > REP_CAP) return null
  const fn = FORMULAS[formula] || FORMULAS[DEFAULT_FORMULA]
  const est = reps === 1 ? weight : fn(weight, Math.round(reps))
  if (!isFinite(est) || est <= 0) return null
  return Math.round(est * 10) / 10
}

/** Best estimate out of one workout entry's completed work sets. */
export function bestSetOf(entry, formula = DEFAULT_FORMULA) {
  let best = null
  ;(entry?.sets || []).forEach(s => {
    if (!s.done || isWarmupSet(s)) return
    const est = estimate1RM(s.w, s.r, formula)
    if (est !== null && (!best || est > best.est)) best = { est, w: Number(s.w), r: Math.round(Number(s.r)) }
  })
  return best
}

/** One point per workout that produced an estimate, chronological. */
export function e1rmSeries(S, exId, formula = DEFAULT_FORMULA) {
  const pts = []
  ;(S.workouts || []).forEach(w => {
    const entry = (w.entries || []).find(e => e.id === exId)
    if (!entry) return
    const best = bestSetOf(entry, formula)
    if (best) pts.push({ t: w.start, d: w.d, y: best.est, w: best.w, r: best.r })
  })
  return pts
}

/** All-time best estimate with the set and date behind it. */
export function best1RM(S, exId, formula = DEFAULT_FORMULA) {
  let best = null
  e1rmSeries(S, exId, formula).forEach(p => { if (!best || p.y > best.est) best = { est: p.y, w: p.w, r: p.r, d: p.d, t: p.t } })
  return best
}
