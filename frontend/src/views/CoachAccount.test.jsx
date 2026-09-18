// @vitest-environment happy-dom
// The profile-mode account screen: choose a provider, check the key by listing models, file it.
// What these pin is the write-only promise — the key goes up with the save call and the screen
// never expects it back — plus the two states that make the screen honest: a shared-account
// instance has nothing to connect, and a connected profile can leave.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoachAccount from './CoachAccount.jsx'

const mocks = vi.hoisted(() => ({
  nav: vi.fn(), toast: vi.fn(), confirmSheet: vi.fn(),
  setup: null, models: null, connect: null, disconnect: null
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))
vi.mock('../store/useUI.js', () => {
  const useUI = selector => selector ? selector({ toast: mocks.toast }) : { toast: mocks.toast }
  useUI.getState = () => ({ toast: mocks.toast })
  return { useUI }
})
vi.mock('../sheets.jsx', () => ({ confirmSheet: (...a) => mocks.confirmSheet(...a) }))
vi.mock('../lib/coach-api.js', () => ({
  coachSetup: (...a) => mocks.setup(...a),
  coachModels: (...a) => mocks.models(...a),
  coachConnect: (...a) => mocks.connect(...a),
  coachDisconnect: (...a) => mocks.disconnect(...a)
}))

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic API', keyPlaceholder: 'sk-ant-…', baseUrl: false, keyOptional: false, defaultModel: 'claude-opus-5' },
  { id: 'compatible', label: 'OpenAI-compatible endpoint', keyPlaceholder: '(optional)', baseUrl: true, keyOptional: true, defaultModel: null },
  { id: 'opencode-go', label: 'OpenCode Go', keyPlaceholder: 'sk-…', baseUrl: false, keyOptional: false, defaultModel: null, efforts: ['off', 'low', 'medium', 'high', 'max'], defaultEffort: 'off', effortsForModels: 'deepseek' }
]

let root, container
async function mount(setup) {
  mocks.setup = vi.fn(() => Promise.resolve(setup))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(React.createElement(CoachAccount)) })
  await act(async () => {})   // let the setup promise settle
}

const byText = re => [...container.querySelectorAll('button')].find(b => re.test(b.textContent || ''))
async function click(el) {
  expect(el).toBeTruthy()
  await act(async () => { el.dispatchEvent(new Event('click', { bubbles: true })) })
}
async function type(input, value) {
  Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
afterEach(async () => {
  if (root) { await act(async () => { root.unmount() }); root = null }
  container = null
})

describe('my AI account', () => {
  it('connects a profile: pick a provider, check the key, save', async () => {
    await mount({ authMode: 'profile', canConnect: true, connected: false, providers: PROVIDERS })
    mocks.models = vi.fn(() => Promise.resolve({ ok: true, models: ['claude-opus-5', 'claude-sonnet-5'] }))
    mocks.connect = vi.fn(() => Promise.resolve({ ok: true }))

    await type(container.querySelector('input[type="password"]'), 'sk-ant-test')
    await click(byText(/Check my key and list models/))
    expect(mocks.models).toHaveBeenCalledWith('anthropic', 'sk-ant-test', '')

    const select = container.querySelector('select')
    expect(select).toBeTruthy()
    expect([...select.querySelectorAll('option')].map(o => o.value)).toContain('claude-opus-5')
    await act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })) })

    await click(byText(/Save and use the Coach/))
    expect(mocks.connect).toHaveBeenCalledWith({ provider: 'anthropic', key: 'sk-ant-test', model: 'claude-opus-5', effort: null, baseUrl: null })
    expect(mocks.toast).toHaveBeenCalled()
  })

  it('a shared-account instance offers nothing to connect', async () => {
    await mount({ authMode: 'instance', canConnect: false, connected: false, providers: PROVIDERS })
    expect(container.textContent).toMatch(/shared account/)
    expect(byText(/Check my key/)).toBeFalsy()
  })

  it('a connected profile can change or leave', async () => {
    await mount({ authMode: 'profile', canConnect: true, connected: true, provider: 'openai', providerLabel: 'OpenAI API', model: 'gpt-5.6', providers: PROVIDERS })
    expect(container.textContent).toContain('OpenAI API')
    expect(container.textContent).toContain('gpt-5.6')

    await click(byText(/Remove my account/))
    expect(mocks.confirmSheet).toHaveBeenCalled()
    mocks.disconnect = vi.fn(() => Promise.resolve({ ok: true }))
    const cfg = mocks.confirmSheet.mock.calls.at(-1)[0]
    await act(async () => { await cfg.onConfirm() })
    expect(mocks.disconnect).toHaveBeenCalled()
  })

  it('offers the effort for the models that take one, and hides it for those that do not', async () => {
    await mount({ authMode: 'profile', canConnect: true, connected: false, providers: PROVIDERS })
    mocks.models = vi.fn(() => Promise.resolve({ ok: true, models: ['deepseek-v4.1-flash', 'glm-5.3-flash'] }))
    mocks.connect = vi.fn(() => Promise.resolve({ ok: true }))

    // Anthropic has no such control: key in, models listed, and still one select only.
    await type(container.querySelector('input[type="password"]'), 'sk-ant-test')
    await click(byText(/Check my key and list models/))
    expect([...container.querySelectorAll('select')].length).toBe(1)
    expect(container.textContent).not.toContain('Esfuerzo')

    // The gateway's DeepSeek models do. Switching chip re-renders the form for that provider.
    await click(byText(/OpenCode Go/))
    await type(container.querySelector('input[type="password"]'), 'sk-oc-test')
    await click(byText(/Check my key and list models/))
    expect([...container.querySelectorAll('select')].length).toBe(1)

    // A DeepSeek default model brings the effort picker out with its options.
    await mount({ authMode: 'profile', canConnect: true, connected: false, providers: [
      { ...PROVIDERS[2], defaultModel: 'deepseek-v4.1-flash' }
    ] })
    const effortSel = [...container.querySelectorAll('select')].find(s => [...s.querySelectorAll('option')].some(o => o.value === 'off'))
    expect(effortSel).toBeTruthy()
    expect([...effortSel.querySelectorAll('option')].map(o => o.value)).toEqual(['', 'off', 'low', 'medium', 'high', 'max'])
  })
})
