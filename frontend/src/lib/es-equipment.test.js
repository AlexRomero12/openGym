// The equipment chips in the Coach intake are built from the catalogue's own taxonomy, so they
// live or die with the Spanish pack — and they were the one place painting the raw id at a
// person ("smith machine" on a Spanish screen). This pins every id the catalogue uses to a
// real name, and pins the intake's rule: the chips read that name through t().
import { afterEach, describe, expect, test } from 'vitest'
import es from '../locales/es.js'
import { EXDB } from './exercises-data.js'
import { _setLangState, t } from './i18n-core.js'

// Borrowed words Spanish keeps as they are; everything else must actually change.
const SAME = new Set(['kettlebell'])

describe('Spanish equipment names', () => {
  const ids = [...new Set(EXDB.map(e => e.eq).filter(Boolean))]
  afterEach(() => _setLangState('en', {}, null, null))

  test('every equipment id the catalogue uses has a Spanish name', () => {
    expect(ids.length).toBeGreaterThan(10)
    for (const id of ids) expect(es[id]?.trim(), id).toBeTruthy()
  })

  test('t() on an equipment id returns the Spanish name, never the raw id', () => {
    _setLangState('es', es, null, null)
    for (const id of ids) {
      expect(t(id), id).toBeTruthy()
      if (!SAME.has(id)) expect(t(id), id).not.toBe(id)
    }
  })
})
