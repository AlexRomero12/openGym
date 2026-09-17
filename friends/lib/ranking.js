/* Ranking "Amigos" — agregador de solo lectura sobre los state-<uid>.json de openGym.
 *
 * No reimplementa la lógica de la app: importa los mismos módulos que usa el MCP y el
 * frontend (onerm, history, format, workout-model, exercises), así que el e1RM (Epley),
 * el volumen y la racha son exactamente los que muestra openGym. Lo único propio es el
 * recorte semanal y el ranking entre perfiles.
 *
 * Privacidad: solo se leen perfiles listados en friends.json con `share !== false`, y
 * cada uno decide qué comparte (volume / compliance / streak / lifts). Nunca se exponen
 * pesos corporales. Por defecto, quien no está en la lista no aparece.
 */
import fs from 'node:fs'
import path from 'node:path'
import { estimate1RM } from '../../frontend/src/lib/onerm.js'
import { workoutVolume, effectiveRoutineIds, streakWeeks } from '../../frontend/src/lib/history.js'
import { weekStartOf, startOfWeek, isoOf } from '../../frontend/src/lib/format.js'
import { isWarmupRow } from '../../frontend/src/lib/workout-model.js'
import { exOr } from '../../frontend/src/lib/exercises.js'
import { demoState } from './demo.js'

const LB_TO_KG = 0.45359237
const round1 = n => Math.round(n * 10) / 10
const isoAddDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoOf(d)
}

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

function exName(id, S) {
  const custom = (S.customEx || []).find(e => e.id === id)
  if (custom) return custom.n
  const ex = exOr(id)
  return ex && ex.n ? ex.n : id
}

/** Días de entrenamiento planificados en la semana que arranca en `startIso`. */
function plannedDays(S, startIso) {
  let n = 0
  for (let i = 0; i < 7; i++) {
    if (effectiveRoutineIds(S, isoAddDays(startIso, i)).length) n++
  }
  return n
}

/** Las últimas `count` semanas (índice 0 = la actual), lunes-domingo por `ws`. */
function weekWindows(count, ws, todayIso) {
  const base = startOfWeek(todayIso, ws)
  const out = []
  for (let i = 0; i < count; i++) {
    const d = new Date(base)
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
  const volume = inWeek.reduce((sum, x) => sum + (workoutVolume(x) || 0), 0)
  return {
    start: w.start,
    end: w.end,
    done: days.size,
    sessions: inWeek.length,
    planned,
    ratio: planned > 0 ? round1(days.size / planned) : null,
    volume: round1(volume),
  }
}

/** Mejor 1RM estimado (Epley) por ejercicio, en una ventana o en todo el historial.
 *  Misma fórmula y mismo criterio de elegibilidad que la app (onerm.js): series completadas,
 *  sin calentamiento, y hasta 12 reps. Permite comparar fuerza máxima entre series de distinto
 *  número de repeticiones (80×5 vs 60×10) sin exigir un test real de 1RM. */
function bestLifts(S, formula, w = null) {
  const best = new Map()
  for (const wk of S.workouts) {
    if (!wk || !wk.d) continue
    if (w && (wk.d < w.start || wk.d > w.end)) continue
    for (const e of (wk.entries || [])) {
      for (const s of (e.sets || [])) {
        if (!s.done || isWarmupRow(s)) continue
        const est = estimate1RM(s.w, s.r, formula)
        if (est == null) continue
        const prev = best.get(e.id)
        if (!prev || est > prev.est) {
          best.set(e.id, { est, w: Number(s.w), r: Math.round(Number(s.r)), d: wk.d })
        }
      }
    }
  }
  return best
}

/** Pesos corporales del perfil, convertidos a kg y ordenados por fecha. NUNCA se exponen crudos. */
function bwKgList(S) {
  return (S.bodyweight || [])
    .filter(b => b && b.d && Number(b.w) > 0)
    .map(b => ({ d: b.d, kg: S.unit === 'lb' ? Number(b.w) * LB_TO_KG : Number(b.w) }))
    .sort((a, b) => a.d.localeCompare(b.d))
}
/** Peso corporal (kg) vigente en `iso`: el último pesaje en o antes de esa fecha. */
function bwAt(list, iso) {
  let out = null
  for (const b of list) { if (b.d <= iso) out = b.kg; else break }
  return out ?? (list.length ? list[list.length - 1].kg : null)
}
const bwLatest = list => (list.length ? list[list.length - 1].kg : null)

/** ¿Este perfil quiere compartir la métrica? Listado = opt-in; `share:false` = fuera. */
function shareFlags(p) {
  const s = p.share && typeof p.share === 'object' ? p.share : {}
  return {
    volume: s.volume !== false,
    compliance: s.compliance !== false,
    streak: s.streak !== false,
    lifts: s.lifts !== false,
  }
}

/** Lee db.json + state-*.json. Devuelve Maps por uid; nunca lanza por un fichero corrupto. */
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
    try {
      states.set(m[1], JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')))
    } catch { /* escritura atómica a medias: se ignora hasta el próximo refresco */ }
  }
  return { users, states }
}

const METRICS = ['volume', 'compliance', 'streak']

/**
 * Construye todo lo que la página muestra. `now` inyectable para tests.
 */
export function buildRanking({ users, states }, config, now = new Date(), norm = 'abs') {
  const ws = config.weekStart === 0 ? 0 : 1
  const rel = norm === 'rel'   // normaliza por peso corporal (fuerza y volumen relativos)
  const formula = config.formula || 'epley'
  const unit = config.unit === 'lb' ? 'lb' : 'kg'
  const display = kg => (unit === 'lb' ? round1(kg / LB_TO_KG) : round1(kg))
  const historyWeeks = Math.max(1, Math.min(12, config.historyWeeks || 4))
  const today = isoOf(now)
  const weeks = weekWindows(historyWeeks, ws, today)
  const current = weeks[0]

  const listed = (config.participants || []).filter(p => p && p.uid && p.share !== false)

  const participants = []
  for (const p of listed) {
    // Un perfil `demo` no vive en disco: se sintetiza para previsualizar el panel. No escribe nada.
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
    const all = bestLifts(S, formula)
    const thisWeek = bestLifts(S, formula, current)
    // Mejora: el mejor de ESTA semana contra el mejor ANTES de esta semana (nuevos PRs).
    const prior = bestLifts(S, formula, { start: '', end: isoAddDays(current.start, -1) })

    const volKg = week.volume * toKg
    // Volumen del ranking: absoluto en kg, o relativo al peso corporal (×, "cuántas veces tu peso moviste").
    const volRank = rel ? (bwWeek ? volKg / bwWeek : null) : volKg

    // Mejora de la semana: por cada ejercicio, cuánto subió el 1RM estimado vs su mejor
    // anterior. "Nuevo" (sin base previa) no cuenta como mejora — no hay contra qué comparar.
    const gains = []
    for (const [id, nowSet] of thisWeek.entries()) {
      const before = prior.get(id)
      if (!before || nowSet.est <= before.est) continue
      gains.push({ id, name: exName(id, S), deltaKg: (nowSet.est - before.est) * toKg, pct: (nowSet.est - before.est) / before.est })
    }
    gains.sort((a, b) => b.pct - a.pct)
    const impr = flags.lifts && gains.length
      ? {
        prs: gains.length,
        gainPct: gains.reduce((s, g) => s + g.pct, 0) * 100,
        gainKg: gains.reduce((s, g) => s + g.deltaKg, 0),
        best: gains[0],
      }
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
      streakWeeks: flags.streak ? streakWeeks(S) : null,
      _weekKg: week,
      _byWeek: byWeek,
      _volRank: volRank,
      _all: all,
      _thisWeek: thisWeek,
      _impr: impr,
      _toKg: toKg,
      _bw: bw,
    })
  }

  // ---- ranking de la semana por métrica (uid en orden) ----
  const vr = p => (p._volRank == null ? -1 : p._volRank)
  const byVolume = participants.filter(p => p.shares.volume && p._volRank != null)
    .sort((a, b) => b._volRank - a._volRank || a.name.localeCompare(b.name))
  const eps = 1e-9
  const byCompliance = participants.filter(p => p.shares.compliance)
    .sort((a, b) => {
      const ra = a._weekKg.ratio
      const rb = b._weekKg.ratio
      if (ra == null && rb == null) return vr(b) - vr(a)
      if (ra == null) return 1
      if (rb == null) return -1
      if (Math.abs(rb - ra) > eps) return rb - ra
      return vr(b) - vr(a)
    })
  const byStreak = participants.filter(p => p.shares.streak)
    .sort((a, b) => b.streakWeeks - a.streakWeeks || vr(b) - vr(a) || a.name.localeCompare(b.name))
  const ranking = {
    volume: byVolume.map(p => p.uid),
    compliance: byCompliance.map(p => p.uid),
    streak: byStreak.map(p => p.uid),
  }

  // ---- por ejercicio: mejor 1RM estimado (Epley), entre quienes lo entrenan ----
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
        uid: p.uid,
        _score: score,
        est: display(estKg),
        w: display(best.w * p._toKg),
        r: best.r,
        d: best.d,
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
        name: exName(id, (states.get(sorted[0].uid) && normalize(states.get(sorted[0].uid))) || {}),
        people: sorted.length,
        // En modo relativo NO viajan los kg: solo el multiplicador y las reps.
        entries: sorted.map(e => (rel
          ? { uid: e.uid, rel: e.rel, r: e.r, d: e.d, improved: e.improved }
          : { uid: e.uid, est: e.est, w: e.w, r: e.r, d: e.d, improved: e.improved })),
      }
    })
    .filter(ex => ex.entries.length >= floor)
    .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name))

  // ---- histórico simple: valores por semana y líderes de cada una ----
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
    const leader = (metric, pick) => {
      let best = null
      for (const p of participants) {
        const v = pick(values[p.uid], p)
        if (v == null) continue
        if (!best || v > best.v) best = { uid: p.uid, v }
      }
      return best && best.v > 0 ? best.uid : null
    }
    return {
      start: w.start,
      end: w.end,
      values,
      leaders: {
        volume: leader('volume', v => v.volume),
        compliance: leader('compliance', v => v.ratio),
      },
    }
  })

  // ---- mejora de la semana: quién subió más sus estimados respecto a su mejor anterior ----
  const improvement = participants
    .filter(p => p._impr && p._impr.prs > 0)
    .sort((a, b) => b._impr.gainPct - a._impr.gainPct || b._impr.prs - a._impr.prs || a.name.localeCompare(b.name))
    .map(p => ({
      uid: p.uid,
      name: p.name,
      emoji: p.emoji,
      prs: p._impr.prs,
      gainPct: round1(p._impr.gainPct),
      gainKg: display(p._impr.gainKg),
      best: p._impr.best
        ? { id: p._impr.best.id, name: p._impr.best.name, pct: round1(p._impr.best.pct * 100), deltaKg: display(p._impr.best.deltaKg) }
        : null,
    }))

  return {
    generatedAt: now.toISOString(),
    title: config.title || 'Ranking openGym',
    subtitle: config.subtitle || null,
    accent: config.accent || 'lime',
    theme: config.theme === 'light' ? 'light' : 'dark',
    unit,
    norm: rel ? 'rel' : 'abs',
    formula,
    metrics: METRICS,
    weekDays: ws === 0 ? 'sunday' : 'monday',
    week: { start: current.start, end: current.end },
    weeks: weeks.map(w => ({ start: w.start, end: w.end })),
    participantCount: participants.length,
    participants: participants.map(p => ({
      uid: p.uid, name: p.name, emoji: p.emoji, shares: p.shares,
      hasBodyweight: p.hasBodyweight,
      week: p.week, streakWeeks: p.streakWeeks,
    })),
    ranking,
    improvement,
    exercises,
    history,
  }
}
