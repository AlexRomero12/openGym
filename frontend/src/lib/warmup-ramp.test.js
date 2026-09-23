import { describe, it, expect } from 'vitest'
import { warmupWeights, warmupFloorBase, buildSets } from './history.js'
import { equipmentStep } from './progression.js'

// The dynamic warm-up ramp: it starts on the exercise's own floor (the empty bar, or a light
// first step when there is no bar) and climbs toward the work weight, always on the exercise's
// real loading grid. See equipmentStep for the step itself.
describe('warmupFloorBase', () => {
  const S = { unit: 'kg', exWeights: {}, workouts: [] }
  it('is the empty bar for a bar exercise', () => {
    expect(warmupFloorBase(S, { id: '0025' })).toBe(20)         // barbell bench press
  })
  it('is zero for bodyweight work — a belt load ramps from nothing', () => {
    expect(warmupFloorBase(S, { id: '0001' })).toBe(0)
  })
  it('is null for equipment with no bar, so the ramp derives a light step instead', () => {
    expect(warmupFloorBase(S, { id: '1274' })).toBeNull()       // dumbbell
    expect(warmupFloorBase(S, { id: '0009' })).toBeNull()       // leverage machine
    expect(warmupFloorBase(S, { id: '0641' })).toBeNull()       // weighted
  })
  it('honours a per-exercise bar weight override', () => {
    expect(warmupFloorBase({ ...S, barWeights: { '0025': 15 } }, { id: '0025' })).toBe(15)
  })
})

describe('warmupWeights', () => {
  it('starts on the bar, then closes half the gap each step (barbell 5 kg grid)', () => {
    expect(warmupWeights(60, 2, 20, 5)).toEqual([20, 30])
    expect(warmupWeights(100, 3, 20, 5)).toEqual([20, 50, 75])
    expect(warmupWeights(140, 4, 20, 5)).toEqual([20, 70, 105, 120])
  })

  it('keeps a non-bar first step loadable on the equipment grid', () => {
    // A 24 kg total on a dumbbell rack that moves 4 kg past 20: 8 and 12 both land.
    expect(warmupWeights(24, 2, 8, equipmentStep({ id: '1274' }, 24, 'kg'))).toEqual([8, 12])
    // A machine stack on a 2.3 kg plate.
    expect(warmupWeights(50, 3, 16.1, 2.3)).toEqual([16.1, 23, 36.8])
  })

  it('ramps bodyweight-with-a-belt from zero', () => {
    expect(warmupWeights(20, 2, 0, 2.5)).toEqual([0, 10])
  })

  it('never reaches the work weight, however the floor falls', () => {
    for (const w of warmupWeights(60, 5, 20, 5)) expect(w).toBeLessThan(60)
    // A floor at or above the work weight leaves nothing to ramp.
    expect(warmupWeights(20, 3, 20, 5)).toEqual([])
    expect(warmupWeights(15, 3, 20, 5)).toEqual([])
  })

  it('returns nothing without a load or a count', () => {
    expect(warmupWeights(0, 3, 0, 2.5)).toEqual([])
    expect(warmupWeights(60, 0, 20, 5)).toEqual([])
  })
})

describe('buildSets warm-up ramp by equipment', () => {
  const S = { unit: 'kg', exWeights: {}, workouts: [] }
  const cfg = (extra) => ({ mode: 'reps', sets: 2, reps: 5, ...extra })

  it('puts the empty bar first on a barbell lift', () => {
    const rows = buildSets(S, cfg({ id: '0025', weight: 60, warmupSets: 2 }), { step: 5 })
    expect(rows.map(r => r.w)).toEqual([20, 30, 60, 60])
    expect(rows.slice(0, 2).every(r => r.phase === 'warmup')).toBe(true)
  })

  it('uses the dumbbell rack grid for a dumbbell lift', () => {
    const rows = buildSets(S, cfg({ id: '1274', weight: 24, warmupSets: 2 }), { step: 4 })
    expect(rows.map(r => r.w)).toEqual([8, 12, 24, 24])
  })

  it('uses the machine plate grid', () => {
    const rows = buildSets(S, cfg({ id: '0009', weight: 50, warmupSets: 3 }), { step: 2.3 })
    expect(rows.map(r => r.w)).toEqual([16.1, 23, 36.8, 50, 50])
  })
})
