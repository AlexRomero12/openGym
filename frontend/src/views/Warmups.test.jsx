// @vitest-environment happy-dom
// Vista «Calentamientos» (feature local): la lista curada del catálogo agrupada por el músculo
// que prepara cada uno, con el mismo patrón de fila que la Biblioteca — imagen, detalle y «Plan».
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Warmups from './Warmups.jsx'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { warmupRows, warmupSections } from '../lib/warmups.js'
import { exerciseDetailSheet, addToRoutineSheet } from '../sheets.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets.jsx', () => ({ exerciseDetailSheet: vi.fn(), addToRoutineSheet: vi.fn() }))
vi.mock('../components/MuscleExplorer.jsx', () => ({ default: ({ catalog }) => <div className="explorer" data-count={(catalog || []).length} /> }))

const mounted = []
function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<Warmups />))
  return host
}
const rows = host => [...host.querySelectorAll('.list .item')]
const titles = host => [...host.querySelectorAll('.sect-t')].map(el => el.textContent)
const setSearch = (host, value) => {
  const input = host.querySelector('.search input')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Warmups', () => {
  it('lists the curated rows grouped by muscle, general first', () => {
    const host = render()
    const expected = warmupSections()
    expect(titles(host)).toEqual(expected.map(s => s.key === 'general' ? 'Calentamiento general' : MUSCLE_NAME[s.key]))
    expect(rows(host).length).toBe(warmupRows().length)
    expect(rows(host).length).toBe([...host.querySelectorAll('.list .item img.thumb')].length)
  })

  it('renders each row with the catalogue name, the kind and the equipment', () => {
    const host = render()
    const list = warmupRows()
    expect(rows(host)[0].querySelector('.tt').textContent).toBe(exerciseNameFor(list[0].ex))
    expect(rows(host)[0].querySelector('.ss').textContent).toBe('Cardio · ' + t(list[0].ex.eq))
    const i = list.findIndex(r => r.k === 'estiramiento')
    const stretch = rows(host).find(row => row.querySelector('.tt').textContent === exerciseNameFor(list[i].ex))
    expect(stretch.querySelector('.ss').textContent).toBe('Estiramiento · ' + t(list[i].ex.eq))
  })

  it('opens the shared exercise detail and plans the warm-up like any exercise', () => {
    const host = render()
    const first = warmupRows()[0]
    act(() => rows(host)[0].querySelector('button').click())
    expect(addToRoutineSheet).toHaveBeenCalledWith(first.ex)
    expect(exerciseDetailSheet).not.toHaveBeenCalled()
    act(() => rows(host)[0].click())
    expect(exerciseDetailSheet).toHaveBeenCalledWith(first.ex)
  })

  it('filters to one muscle with the chips, and back to all', () => {
    const host = render()
    const chest = warmupSections().find(s => s.key === 'chest')
    const chip = [...host.querySelectorAll('.chips .chip')].find(b => b.textContent === 'Chest')
    act(() => chip.click())
    expect(titles(host)).toEqual(['Chest'])
    expect(rows(host).length).toBe(chest.items.length)
    act(() => [...host.querySelectorAll('.chips .chip')].find(b => b.textContent === 'Todos').click())
    expect(titles(host).length).toBe(warmupSections().length)
  })

  it('searches by the curated muscle, not just by the exercise name', () => {
    const host = render()
    setSearch(host, 'hip flexors')
    expect(titles(host)).toContain('Hip flexors')
    expect(titles(host)).not.toContain('Calves')
    const hip = warmupSections().find(s => s.key === 'hip-flexors')
    expect(rows(host).length).toBeGreaterThanOrEqual(hip.items.length)
  })

  it('shows the empty state when the search matches nothing', () => {
    const host = render()
    setSearch(host, 'zzzz')
    expect(rows(host)).toHaveLength(0)
    expect(host.querySelector('.empty')).not.toBeNull()
  })

  it('opens the muscle selector like exercises, from a tinted small button', () => {
    const host = render()
    const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('By muscle'))
    expect(btn.className).toContain('tinted')
    expect(btn.className).toContain('sm')
    act(() => btn.click())
    expect(host.querySelector('.explorer').getAttribute('data-count')).toBe(String(warmupRows().length))
    expect(host.querySelector('.search')).toBeNull()
  })
})
