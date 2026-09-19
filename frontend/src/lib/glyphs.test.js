import { describe, it, expect } from 'vitest'
import { DEFAULT_GLYPH, GLYPHS, glyphOf } from './glyphs.js'
import { ICON_NAMES } from '../components/Icon.jsx'

describe('routine glyphs', () => {
  it('passes icon keys through and every offered glyph is a real icon', () => {
    for (const g of GLYPHS) {
      expect(ICON_NAMES).toContain(g)
      expect(glyphOf(g)).toBe(g)
    }
    expect(glyphOf('figureStrength')).toBe('figureStrength')
  })

  it('maps legacy emoji, including multi-codepoint ones', () => {
    expect(glyphOf('💪')).toBe('arm')
    expect(glyphOf('🏋️')).toBe('dumbbell')
    expect(glyphOf('❤️‍🔥')).toBe('heart')
  })

  it('falls back to the default for empty or unknown values', () => {
    expect(glyphOf('')).toBe(DEFAULT_GLYPH)
    expect(glyphOf(undefined)).toBe(DEFAULT_GLYPH)
    expect(glyphOf('🥑')).toBe(DEFAULT_GLYPH)
  })
})
