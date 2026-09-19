import { describe, expect, it } from 'vitest'
import { territoryOf } from './territory.js'

const participants = [
  { uid: 'a', name: 'Ana', color: 'lime' },
  { uid: 'b', name: 'Beto', color: 'sky' },
]
const week = { start: '2026-09-14', end: '2026-09-20' }

describe('territoryOf', () => {
  it('semanal: promedia weekExercises por músculo y exige dos contendientes', () => {
    const data = {
      participants, week,
      weekExercises: [
        { id: '0043', entries: [{ uid: 'a', rel: 1 }, { uid: 'b', rel: 0.8 }] },
        { id: '0585', entries: [{ uid: 'a', rel: 0.6 }, { uid: 'b', rel: 0.4 }] },
      ],
    }
    const t = territoryOf(data)
    expect(t.owners.quadriceps).toMatchObject({ name: 'Ana', avg: 0.8, direct: true })   // (1+0.6)/2
    expect(t.owners.gluteal).toMatchObject({ name: 'Ana', avg: 1, direct: true })        // solo 0043
    expect(t.owners.hamstring).toMatchObject({ name: 'Ana', avg: 1, direct: false })     // 0.4 secundario
  })

  it('con un solo contendiente de la semana, el músculo queda gris', () => {
    const data = { participants, week, weekExercises: [{ id: '0585', entries: [{ uid: 'a', rel: 0.9 }] }] }
    expect(territoryOf(data).owners.quadriceps).toBeUndefined()
    expect(territoryOf(data).list).toEqual([])
  })

  it('sin weekExercises (api viejo) cae a la última semana de series, no al récord', () => {
    const data = {
      participants, week,
      exercises: [{
        id: '0043',
        entries: [
          { uid: 'a', rel: 9, series: [{ w: '2026-09-07', rel: 0.9 }, { w: '2026-09-14', rel: 1.1 }] },
          { uid: 'b', rel: 9, series: [{ w: '2026-09-07', rel: 0.7 }, { w: '2026-09-14', rel: null }] },
        ],
      }],
    }
    expect(territoryOf(data).owners.quadriceps).toBeUndefined()
    data.exercises[0].entries[1].series[1].rel = 0.5
    expect(territoryOf(data).owners.quadriceps).toMatchObject({ name: 'Ana', avg: 1.1 })
  })
})
