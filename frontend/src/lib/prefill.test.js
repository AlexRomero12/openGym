import { describe, it, expect } from 'vitest'
import { prefillFor, setPrefill, clearPrefill, sweepPrefill, PREFILL_MAX_DATES } from './prefill.js'

const state = () => ({ prefill: {} })

describe('the one-session weight override', () => {
  it('stores one weight per exercise and date, and hands it back without the wrapper', () => {
    const s = state()
    expect(setPrefill(s, '2026-09-19', '0001', 82.5, 111)).toBe(true)
    expect(prefillFor(s, '2026-09-19')).toEqual({ '0001': { w: 82.5 } })
    expect(s.prefill['2026-09-19'].at).toBe(111)
  })

  it('refuses anything that is not a real working weight', () => {
    const s = state()
    for (const w of [0, -5, NaN, null, 'heavy']) {
      expect(setPrefill(s, '2026-09-19', '0001', w)).toBe(false)
    }
    expect(setPrefill(s, '', '0001', 80)).toBe(false)
    expect(setPrefill(s, '2026-09-19', '', 80)).toBe(false)
    expect(prefillFor(s, '2026-09-19')).toBeNull()
  })

  it('a second write for the same exercise replaces the first', () => {
    const s = state()
    setPrefill(s, '2026-09-19', '0001', 80)
    setPrefill(s, '2026-09-19', '0001', 82.5)
    expect(prefillFor(s, '2026-09-19')).toEqual({ '0001': { w: 82.5 } })
  })

  it('clearing a date removes only that date', () => {
    const s = state()
    setPrefill(s, '2026-09-19', '0001', 80)
    setPrefill(s, '2026-09-20', '0001', 85)
    clearPrefill(s, '2026-09-19')
    expect(prefillFor(s, '2026-09-19')).toBeNull()
    expect(prefillFor(s, '2026-09-20')).toEqual({ '0001': { w: 85 } })
  })

  it('a sweep drops past dates and caps the map, oldest first', () => {
    const s = state()
    setPrefill(s, '2026-09-18', '0001', 80)
    setPrefill(s, '2026-09-19', '0001', 81)
    for (let i = 0; i < PREFILL_MAX_DATES + 3; i++) {
      const d = new Date('2026-10-01T12:00:00')
      d.setDate(d.getDate() + i)
      setPrefill(s, d.toISOString().slice(0, 10), '0001', 50 + i)
    }
    sweepPrefill(s, '2026-09-19')
    expect(prefillFor(s, '2026-09-18')).toBeNull()
    expect(Object.keys(s.prefill).length).toBe(PREFILL_MAX_DATES)
    const kept = Object.keys(s.prefill).sort()
    expect(kept[0]).toBe('2026-10-04')       // the oldest three of the seventeen went
    expect(kept[kept.length - 1]).toBe('2026-10-17')
  })
})
