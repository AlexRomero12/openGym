import { afterEach, describe, it, expect } from 'vitest'
import { EXIDX } from './exercises.js'
import { MUSCLES } from './muscles.js'
import { _setLangState } from './i18n-core.js'
import es from '../locales/es.js'
import { WARMUPS, isWarmup, warmupOf, warmupOrder, warmupRows, warmupSections, warmupMatches } from './warmups.js'

describe('calentamientos curados', () => {
  it('cada id existe en el catálogo, sin duplicados, y tiene imagen', () => {
    const seen = new Set()
    for (const w of WARMUPS) {
      expect(seen.has(w.id), `duplicado ${w.id}`).toBe(false)
      seen.add(w.id)
      const ex = EXIDX[w.id]
      expect(ex, `falta ${w.id}`).toBeTruthy()
      expect(ex.img, `sin imagen ${w.id}`).toBeTruthy()
    }
  })

  it('cada ejercicio está asignado a un músculo dibujable, o a la parte general', () => {
    for (const w of WARMUPS) {
      if (w.m == null) continue
      expect(MUSCLES, `${w.id} → ${w.m}`).toContain(w.m)
      expect(['cardio', 'activacion', 'movilidad', 'estiramiento'], w.id).toContain(w.k)
    }
  })

  it('isWarmup reconoce la lista y rechaza un ejercicio común', () => {
    expect(isWarmup(WARMUPS[0].id)).toBe(true)
    expect(warmupOf(WARMUPS[0].id).k).toBeTruthy()
    expect(isWarmup('0025')).toBe(false)     // barbell bench press
    expect(warmupOf('0025')).toBe(null)
    expect(warmupOrder(WARMUPS[0].id)).toBe(0)
    expect(warmupOrder('0025')).toBe(Infinity)
  })

  it('warmupRows resuelve el catálogo y warmupSections agrupa general primero y por músculo', () => {
    const rows = warmupRows()
    expect(rows.length).toBe(WARMUPS.length)
    for (const r of rows) expect(r.ex.id).toBe(r.id)

    const sections = warmupSections()
    expect(sections[0].key).toBe('general')
    const keys = sections.map(s => s.key).filter(k => k !== 'general')
    expect(keys).toEqual(MUSCLES.filter(m => keys.includes(m)))
    expect(sections.reduce((n, s) => n + s.items.length, 0)).toBe(WARMUPS.length)
  })
})

describe('búsqueda de calentamientos por músculo', () => {
  afterEach(() => _setLangState('en', null, null, null))

  it('encuentra por el músculo curado aunque el dataset use otro nombre', () => {
    // «chest and front of shoulder stretch»: el dataset lo etiqueta «pectorals», el curado «chest».
    const row = warmupRows().find(r => r.id === '1271')
    expect(row.m).toBe('chest')
    expect(EXIDX[row.id].tg).toBe('pectorals')
    expect(warmupMatches(row.ex, 'chest')).toBe(true)
    expect(warmupMatches(row, 'chest')).toBe(true)
    _setLangState('es', es, null, null)
    expect(warmupMatches(row.ex, 'pecho')).toBe(true)
    expect(warmupMatches(row.ex, 'cuádriceps')).toBe(false)
  })

  it('entiende el slug y el nombre del músculo, en los dos idiomas', () => {
    const hip = warmupRows().find(r => r.id === '1559')   // hip flexor stretch, tg «glutes»
    expect(warmupMatches(hip.ex, 'hip flexors')).toBe(true)
    expect(warmupMatches(hip.ex, 'hip-flexors')).toBe(true)
    _setLangState('es', es, null, null)
    expect(warmupMatches(hip.ex, 'flexores de cadera')).toBe(true)
  })

  it('sin consulta no filtra, y una consulta sin coincidencia no encuentra nada', () => {
    expect(warmupMatches(warmupRows()[0].ex, '')).toBe(true)
    expect(warmupMatches(warmupRows()[0].ex, 'zzzz')).toBe(false)
  })
})
