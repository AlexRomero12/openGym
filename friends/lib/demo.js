/* Perfil de demostración — para previsualizar el panel con más de un participante
 * sin inventar datos en la instancia. Nada de esto se escribe en disco: se genera en
 * memoria y se recorta a la semana actual relativa a `now`, así siempre "está al día".
 *
 * Los pesos progresan hacia la semana en curso, de modo que el e1RM y el volumen de
 * cada semana se ven distintos en el histórico. Usa los mismos ejercicios básicos que
 * el catálogo (banca 0025, sentadilla 0043, peso muerto 0032, RDL 0085).
 */
import { startOfWeek, isoOf } from '../../frontend/src/lib/format.js'

const isoAdd = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return isoOf(d)
}
const ts = iso => new Date(iso + 'T18:00:00').getTime()

const PLAN = [
  { id: 'demo-r1', name: 'Día A · Empuje', weekday: 1, ex: [
    { id: '0025', sets: 4, reps: 5, weight: 60, inc: 2.5 },
    { id: '0085', sets: 3, reps: 8, weight: 60, inc: 2.5 },
  ] },
  { id: 'demo-r2', name: 'Día B · Pierna', weekday: 3, ex: [
    { id: '0043', sets: 4, reps: 5, weight: 72.5, inc: 2.5 },
    { id: '0025', sets: 3, reps: 8, weight: 52.5, inc: 1.25 },
  ] },
  { id: 'demo-r3', name: 'Día C · Torso', weekday: 5, ex: [
    { id: '0032', sets: 3, reps: 5, weight: 95, inc: 5 },
    { id: '0043', sets: 3, reps: 8, weight: 62.5, inc: 2.5 },
  ] },
]

const round = n => Math.round(n * 2) / 2

function entryFor(cfg, weekIdx) {
  // La semana actual (idx 0) es la más pesada; las anteriores, un escalón más ligeras.
  const w = round(cfg.weight + (3 - weekIdx) * cfg.inc)
  const sets = [{ w: round(w * 0.5), r: cfg.reps, done: true, phase: 'warmup' }]
  for (let i = 0; i < cfg.sets; i++) sets.push({ w, r: cfg.reps, done: true })
  return { id: cfg.id, sets, topW: w }
}

/**
 * Genera el state de un perfil demo. `weeks` controla cuántas semanas hacia atrás.
 */
export function demoState(now = new Date(), { weeks = 4 } = {}) {
  const today = isoOf(now)
  const week0 = isoOf(startOfWeek(today, 1))
  const workouts = []

  for (let wk = 0; wk < weeks; wk++) {
    for (const r of PLAN) {
      const d = isoAdd(week0, -7 * wk + (r.weekday - 1))
      if (d > today) continue   // no se entrena el futuro
      workouts.push({
        id: `demo-${wk}-${r.id}`,
        d,
        start: ts(d),
        end: ts(d) + 62 * 60000,
        routineId: r.id,
        name: r.name,
        entries: r.ex.map(cfg => entryFor(cfg, wk)),
      })
    }
  }
  workouts.sort((a, b) => a.d.localeCompare(b.d))

  return {
    unit: 'kg',
    weekStart: 1,
    routines: PLAN.map(r => ({ id: r.id, name: r.name, emoji: 'figureStrength', ex: r.ex.map(c => ({ id: c.id, sets: c.sets, reps: c.reps, weight: c.weight })) })),
    week: { 1: ['demo-r1'], 3: ['demo-r2'], 5: ['demo-r3'] },
    dayPlan: {},
    // Pesajes semanales para que la fuerza/volumen relativos tengan base (nunca se muestran).
    bodyweight: [
      { d: isoAdd(week0, -21), w: 69.5 },
      { d: isoAdd(week0, -14), w: 69 },
      { d: isoAdd(week0, -7), w: 68.5 },
      { d: today, w: 68 },
    ],
    customEx: [],
    workouts,
  }
}
