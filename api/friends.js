/* Ranking «Amigos» — agregado de SOLO LECTURA sobre los state-<uid>.json de ESTA instancia.
 *
 * Versión integrada al api (el panel `friends/` fue el paso intermedio). Mismo criterio que la
 * app: e1RM Epley (tope 12 reps), volumen sin calentamientos, semana lunes-domingo, racha y
 * cumplimiento. Autocontenido a propósito: el contexto de build del api es ./api y no incluye
 * las librerías del frontend, así que las reglas se replican acá (documentadas una a una).
 *
 * Privacidad: solo se leen perfiles listados en friends.json con `share !== false`; cada uno
 * elige qué comparte (volume / compliance / streak / lifts) y los pesos corporales NUNCA se
 * exponen — solo se usan para normalizar (×peso).
 */
import fs from 'node:fs'
import path from 'node:path'

const LB_TO_KG = 0.45359237
const REP_CAP = 12
const round1 = n => Math.round(n * 10) / 10

const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const isoAddDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
/** Semana que contiene `iso`; ws=1 → lunes (igual semántica que format.js del frontend). */
function startOfWeek(iso, ws) {
  const d = new Date(iso + 'T12:00:00')
  const diff = ws === 0 ? d.getDay() : (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return isoOf(d)
}

/* Misma regla que frontend/src/lib/workout-model.js (phase, con el legacy `warmup`). */
function isWarmup(s) {
  if (!s || typeof s !== 'object') return false
  const p = typeof s.phase === 'string' ? s.phase.trim().toLowerCase() : ''
  if (p === 'warmup' || p === 'warm-up' || p === 'warm_up') return true
  if (p === 'work') return false
  return s.warmup === true
}

/* Misma elegibilidad que onerm.js: serie completada, no warm-up, peso > 0, reps 1..12. */
function estimate1RM(w, r) {
  const weight = Number(w)
  const reps = Number(r)
  if (!isFinite(weight) || !isFinite(reps)) return null
  if (weight <= 0 || reps < 1 || reps > REP_CAP) return null
  const est = reps === 1 ? weight : weight * (1 + Math.round(reps) / 30)
  return isFinite(est) && est > 0 ? Math.round(est * 10) / 10 : null
}

/* Volumen de una serie completada (excluye warm-ups). Aproximación deliberada: cuenta cada
 * lado completado en series por lado y la carga principal; los drops añaden algo más en la
 * app y acá no — afecta el ranking, no la progresión. */
function volumeOfSet(s) {
  if (!s) return 0
  if (isWarmup(s)) return 0
  if (s.sides && typeof s.sides === 'object') {
    let v = 0
    for (const k of ['L', 'R']) {
      const side = s.sides[k]
      if (side && side.done) v += (Number(side.w) || Number(s.w) || 0) * (Number(side.r) || 0)
    }
    return v
  }
  return s.done ? (Number(s.w) || 0) * (Number(s.r) || 0) : 0
}
const workoutVolume = w => (w.entries || []).reduce((sum, e) => sum + (e.sets || []).reduce((v, s) => v + volumeOfSet(s), 0), 0)

/** Rellena los campos que el agregador toca, para que un state viejo no rompa un `.map`. */
function normalize(S = {}) {
  return {
    unit: S.unit === 'lb' ? 'lb' : 'kg',
    weekStart: S.weekStart === 0 ? 0 : 1,
    routines: Array.isArray(S.routines) ? S.routines : [],
    week: S.week && typeof S.week === 'object' ? S.week : {},
    dayPlan: S.dayPlan && typeof S.dayPlan === 'object' ? S.dayPlan : {},
    workouts: Array.isArray(S.workouts) ? S.workouts : [],
    customEx: Array.isArray(S.customEx) ? S.customEx : [],
    bodyweight: Array.isArray(S.bodyweight) ? S.bodyweight : [],
  }
}

/* Mismo criterio que history.js effectiveRoutineIds: dayPlan manda, si no la semana; [] = rest. */
function routineIdsFor(S, iso) {
  const ov = S.dayPlan[iso]
  if (ov === 'rest') return []
  if (ov && S.routines.some(r => r.id === ov)) return [ov]
  const wd = new Date(iso + 'T12:00:00').getDay()
  return [].concat(S.week[wd] || []).filter(id => S.routines.some(r => r.id === id))
}
const plannedDays = (S, startIso) => {
  let n = 0
  for (let i = 0; i < 7; i++) if (routineIdsFor(S, isoAddDays(startIso, i)).length) n++
  return n
}

function weekWindows(count, ws, todayIso) {
  const base = startOfWeek(todayIso, ws)
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(base + 'T12:00:00')
    d.setDate(d.getDate() - 7 * i)
    const start = isoOf(d)
    out.push({ start, end: isoAddDays(start, 6) })
  }
  return out
}

/** Métricas de una semana: cumplimiento (días hechos / planificados), volumen y sesiones. */
function weekMetrics(S, w) {
  const inWeek = S.workouts.filter(x => x && x.d && x.d >= w.start && x.d <= w.end)
  const days = new Set(inWeek.map(x => x.d))
  const planned = plannedDays(S, w.start)
  const volume = inWeek.reduce((sum, x) => sum + workoutVolume(x), 0)
  return { start: w.start, end: w.end, done: days.size, sessions: inWeek.length, planned, ratio: planned > 0 ? round1(days.size / planned) : null, volume: round1(volume) }
}

/** Mejor 1RM estimado por ejercicio, en una ventana o en todo el historial. */
function bestLifts(S, w = null) {
  const best = new Map()
  for (const wk of S.workouts) {
    if (!wk || !wk.d) continue
    if (w && (wk.d < w.start || wk.d > w.end)) continue
    for (const e of (wk.entries || [])) {
      for (const s of (e.sets || [])) {
        if (!s.done || isWarmup(s)) continue
        const est = estimate1RM(s.w, s.r)
        if (est == null) continue
        const prev = best.get(e.id)
        if (!prev || est > prev.est) best.set(e.id, { est, w: Number(s.w), r: Math.round(Number(s.r)), d: wk.d })
      }
    }
  }
  return best
}

/** Pesos corporales en kg, ordenados por fecha. Nunca se exponen crudos. */
function bwKgList(S) {
  return (S.bodyweight || [])
    .filter(b => b && b.d && Number(b.w) > 0)
    .map(b => ({ d: b.d, kg: S.unit === 'lb' ? Number(b.w) * LB_TO_KG : Number(b.w) }))
    .sort((a, b) => a.d.localeCompare(b.d))
}
function bwAt(list, iso) {
  let out = null
  for (const b of list) { if (b.d <= iso) out = b.kg; else break }
  return out ?? (list.length ? list[list.length - 1].kg : null)
}
const bwLatest = list => (list.length ? list[list.length - 1].kg : null)

/** ¿Este perfil quiere compartir la métrica? Listado = opt-in; `share:false` = fuera. */
function shareFlags(p) {
  const s = p.share && typeof p.share === 'object' ? p.share : {}
  return { volume: s.volume !== false, compliance: s.compliance !== false, streak: s.streak !== false, lifts: s.lifts !== false }
}

/** Lee db.json + state-*.json. Nunca lanza por un fichero corrupto. */
export function loadData(dataDir) {
  let db = { users: [] }
  try { db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8')) } catch { /* db opcional */ }
  const users = new Map((db.users || []).map(u => [u.id, u]))
  const states = new Map()
  let files = []
  try { files = fs.readdirSync(dataDir) } catch { return { users, states } }
  for (const f of files) {
    const m = /^state-([a-zA-Z0-9_-]+)\.json$/.exec(f)
    if (!m) continue
    try { states.set(m[1], JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'))) } catch { /* escritura a medias */ }
  }
  return { users, states }
}

/* Demo: mismo generador que el panel `friends/` — datos sintéticos en memoria, nunca en disco,
 * para poder ver el ranking con más de un participante sin inventar cuentas en la instancia. */
const DEMO_PLAN = [
  { id: 'demo-r1', name: 'Día A · Empuje', weekday: 1, ex: [{ id: '0025', sets: 4, reps: 5, weight: 60, inc: 2.5 }, { id: '0085', sets: 3, reps: 8, weight: 60, inc: 2.5 }] },
  { id: 'demo-r2', name: 'Día B · Pierna', weekday: 3, ex: [{ id: '0043', sets: 4, reps: 5, weight: 72.5, inc: 2.5 }, { id: '0025', sets: 3, reps: 8, weight: 52.5, inc: 1.25 }] },
  { id: 'demo-r3', name: 'Día C · Torso', weekday: 5, ex: [{ id: '0032', sets: 3, reps: 5, weight: 95, inc: 5 }, { id: '0043', sets: 3, reps: 8, weight: 62.5, inc: 2.5 }] },
]
function demoState(now = new Date(), { weeks = 4 } = {}) {
  const today = isoOf(now)
  const week0 = startOfWeek(today, 1)
  const round = n => Math.round(n * 2) / 2
  const ts = iso => new Date(iso + 'T18:00:00').getTime()
  const workouts = []
  for (let wk = 0; wk < weeks; wk++) {
    for (const r of DEMO_PLAN) {
      const d = isoAddDays(week0, -7 * wk + (r.weekday - 1))
      if (d > today) continue
      workouts.push({
        id: `demo-${wk}-${r.id}`, d, start: ts(d), end: ts(d) + 62 * 60000, routineId: r.id, name: r.name,
        entries: r.ex.map(cfg => {
          const w = round(cfg.weight + (3 - wk) * cfg.inc)
          const sets = [{ w: round(w * 0.5), r: cfg.reps, done: true, phase: 'warmup' }]
          for (let i = 0; i < cfg.sets; i++) sets.push({ w, r: cfg.reps, done: true })
          return { id: cfg.id, sets, topW: w }
        }),
      })
    }
  }
  workouts.sort((a, b) => a.d.localeCompare(b.d))
  return {
    unit: 'kg', weekStart: 1,
    routines: DEMO_PLAN.map(r => ({ id: r.id, name: r.name, ex: r.ex.map(c => ({ id: c.id, sets: c.sets, reps: c.reps })) })),
    week: { 1: ['demo-r1'], 3: ['demo-r2'], 5: ['demo-r3'] },
    dayPlan: {},
    bodyweight: [
      { d: isoAddDays(week0, -21), w: 69.5 }, { d: isoAddDays(week0, -14), w: 69 },
      { d: isoAddDays(week0, -7), w: 68.5 }, { d: today, w: 68 },
    ],
    customEx: [], workouts,
  }
}

const METRICS = ['volume', 'compliance', 'streak']
const customName = (id, S) => { const c = (S.customEx || []).find(e => e.id === id); return c ? c.n : null }

/** Quién aparece: entradas de friends.json (las maneja el dueño) + opt-in propio desde el
 *  estado del perfil (switch «Aparecer en el ranking»). Consentimiento:
 *   · share:false en la config → excluido por el dueño (manda).
 *   · friends.share === false en el estado → el perfil se excluye a sí mismo (manda).
 *   · friends.share === true en el estado → auto-incluido con su nombre de perfil. */
function resolveListed(config, states, users) {
  const cfgByUid = new Map((config.participants || []).filter(p => p && p.uid).map(p => [p.uid, p]))
  const listed = []
  for (const p of cfgByUid.values()) {
    if (p.share === false) continue
    const own = states.get(p.uid)
    if (own && own.friends && own.friends.share === false) continue
    listed.push(p)
  }
  for (const [uid, own] of states.entries()) {
    if (cfgByUid.has(uid)) continue
    if (!(own && own.friends && own.friends.share === true)) continue
    const user = users.get(uid) || {}
    listed.push({ uid, name: user.name, emoji: (own.friends && own.friends.emoji) || '💪', share: own.friends })
  }
  return listed
}

/** Dueño de la instancia: el primer perfil registrado CON al menos un entreno guardado (los
 *  perfiles de prueba o abandonados sin historial no cuentan); si nadie entrenó aún, el primer
 *  registrado. En instancias con ADMIN_UIDS, el admin también gestiona. */
function ownerOf(users, states) {
  const list = [...users.values()]
  for (const u of list) {
    const S = states.get(u.id)
    if (S && Array.isArray(S.workouts) && S.workouts.length > 0) return u.id
  }
  return list[0] ? list[0].id : null
}

export function isInstanceOwner(dataDir, uid, adminFlag = false) {
  if (adminFlag) return true
  const { users, states } = loadData(dataDir)
  return !!uid && uid === ownerOf(users, states)
}

/** Construye todo lo que la vista muestra. `now` inyectable para tests. */
export function buildRanking({ users, states }, config, now = new Date(), norm = 'rel') {
  const ws = config.weekStart === 0 ? 0 : 1
  const rel = norm === 'rel'
  const unit = config.unit === 'lb' ? 'lb' : 'kg'
  const display = kg => round1(unit === 'lb' ? kg / LB_TO_KG : kg)
  const historyWeeks = Math.max(1, Math.min(12, config.historyWeeks || 4))
  const today = isoOf(now)
  const weeks = weekWindows(historyWeeks, ws, today)
  const current = weeks[0]

  const listed = resolveListed(config, states, users)

  const participants = []
  for (const p of listed) {
    const raw = states.get(p.uid) || (p.demo ? demoState(now, typeof p.demo === 'object' ? p.demo : {}) : null)
    if (!raw) continue
    const S = normalize(raw)
    const user = users.get(p.uid) || {}
    const toKg = S.unit === 'lb' ? LB_TO_KG : 1
    const flags = shareFlags(p)

    const bw = bwKgList(S)
    const bwWeek = bwLatest(bw)
    const byWeek = weeks.map(x => weekMetrics(S, x))
    const week = byWeek[0]
    const lastWorkout = S.workouts.reduce((m, w) => (w && w.d && (!m || w.d > m) ? w.d : m), null)
    const all = bestLifts(S)
    const thisWeek = bestLifts(S, current)
    const prior = bestLifts(S, { start: '', end: isoAddDays(current.start, -1) })

    const volKg = week.volume * toKg
    const volRank = rel ? (bwWeek ? volKg / bwWeek : null) : volKg

    const gains = []
    for (const [id, nowSet] of thisWeek.entries()) {
      const before = prior.get(id)
      if (!before || nowSet.est <= before.est) continue
      gains.push({ id, name: customName(id, S), deltaKg: (nowSet.est - before.est) * toKg, pct: (nowSet.est - before.est) / before.est })
    }
    gains.sort((a, b) => b.pct - a.pct)
    const impr = flags.lifts && gains.length
      ? { prs: gains.length, gainPct: gains.reduce((s, g) => s + g.pct, 0) * 100, gainKg: gains.reduce((s, g) => s + g.deltaKg, 0), best: gains[0] }
      : null

    participants.push({
      uid: p.uid,
      name: p.name || user.name || p.uid,
      emoji: p.emoji || '💪',
      shares: flags,
      hasBodyweight: bw.length > 0,
      week: {
        done: flags.compliance ? week.done : null,
        sessions: flags.compliance ? week.sessions : null,
        planned: flags.compliance ? week.planned : null,
        ratio: flags.compliance ? week.ratio : null,
        volume: flags.volume ? (rel ? (bwWeek ? round1(volRank) : null) : display(volKg)) : null,
      },
      streakWeeks: flags.streak ? streakOf(S, ws) : null,
      lastWorkout,
      _weekKg: week, _byWeek: byWeek, _volRank: volRank, _all: all, _thisWeek: thisWeek,
      _impr: impr, _toKg: toKg, _bw: bw,
    })
  }

  const vr = p => (p._volRank == null ? -1 : p._volRank)
  const byVolume = participants.filter(p => p.shares.volume && p._volRank != null).sort((a, b) => b._volRank - a._volRank || a.name.localeCompare(b.name))
  const eps = 1e-9
  const byCompliance = participants.filter(p => p.shares.compliance).sort((a, b) => {
    const ra = a._weekKg.ratio, rb = b._weekKg.ratio
    if (ra == null && rb == null) return vr(b) - vr(a)
    if (ra == null) return 1
    if (rb == null) return -1
    if (Math.abs(rb - ra) > eps) return rb - ra
    return vr(b) - vr(a)
  })
  const byStreak = participants.filter(p => p.shares.streak).sort((a, b) => b.streakWeeks - a.streakWeeks || vr(b) - vr(a) || a.name.localeCompare(b.name))
  const ranking = { volume: byVolume.map(p => p.uid), compliance: byCompliance.map(p => p.uid), streak: byStreak.map(p => p.uid) }

  const exMap = new Map()
  for (const p of participants) {
    if (!p.shares.lifts) continue
    for (const [id, best] of p._all.entries()) {
      const bwSet = bwAt(p._bw, best.d)
      const estKg = best.est * p._toKg
      const score = rel ? (bwSet ? estKg / bwSet : null) : estKg
      if (score == null) continue
      if (!exMap.has(id)) exMap.set(id, [])
      const wk = p._thisWeek.get(id) || null
      exMap.get(id).push({
        uid: p.uid, _score: score, est: display(estKg), w: display(best.w * p._toKg), r: best.r, d: best.d,
        rel: bwSet ? round1(estKg / bwSet) : null,
        improved: !!wk && wk.est >= best.est - 1e-9 && wk.d === best.d,
      })
    }
  }
  const floor = Math.min(Math.max(1, config.minParticipantsPerExercise || 1), Math.max(1, participants.length))
  const exercises = [...exMap.entries()]
    .map(([id, list]) => {
      const sorted = list.sort((a, b) => b._score - a._score || a.uid.localeCompare(b.uid))
      return {
        id,
        name: customName(id, normalize(states.get(sorted[0].uid) || {})) || null,
        people: sorted.length,
        entries: sorted.map(e => (rel
          ? { uid: e.uid, rel: e.rel, r: e.r, d: e.d, improved: e.improved }
          : { uid: e.uid, est: e.est, w: e.w, r: e.r, d: e.d, improved: e.improved })),
      }
    })
    .filter(ex => ex.entries.length >= floor)
    .sort((a, b) => b.people - a.people || a.id.localeCompare(b.id))

  const history = weeks.map((w, idx) => {
    const values = {}
    for (const p of participants) {
      const m = p._byWeek[idx]
      const volKg = m.volume * p._toKg
      const bw = bwAt(p._bw, w.end)
      values[p.uid] = {
        done: p.shares.compliance ? m.done : null,
        planned: p.shares.compliance ? m.planned : null,
        ratio: p.shares.compliance ? m.ratio : null,
        volume: p.shares.volume ? (rel ? (bw ? round1(volKg / bw) : null) : display(volKg)) : null,
      }
    }
    const leader = pick => {
      let best = null
      for (const p of participants) {
        const v = pick(values[p.uid])
        if (v == null) continue
        if (!best || v > best.v) best = { uid: p.uid, v }
      }
      return best && best.v > 0 ? best.uid : null
    }
    return { start: w.start, end: w.end, values, leaders: { volume: leader(v => v.volume), compliance: leader(v => v.ratio) } }
  })

  const improvement = participants
    .filter(p => p._impr && p._impr.prs > 0)
    .sort((a, b) => b._impr.gainPct - a._impr.gainPct || b._impr.prs - a._impr.prs || a.name.localeCompare(b.name))
    .map(p => ({
      uid: p.uid, name: p.name, emoji: p.emoji, prs: p._impr.prs,
      gainPct: round1(p._impr.gainPct), gainKg: display(p._impr.gainKg),
      best: p._impr.best ? { id: p._impr.best.id, name: p._impr.best.name, pct: round1(p._impr.best.pct * 100), deltaKg: display(p._impr.best.deltaKg) } : null,
    }))

  return {
    generatedAt: now.toISOString(),
    title: config.title || 'Ranking openGym',
    subtitle: config.subtitle || null,
    unit, norm: rel ? 'rel' : 'abs', formula: 'epley', metrics: METRICS,
    weekDays: ws === 0 ? 'sunday' : 'monday',
    week: { start: current.start, end: current.end },
    weeks: weeks.map(w => ({ start: w.start, end: w.end })),
    participantCount: participants.length,
    participants: participants.map(p => ({
      uid: p.uid, name: p.name, emoji: p.emoji, shares: p.shares, hasBodyweight: p.hasBodyweight,
      week: p.week, streakWeeks: p.streakWeeks, lastWorkout: p.lastWorkout,
    })),
    ranking, improvement, exercises, history,
  }
}

/** Racha: semanas seguidas con al menos un entrenamiento (la actual puede estar vacía). */
function streakOf(S, ws) {
  if (!S.workouts.length) return 0
  const weeks = new Set(S.workouts.map(w => startOfWeek(w.d, ws)))
  let streak = 0
  const cur = new Date()
  for (let i = 0; i < 520; i++) {
    const wk = startOfWeek(isoOf(cur), ws)
    if (weeks.has(wk)) streak++
    else if (i > 0) break
    cur.setDate(cur.getDate() - 7)
  }
  return streak
}

const configPathFor = dataDir => process.env.FRIENDS_CONFIG || path.join(dataDir, 'friends.json')
function readConfig(dataDir) {
  try { return JSON.parse(fs.readFileSync(configPathFor(dataDir), 'utf8')) } catch { return {} }
}

/** Punto de entrada del api: lee la config y devuelve el ranking listo para la vista.
 *  `viewerUid`/`viewerAdmin` habilitan la sección de gestión cuando quien mira es el dueño. */
export function friendsRanking(dataDir, norm = 'rel', now = new Date(), viewerUid = null, viewerAdmin = false) {
  const config = readConfig(dataDir)
  const data = loadData(dataDir)
  const body = buildRanking(data, config, now, norm)
  const ownerUid = ownerOf(data.users, data.states)
  if (viewerAdmin || (viewerUid && ownerUid && viewerUid === ownerUid)) {
    const included = new Set(resolveListed(config, data.states, data.users).map(p => p.uid))
    body.manage = {
      me: viewerUid,
      profiles: [...data.users.values()].map(u => ({ uid: u.id, name: u.name, included: included.has(u.id) })),
    }
  }
  return body
}

/** Suma/quita a un perfil del ranking escribiendo friends.json (atómico). Solo lo llama el api
 *  para el dueño de la instancia; `share:false` gana sobre el opt-in propio del perfil. */
export function setFriendShare(dataDir, uid, share) {
  const { users } = loadData(dataDir)
  if (!users.has(uid)) throw new Error('unknown profile')
  const config = readConfig(dataDir)
  config.participants = Array.isArray(config.participants) ? config.participants : []
  const entry = config.participants.find(p => p && p.uid === uid)
  if (entry) entry.share = !!share
  else config.participants.push({ uid, name: users.get(uid).name, emoji: '💪', share: !!share })
  const tmp = configPathFor(dataDir) + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n')
  fs.renameSync(tmp, configPathFor(dataDir))
  return config
}
