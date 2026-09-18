// @vitest-environment happy-dom
// La Biblioteca vive como apartado dentro de Plan (pestañas Rutinas | Ejercicios): el menú
// inferior mantiene cinco pestañas y «Calentamientos» queda a un tap.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Plan from './Plan.jsx'
import { DEF, useStore } from '../store/useStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../sheets.jsx', () => ({
  dayAssignSheet: vi.fn(), dayAddRoutineSheet: vi.fn(), starterPlanSheet: vi.fn(), planToolsSheet: vi.fn(),
  exerciseDetailSheet: vi.fn(), addToRoutineSheet: vi.fn(), customExSheet: vi.fn(),
}))

let root, host
beforeEach(() => {
  localStorage.clear()
  useStore.setState({ S: structuredClone(DEF), user: null, config: {} })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(
    <MemoryRouter initialEntries={['/plan']}>
      <Routes><Route path="/plan" element={<Plan />} /></Routes>
    </MemoryRouter>
  ))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const seg = label => [...host.querySelectorAll('.seg button')].find(b => b.textContent === label)

describe('Plan sections', () => {
  it('shows the routines first, and the library under the Exercises tab', () => {
    expect(host.textContent).toContain('Week schedule')
    act(() => seg('Exercises').click())
    expect(host.textContent).not.toContain('Week schedule')
    expect(host.textContent).toContain('Calentamientos')
    expect(host.querySelector('.search input')).not.toBeNull()
    act(() => seg('Routines').click())
    expect(host.textContent).toContain('Week schedule')
  })
})
