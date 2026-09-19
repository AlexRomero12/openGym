import { describe, it, expect } from 'vitest'
import { parseRichText, richSpans, plainRichText } from './rich-text.js'

describe('richSpans', () => {
  it('reads bold and italic, in that order, and leaves the rest as text', () => {
    expect(richSpans('sin **marcar** y con *énfasis*')).toEqual([
      { text: 'sin ' },
      { text: 'marcar', b: true },
      { text: ' y con ' },
      { text: 'énfasis', i: true }
    ])
  })
  it('never lets a marker cross a line', () => {
    expect(richSpans('**abierto\ny cerrado**')).toEqual([{ text: '**abierto\ny cerrado**' }])
  })
  it('two bold runs in one line stay two', () => {
    expect(richSpans('**press** y **remo**')).toEqual([
      { text: 'press', b: true },
      { text: ' y ' },
      { text: 'remo', b: true }
    ])
  })
  it('empty and non-string input is empty, never a crash', () => {
    expect(richSpans(null)).toEqual([])
    expect(richSpans(undefined)).toEqual([])
    expect(richSpans('')).toEqual([])
  })
})

describe('parseRichText', () => {
  it('keeps consecutive lines in one paragraph, blank lines apart', () => {
    expect(parseRichText('uno\ndos\n\ntres')).toEqual([
      { type: 'p', spans: [{ text: 'uno\ndos' }] },
      { type: 'p', spans: [{ text: 'tres' }] }
    ])
  })
  it('groups bullets and closes them at a blank line', () => {
    const blocks = parseRichText('- press\n- remo\n\nsiguiente')
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'ul', items: [[{ text: 'press' }], [{ text: 'remo' }]] })
    expect(blocks[1].type).toBe('p')
  })
  it('a ## line is a heading, drawn apart from the paragraphs', () => {
    expect(parseRichText('antes\n## Resumen\n- uno').map(b => b.type)).toEqual(['p', 'h', 'ul'])
    expect(parseRichText('## Resumen')[0].spans).toEqual([{ text: 'Resumen' }])
  })
  it('markers that never close stay literal text', () => {
    expect(plainRichText('**no cierra y el párrafo sigue')).toBe('**no cierra y el párrafo sigue')
  })
  it('plainRichText drops the markers for history rows and toasts', () => {
    expect(plainRichText('## Título\nhola **fuerte**\n- uno\n- dos')).toBe('Título\nhola fuerte\nuno · dos')
  })
  it('carriage returns and trailing spaces do not leak into the output', () => {
    expect(parseRichText('hola  \r\nmundo')).toEqual([{ type: 'p', spans: [{ text: 'hola\nmundo' }] }])
  })
})
