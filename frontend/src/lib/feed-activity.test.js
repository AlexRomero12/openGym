import { describe, it, expect } from 'vitest'
import { postMuscles } from './feed-activity.js'

describe('post muscles', () => {
  it('uses the muscle distribution the post carries', () => {
    expect(postMuscles({ muscles: { chest: 4, triceps: 1.6, biceps: 0 } }))
      .toEqual({ load: { chest: 4, triceps: 1.6 }, estimated: false })
  })

  it('estimates one set per highlighted exercise for legacy posts', () => {
    const { load, estimated } = postMuscles({ top: [{ id: '0025' }, { id: '0025' }, { id: 'custom-1', n: 'Custom' }] })
    expect(estimated).toBe(true)
    expect(load).toEqual({ chest: 2, triceps: 0.8, deltoids: 0.8, biceps: 0.8 })
  })

  it('returns nothing to draw when the post has neither source', () => {
    expect(postMuscles({})).toEqual({ load: {}, estimated: false })
  })
})
