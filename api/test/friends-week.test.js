/* Semana en curso: `weekExercises` y «Por ejercicio» llevan el mejor e1RM de ESTA semana por
 * ejercicio (api/friends.js). El mapa del frontend agrega por músculo y exige dos contendientes,
 * así que `weekExercises` manda hasta un ejercicio de una sola persona; la lista «Por ejercicio»
 * conserva el mínimo de 2 y el Top N. Acá se fija el contrato: solo la semana en curso (nunca el
 * récord histórico), sin bodyweight no hay `rel`, y los calentamientos no cuentan. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildRanking } from '../friends.js'

const NOW = new Date('2026-09-18T15:00:00Z')   // viernes; la semana arranca el lunes 14
const CONFIG = {
  unit: 'kg', weekStart: 1, historyWeeks: 4, minParticipantsPerExercise: 2,
  participants: [
    { uid: 'a', name: 'Ana', share: true },
    { uid: 'b', name: 'Beto', share: true },
  ],
}
const USERS = new Map([['a', { id: 'a', name: 'Ana' }], ['b', { id: 'b', name: 'Beto' }]])

const state = (workouts, bodyweight = [{ d: '2026-09-01', w: 80 }]) => ({
  unit: 'kg', weekStart: 1, routines: [], week: {}, dayPlan: {}, customEx: [], bodyweight, workouts,
})
const workout = (d, entries) => ({ id: 'w' + d, d, start: 0, end: 0, entries })
const sets = (...list) => ({ sets: list.map(([w, r]) => ({ w, r, done: true })) })

const rank = (a, b, now = NOW) =>
  buildRanking({ users: USERS, states: new Map([['a', a], ['b', b]]) }, CONFIG, now, 'rel')

test('weekExercises y «Por ejercicio» traen lo de la semana, no el récord histórico', () => {
  const a = state([
    workout('2026-09-16', [{ id: '0043', ...sets([100, 5]) }]),   // 116.7 / 80 = 1.5
    workout('2026-08-01', [{ id: '0043', ...sets([200, 1]) }]),   // récord viejo: 200 / 80 = 2.5
  ])
  const b = state([workout('2026-09-15', [{ id: '0043', ...sets([50, 5]) }])])   // 0.7
  const out = rank(a, b)
  assert.deepEqual(out.weekExercises, [{ id: '0043', entries: [{ uid: 'a', rel: 1.5 }, { uid: 'b', rel: 0.7 }] }])
  const list = out.exercises.find(e => e.id === '0043').entries
  assert.equal(list.find(e => e.uid === 'a').rel, 1.5, '«Por ejercicio» también compara la semana')
  assert.equal(list.find(e => e.uid === 'a').improved, false, 'bajar del récord viejo no es mejora de la semana')
  assert.equal(list.find(e => e.uid === 'b').improved, true, 'estrenar el ejercicio en la semana sí lo es')
})

test('un ejercicio de una sola persona entra igual a weekExercises (el mapa decide por músculo)', () => {
  const a = state([workout('2026-09-16', [{ id: '0585', ...sets([40, 10]) }])])   // 53.3 / 80 = 0.7
  const out = rank(a, state([]))
  assert.deepEqual(out.weekExercises, [{ id: '0585', entries: [{ uid: 'a', rel: 0.7 }] }])
  assert.equal(out.exercises.length, 0, 'la lista semanal sigue exigiendo 2+')
})

test('la semana pasada no cuenta para ninguna de las dos', () => {
  const a = state([workout('2026-09-10', [{ id: '0043', ...sets([100, 5]) }])])
  const b = state([workout('2026-09-11', [{ id: '0043', ...sets([50, 5]) }])])
  const out = rank(a, b)
  assert.deepEqual(out.weekExercises, [])
  assert.deepEqual(out.exercises, [])
})

test('sin bodyweight no hay rel y el ejercicio no entra', () => {
  const a = state([workout('2026-09-16', [{ id: '0043', ...sets([100, 5]) }])], [])
  const b = state([workout('2026-09-15', [{ id: '0043', ...sets([50, 5]) }])])
  assert.deepEqual(rank(a, b).weekExercises, [{ id: '0043', entries: [{ uid: 'b', rel: 0.7 }] }])
})

test('los calentamientos no cuentan para la semana', () => {
  const a = state([workout('2026-09-16', [{
    id: '0043',
    sets: [{ w: 200, r: 1, done: true, phase: 'warmup' }, { w: 60, r: 5, done: true }],
  }])])
  const out = rank(a, state([]))
  assert.equal(out.weekExercises[0].entries[0].rel, 0.9)   // 70 / 80
})
