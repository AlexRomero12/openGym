import { describe, it, expect } from 'vitest'
import { buildSessionPost } from './social-post.js'

const S = { unit: 'kg', routines: [] }
const workout = (entries, extra = {}) => ({
  start: 0, end: 3600000, vol: 800, entries, ...extra,
})

describe('session post muscle distribution', () => {
  it('summarizes effective sets per muscle, warm-ups excluded', () => {
    const w = workout([{
      id: '0025',
      sets: [
        { w: 40, r: 5, done: true, phase: 'warmup' },
        { w: 80, r: 5, done: true },
        { w: 80, r: 5, done: true },
      ],
    }])
    const post = buildSessionPost(S, w)
    expect(post.muscles).toEqual({ chest: 2, triceps: 0.8, deltoids: 0.8, biceps: 0.8 })
    expect(post.sets).toBe(2)
  })

  it('uses the retained snapshot of a deleted custom exercise', () => {
    const w = workout([{
      id: 'deleted-custom',
      muscleSnapshot: { muscleWeights: { abs: 1 } },
      sets: [{ w: 0, r: 10, done: true }],
    }])
    expect(buildSessionPost(S, w).muscles).toEqual({ abs: 1 })
  })

  it('omits the field when no set was completed', () => {
    const w = workout([{
      id: '0025',
      sets: [{ w: 40, r: 5, done: true, phase: 'warmup' }],
    }])
    expect('muscles' in buildSessionPost(S, w)).toBe(false)
  })
})
