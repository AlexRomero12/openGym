import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRanking } from '../lib/ranking.js'

const NOW = new Date('2026-09-16T12:00:00')
const baseConfig = {
  title: 'T', unit: 'kg', weekStart: 1, historyWeeks: 4, minParticipantsPerExercise: 1,
  participants: [{ uid: 'u1', name: 'Uno', emoji: '💪', share: true }],
}

function state(over = {}) {
  return {
    unit: 'kg',
    weekStart: 1,
    routines: [{ id: 'r1', name: 'D1', ex: [] }],
    week: { 1: ['r1'], 3: ['r1'], 5: ['r1'] },
    dayPlan: {},
    bodyweight: [],
    customEx: [],
    workouts: [
      { d: '2026-09-14', start: 1, end: 2, entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] },
      { d: '2026-09-16', start: 3, end: 4, entries: [{ id: '0025', sets: [
        { w: 60, r: 5, done: true, phase: 'warmup' },
        { w: 100, r: 5, done: true },
      ] }] },
    ],
    ...over,
  }
}

const run = (S, config = baseConfig) => buildRanking({ users: new Map([['u1', { id: 'u1', name: 'Uno' }]]), states: new Map([['u1', S]]) }, config, NOW)

test('volumen de la semana: excluye warm-ups y suma series completadas', () => {
  const r = run(state())
  assert.equal(r.participants[0].week.volume, 1000)
})

test('cumplimiento: días hechos / días planificados', () => {
  const r = run(state())
  assert.equal(r.participants[0].week.done, 2)
  assert.equal(r.participants[0].week.planned, 3)
  assert.equal(r.participants[0].week.ratio, 0.7)
})

test('e1RM Epley por ejercicio: 100x5 = 116.7', () => {
  const r = run(state())
  const bench = r.exercises.find(e => e.id === '0025')
  assert.ok(bench, 'la banca debe aparecer')
  assert.equal(bench.entries[0].est, 116.7)
  assert.equal(bench.name, 'barbell bench press')
})

test('un perfil en lb se normaliza a kg para el ranking', () => {
  const S = state({ unit: 'lb', workouts: [
    { d: '2026-09-14', start: 1, end: 2, entries: [{ id: '0025', sets: [{ w: 220, r: 5, done: true }] }] },
  ] })
  const r = run(S)
  // 220 lb ≈ 99.79 kg; Epley 99.79*(1+5/30)=116.4 kg
  assert.equal(r.exercises[0].entries[0].est, 116.4)
})

test('opt-in: share:false deja al perfil fuera', () => {
  const config = { ...baseConfig, participants: [{ uid: 'u1', name: 'Uno', share: false }] }
  const r = buildRanking({ users: new Map(), states: new Map([['u1', state()]]) }, config, NOW)
  assert.equal(r.participantCount, 0)
})

test('granularidad: compliance:false oculta ratio pero mantiene volumen', () => {
  const config = { ...baseConfig, participants: [{ uid: 'u1', name: 'Uno', share: { compliance: false } }] }
  const r = run(state(), config)
  assert.equal(r.participants[0].week.ratio, null)
  assert.equal(r.participants[0].week.volume, 1000)
})

test('histórico: 4 semanas, la actual primero', () => {
  const r = run(state())
  assert.equal(r.history.length, 4)
  assert.equal(r.history[0].start, '2026-09-14')
  assert.equal(r.history[1].start, '2026-09-07')
})

const runRel = (S, config = baseConfig) => buildRanking(
  { users: new Map([['u1', { id: 'u1', name: 'Uno' }]]), states: new Map([['u1', S]]) }, config, NOW, 'rel')

test('fuerza relativa: e1RM ÷ peso corporal (×veces tu peso)', () => {
  const S = state({ bodyweight: [{ d: '2026-09-01', w: 50 }] })
  const r = runRel(S)
  const bench = r.exercises.find(e => e.id === '0025')
  assert.equal(bench.entries[0].rel, 2.3)         // 116.7 / 50
  assert.equal(bench.entries[0].est, undefined)   // en relativo los kg NO viajan
  assert.equal(bench.entries[0].w, undefined)
})

test('mejora: PR de la semana vs el mejor anterior', () => {
  const S = state({ workouts: [
    { d: '2026-09-07', start: 1, end: 2, entries: [{ id: '0025', sets: [{ w: 90, r: 5, done: true }] }] },
    { d: '2026-09-14', start: 3, end: 4, entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }] },
  ] })
  const r = run(S)
  assert.equal(r.improvement.length, 1)
  assert.equal(r.improvement[0].prs, 1)
  assert.equal(r.improvement[0].gainPct, 11.1)   // (116.7-105)/105
  assert.equal(r.improvement[0].best.name, 'barbell bench press')
})

test('mejora: un ejercicio nuevo (sin base previa) no cuenta', () => {
  const r = run(state())
  assert.equal(r.improvement.length, 0)
})

test('volumen relativo: tonelaje ÷ peso corporal', () => {
  const S = state({ bodyweight: [{ d: '2026-09-01', w: 50 }] })
  const r = runRel(S)
  assert.equal(r.participants[0].week.volume, 20) // 1000 / 50
  assert.equal(r.norm, 'rel')
})

test('sin peso corporal el modo relativo no inventa: queda fuera', () => {
  const r = runRel(state())
  assert.equal(r.participants[0].week.volume, null)
  assert.equal(r.exercises.length, 0)
})
