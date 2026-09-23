import { describe, it, expect } from 'vitest'
import {
  SITES, SITE_KEYS, lengthUnit, convertLength, lastMeasurement, lastFor,
  seriesFor, deltaFor, sitesLogged, upsertMeasurement,
} from './measurements.js'

describe('lengthUnit', () => {
  it('follows the weight unit: kg → cm, lb → in', () => {
    expect(lengthUnit('kg')).toBe('cm')
    expect(lengthUnit('lb')).toBe('in')
    expect(lengthUnit(undefined)).toBe('cm')
  })
})

describe('convertLength', () => {
  it('rounds cm to a half and inches to a quarter', () => {
    expect(convertLength(80, 'cm', 'in')).toBe(31.5)
    expect(convertLength(32, 'in', 'cm')).toBe(81.5)
  })
  it('leaves the value alone for the same unit, nothing, or garbage', () => {
    expect(convertLength(80, 'cm', 'cm')).toBe(80)
    expect(convertLength(null, 'cm', 'in')).toBe(null)
    expect(convertLength('', 'cm', 'in')).toBe('')
    expect(convertLength('abc', 'cm', 'in')).toBe('abc')
  })
  it('round-trips the common tape-measure readings', () => {
    for (const cm of [70, 75, 80, 82, 90]) {
      expect(convertLength(convertLength(cm, 'cm', 'in'), 'in', 'cm')).toBe(cm)
    }
  })
})

describe('seriesFor / lastFor / deltaFor', () => {
  const S = { measurements: [
    { d: '2026-09-01', t: 1, m: { waist: 82, chest: 100 } },
    { d: '2026-09-15', t: 2, m: { waist: 81 } },
    { d: '2026-09-29', t: 3, m: { waist: 80, arm: 35 } },
  ] }

  it('charts only the days that logged the site', () => {
    expect(seriesFor(S, 'waist').map(p => p.y)).toEqual([82, 81, 80])
    expect(seriesFor(S, 'chest').map(p => p.d)).toEqual(['2026-09-01'])
    expect(seriesFor(S, 'thigh')).toEqual([])
  })
  it('reads the last value of a site, skipping days without it', () => {
    expect(lastFor(S, 'waist')).toEqual({ d: '2026-09-29', t: 3, y: 80 })
    expect(lastFor(S, 'arm')).toEqual({ d: '2026-09-29', t: 3, y: 35 })
    expect(lastFor(S, 'chest')).toEqual({ d: '2026-09-01', t: 1, y: 100 })
    expect(lastFor(S, 'thigh')).toBe(null)
  })
  it('deltas against the previous reading of the same site', () => {
    expect(deltaFor(S, 'waist')).toBe(-1)
    expect(deltaFor(S, 'chest')).toBe(null)   // a single reading has nothing to compare
  })
  it('lists the sites that have a reading', () => {
    expect(sitesLogged(S)).toEqual(['waist', 'chest', 'arm'])
    expect(sitesLogged({})).toEqual([])
  })
  it('reports the last day logged', () => {
    expect(lastMeasurement(S).d).toBe('2026-09-29')
    expect(lastMeasurement({})).toBe(null)
  })
})

describe('upsertMeasurement', () => {
  it('creates a day, then merges a same-day edit without touching other sites', () => {
    let S = upsertMeasurement({}, '2026-09-23', { waist: 82, chest: 100 }, 10)
    expect(S).toEqual([{ d: '2026-09-23', t: 10, m: { waist: 82, chest: 100 } }])
    S = upsertMeasurement({ measurements: S }, '2026-09-23', { waist: 81 }, 20)
    expect(S).toEqual([{ d: '2026-09-23', t: 20, m: { waist: 81, chest: 100 } }])
  })
  it('drops a cleared site, and a day left with no sites', () => {
    const S = { measurements: [{ d: '2026-09-23', t: 10, m: { waist: 82, chest: 100 } }] }
    expect(upsertMeasurement(S, '2026-09-23', { chest: null }, 20)[0].m).toEqual({ waist: 82 })
    expect(upsertMeasurement(S, '2026-09-23', { waist: 0, chest: '' }, 20)).toEqual([])
  })
  it('keeps days sorted and does not mutate the input', () => {
    const S = { measurements: [{ d: '2026-09-23', t: 1, m: { waist: 82 } }] }
    const out = upsertMeasurement(S, '2026-09-01', { waist: 84 }, 2)
    expect(out.map(e => e.d)).toEqual(['2026-09-01', '2026-09-23'])
    expect(S.measurements).toHaveLength(1)
  })
})

describe('SITES', () => {
  it('exposes the four tracked sites', () => {
    expect(SITE_KEYS).toEqual(['waist', 'chest', 'arm', 'thigh'])
    expect(SITES.every(s => s.label && s.key)).toBe(true)
  })
})
