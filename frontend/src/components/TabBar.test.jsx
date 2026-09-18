// @vitest-environment happy-dom
// El menú mantiene cinco pestañas simétricas: la Biblioteca (Ejercicios) vive dentro de Plan
// como apartado, no como pestaña propia.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { DEF, useStore } from '../store/useStore.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, host
beforeEach(() => {
  localStorage.clear()
  useStore.setState({ S: structuredClone(DEF), user: { name: 'Alex' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<MemoryRouter initialEntries={['/home']}><TabBar onStart={vi.fn()} /></MemoryRouter>))
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('TabBar', () => {
  it('keeps the menu symmetric, with Amigos but no Exercises tab', () => {
    const labels = [...host.querySelectorAll('#tabbar button span')].map(el => el.textContent)
    expect(labels).toContain('Amigos')
    expect(labels).not.toContain('Exercises')
  })

  it('lights the Plan tab on the Library and its sub-views', () => {
    for (const path of ['/library', '/muscles', '/warmups']) {
      act(() => root.unmount())
      root = createRoot(host)
      act(() => root.render(<MemoryRouter initialEntries={[path]}><TabBar onStart={vi.fn()} /></MemoryRouter>))
      const plan = [...host.querySelectorAll('#tabbar button')].find(b => b.textContent.includes('Plan'))
      expect(plan.className, path).toContain('on')
    }
  })
})
