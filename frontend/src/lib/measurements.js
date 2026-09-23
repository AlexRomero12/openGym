// Body measurements (waist, chest, arm, thigh) tracked over time — a sibling of the body-weight
// log in lib/history.js and, like it, a plain list of days the store syncs and backs up whole.
//
// One entry per day: { d: 'YYYY-MM-DD', t: <ms>, m: { waist, chest, arm, thigh } }. Values are in
// the profile's length unit — centimetres when the profile weighs in kg, inches when it weighs in
// lb — so a unit switch converts them alongside the weights (lib/units.js). A site is optional:
// a day that only logged a waist is a normal entry, and a day left with no sites at all is dropped
// rather than becoming an empty point on a chart.
//
// Everything here that decides a number on screen is pure and unit-tested beside it
// (measurements.test.js) — see CONTRIBUTING.md.

const CM_PER_IN = 2.54

// The sites the app tracks. `key` is the stored field; `label` is the English source string the
// views pass through t() (the locale packs carry it under that same key).
export const SITES = [
  { key: 'waist', label: 'Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'arm', label: 'Arm' },
  { key: 'thigh', label: 'Thigh' },
]

export const SITE_KEYS = SITES.map(s => s.key)

/** kg profiles measure in cm, lb profiles in inches — the same choice the weight unit implies. */
export const lengthUnit = unit => (unit === 'lb' ? 'in' : 'cm')

const round = (v, step) => Math.round(v / step) * step

/**
 * cm ↔ in, rounded to what a tape measure shows: half a centimetre, a quarter inch. The two steps
 * are not commensurate, so a value converted there and back can land half a centimetre off — the
 * same limit the weight converter has for a number no plate can load.
 */
export function convertLength(value, from, to) {
  if (from === to || value == null || value === '' || !Number.isFinite(Number(value))) return value
  const v = Number(value)
  if (to === 'in') return round(v / CM_PER_IN, 0.25)
  return round(v * CM_PER_IN, 0.5)
}

const listOf = S => (Array.isArray(S?.measurements) ? S.measurements : [])

/** The most recent day logged, or null. */
export const lastMeasurement = S => (listOf(S).length ? listOf(S)[listOf(S).length - 1] : null)

/** The most recent reading of one site — `{ d, t, y }` — or null. */
export function lastFor(S, site) {
  const list = listOf(S)
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i]?.m?.[site]
    if (v > 0) return { d: list[i].d, t: list[i].t || 0, y: v }
  }
  return null
}

/** Chart points for one site: one per day that actually logged it, oldest first. */
export function seriesFor(S, site) {
  return listOf(S)
    .filter(e => e?.m?.[site] > 0)
    .map(e => ({ t: e.t || new Date(e.d).getTime(), y: e.m[site], d: e.d }))
}

/** Last reading minus the previous one for a site, or null when there is nothing to compare. */
export function deltaFor(S, site) {
  const pts = seriesFor(S, site)
  return pts.length > 1 ? pts[pts.length - 1].y - pts[pts.length - 2].y : null
}

/** Site keys with at least one reading, in catalogue order. */
export const sitesLogged = S => SITE_KEYS.filter(k => lastFor(S, k) != null)

/**
 * The measurements list with `patch` merged into the day `date` — sorted by day. A site whose
 * value is cleared is dropped; a day left with no sites at all disappears. `t` is the edit time,
 * so a same-day edit on two devices resolves the way bodyweight does (lib/sync-merge.js).
 */
export function upsertMeasurement(S, date, patch, t = Date.now()) {
  const list = listOf(S).map(e => ({ ...e, m: { ...(e?.m || {}) } }))
  let entry = list.find(e => e.d === date)
  if (!entry) { entry = { d: date, t, m: {} }; list.push(entry) }
  entry.t = t
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(Number(v) > 0)) delete entry.m[k]
    else entry.m[k] = Number(v)
  }
  return list
    .filter(e => e.m && Object.keys(e.m).length)
    .sort((a, b) => (a.d < b.d ? -1 : 1))
}
