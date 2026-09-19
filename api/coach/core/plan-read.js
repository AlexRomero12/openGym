/* Reading the week the way the client reads it — the mirror of frontend/src/lib/history.js.
 *
 * The Coach's "what am I training tomorrow" job runs on the server (or on a phone running the
 * core), and the day the app would show must be the day the Coach estimates for. The client
 * resolves a date through `effectiveRoutineIds` (a per-date override wins, then the weekday
 * list), and `nextTrainingDay` walks forward from today. Both are duplicated here for the same
 * reason modeOf/isBw/isPerSide are: the api image and the frontend share no build step.
 * coach-parity.test.js pins them against the originals over a shared table.
 */

export function effectiveRoutineIds(S, iso) {
  const ov = S?.dayPlan?.[iso]
  if (ov === 'rest') return []
  if (ov && (S.routines || []).some(r => r.id === ov)) return [ov]
  const wd = new Date(iso + 'T12:00:00').getDay()
  return [].concat(S?.week?.[wd] || []).filter(id => (S.routines || []).some(r => r.id === id))
}

export function effectiveRoutines(S, iso) {
  return effectiveRoutineIds(S, iso).map(id => (S.routines || []).find(r => r.id === id)).filter(Boolean)
}

const isoOf = d => d.toISOString().slice(0, 10)

/**
 * The next day with something to train, looking forward from `iso` (exclusive): the same walk
 * the Home screen's "next up" card does. A routine with no exercises does not count.
 *
 * `routineIds` narrows the search to specific routines — the "weights for one routine" ask.
 * When none of them is scheduled within the week, the next day is used with those routines,
 * because the question was about them, not about the calendar. Without a filter and with a
 * fully-rest week the answer is null, and the job fails with `noplan` instead of inventing a
 * session.
 */
export function nextTrainingDay(S, iso, { routineIds } = {}) {
  const only = Array.isArray(routineIds) && routineIds.length ? new Set(routineIds) : null
  for (let i = 1; i <= 7; i++) {
    const d = new Date(iso + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const nextIso = isoOf(d)
    let routines = effectiveRoutines(S, nextIso)
    if (only) routines = routines.filter(r => only.has(r.id))
    if (routines.some(r => (r.ex || []).length)) {
      return { iso: nextIso, weekday: d.getDay(), routines, routine: routines[0] }
    }
  }
  if (!only) return null
  const wanted = (S.routines || []).filter(r => only.has(r.id) && (r.ex || []).length)
  if (!wanted.length) return null
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return { iso: isoOf(d), weekday: d.getDay(), routines: wanted, routine: wanted[0] }
}
