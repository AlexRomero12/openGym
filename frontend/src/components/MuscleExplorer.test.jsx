// @vitest-environment happy-dom
// El BodyMap ya elige el músculo: los chips de músculo debajo eran redundantes, así que en su
// lugar vive un filtro Todo / Ejercicios / Calentamientos que filtra la lista del músculo elegido.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MuscleExplorer from './MuscleExplorer.jsx'
import { exerciseNameFor } from '../lib/i18n.js'
import { warmupRows } from '../lib/warmups.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({ S: state.S, user: null, update: mut => { const next = structuredClone(state.S); mut(next); state.S = next } })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('./BodyMap.jsx', () => ({ default: ({ onMuscle }) => <button className="bodymap" onClick={() => onMuscle('chest')}>map</button> }))

const mounted = []
function render() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<MuscleExplorer onDetail={vi.fn()} onPlan={vi.fn()} />))
  return host
}
const rows = host => [...host.querySelectorAll('.list .item')]
const names = host => rows(host).map(r => r.querySelector('.tt').textContent)
const chip = (host, label) => [...host.querySelectorAll('.card .chip')].find(b => b.textContent === label)
const warmNames = new Set(warmupRows().map(r => exerciseNameFor(r.ex)))

beforeEach(() => {
  mocks.S = { unit: 'kg', lang: 'en', routines: [], workouts: [], customEx: [], exWeights: {}, favEx: [], equipProfiles: [], activeEquipId: null, equipFilterOn: false }
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('MuscleExplorer', () => {
  it('drops the muscle chips and offers a type filter instead', () => {
    const host = render()
    expect([...host.querySelectorAll('.card .chip')].map(b => b.textContent)).toEqual(['All', 'Exercises', 'Calentamientos'])
  })

  it('filters the selected muscle to warm-ups or regular exercises', () => {
    const host = render()
    act(() => host.querySelector('.bodymap').click())
    const all = names(host)
    expect(all.length).toBeGreaterThan(0)
    act(() => chip(host, 'Calentamientos').click())
    const warm = names(host)
    expect(warm.length).toBeGreaterThan(0)
    expect(warm.every(n => warmNames.has(n))).toBe(true)
    expect(warm.length).toBeLessThan(all.length)
    act(() => chip(host, 'Exercises').click())
    expect(names(host).some(n => warmNames.has(n))).toBe(false)
  })
})
