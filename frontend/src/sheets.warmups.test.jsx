// @vitest-environment happy-dom
// Calentamientos en el selector (feature local): al añadir un ejercicio a la rutina o al
// entreno, la fila de acceso aparece arriba de la lista y filtra los movimientos curados.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { exercisePicker } from './sheets.jsx'
import { exerciseNameFor } from './lib/i18n.js'
import { warmupRows } from './lib/warmups.js'

const mounted = []

function renderTop() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({ S: structuredClone(DEF), user: null })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('exercise picker warm-ups', () => {
  it('shows the warm-ups row and filters to the curated list when tapped', () => {
    exercisePicker(vi.fn())
    const host = renderTop()
    const row = [...host.querySelectorAll('.item')].find(el => el.textContent.includes('Calentamientos'))
    expect(row).toBeTruthy()
    act(() => row.click())
    const names = [...host.querySelectorAll('.item .tt')].map(el => el.textContent)
    const curated = new Set(warmupRows().map(r => exerciseNameFor(r.ex)))
    expect(names.length).toBe(50)   // el tope inicial del selector
    for (const n of names) expect(curated.has(n)).toBe(true)
    const chip = [...host.querySelectorAll('.chips .chip')].find(b => b.textContent === 'Calentamientos')
    expect(chip.className).toContain('on')
  })

  it('filters warm-ups by curated muscle without leaving the scope', () => {
    exercisePicker(vi.fn())
    const host = renderTop()
    act(() => [...host.querySelectorAll('.item')].find(el => el.textContent.includes('Calentamientos')).click())
    expect(host.querySelector('.search input').placeholder).toBe('Buscar en calentamientos…')
    const chest = [...host.querySelectorAll('.chips .chip')].find(b => b.textContent === 'Chest')
    expect(chest).toBeTruthy()
    act(() => chest.click())
    const warm = [...host.querySelectorAll('.chips .chip')].find(b => b.textContent === 'Calentamientos')
    expect(warm.className).toContain('on')
    const chestNames = new Set(warmupRows().filter(r => r.m === 'chest').map(r => exerciseNameFor(r.ex)))
    const names = [...host.querySelectorAll('.item .tt')].map(el => el.textContent)
    expect(names.length).toBe(chestNames.size)
    for (const n of names) expect(chestNames.has(n)).toBe(true)
  })
})
