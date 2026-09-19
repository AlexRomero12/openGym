// @vitest-environment happy-dom
// The ask sheet: choosing an exercise has to be visible and confirmed before the question goes
// out — the picker is a separate sheet behind it, and a silent selection read as "nothing
// happened". These pin the checked row, the auto-written question and the Ask call's payload.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AskSheet from './AskSheet.jsx'
import { exercisePicker } from '../sheets.jsx'
import { requestAsk } from '../lib/coach-api.js'
import { exName } from '../lib/coach.js'

vi.mock('../sheets.jsx', () => ({ exercisePicker: vi.fn() }))
vi.mock('../lib/coach-api.js', () => ({ requestAsk: vi.fn(() => Promise.resolve({ job: {} })) }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mounted = []
function render(props) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<AskSheet {...props} />))
  return host
}
const byText = (host, re) => [...host.querySelectorAll('button')].find(b => re.test(b.textContent || ''))
const click = el => act(() => el.dispatchEvent(new Event('click', { bubbles: true })))
const setText = (host, value) => {
  const ta = host.querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
  act(() => { setter.call(ta, value); ta.dispatchEvent(new Event('input', { bubbles: true })) })
}
/** The picker's callback, as the open sheet would hand it to us. */
function picker() {
  const h = { close: vi.fn() }
  exercisePicker.mockReturnValue(h)
  const onPick = () => exercisePicker.mock.calls.at(-1)[0]
  return { h, onPick }
}

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('the ask sheet', () => {
  it('opens with the picked exercise already selected and its question written out', () => {
    const host = render({ close: vi.fn(), ask: vi.fn(), initialEx: { id: '0001' } })
    expect(host.textContent).toContain(exName('0001'))
    expect(host.textContent).toContain('tap to change')
    expect(host.querySelector('textarea').value).toBe(`How is my ${exName('0001')} going? What is my estimated 1RM?`)
  })

  it('shows the selection when picked inside the sheet, and closes the picker behind it', async () => {
    const host = render({ close: vi.fn(), ask: vi.fn() })
    expect(host.textContent).toContain('Any exercise (optional)')

    const { h, onPick } = picker()
    click(byText(host, /Any exercise/))
    await act(async () => onPick()({ id: '0001' }))

    expect(h.close).toHaveBeenCalled()
    expect(host.textContent).toContain(exName('0001'))
    expect(host.textContent).toContain('tap to change')
    expect(host.querySelector('textarea').value).toContain('How is my')
  })

  it('sends the question with the exercise id, and closes the sheet', async () => {
    const close = vi.fn()
    const ask = vi.fn()
    const host = render({ close, ask, initialEx: { id: '0001' } })
    click(byText(host, /^Ask$/))
    expect(close).toHaveBeenCalled()
    expect(ask).toHaveBeenCalled()
    await act(async () => { await ask.mock.calls[0][0]() })
    expect(requestAsk).toHaveBeenCalledWith(expect.stringContaining('How is my'), '0001')
    expect(ask.mock.calls[0][1]).toContain(exName('0001'))
  })

  it('never overwrites a typed question when another exercise is picked', async () => {
    const host = render({ close: vi.fn(), ask: vi.fn(), initialEx: { id: '0001' } })
    setText(host, 'mi pregunta')
    const { onPick } = picker()
    click(byText(host, new RegExp(exName('0001'))))
    await act(async () => onPick()({ id: '0009' }))
    expect(host.querySelector('textarea').value).toBe('mi pregunta')
    expect(host.textContent).toContain(exName('0009'))
  })

  it('removing the exercise clears an auto-written question but keeps a typed one', () => {
    const auto = render({ close: vi.fn(), ask: vi.fn(), initialEx: { id: '0001' } })
    click(byText(auto, /Remove exercise/))
    expect(auto.textContent).toContain('Any exercise (optional)')
    expect(auto.querySelector('textarea').value).toBe('')

    const typed = render({ close: vi.fn(), ask: vi.fn(), initialEx: { id: '0001' } })
    setText(typed, 'mi pregunta')
    click(byText(typed, /Remove exercise/))
    expect(typed.querySelector('textarea').value).toBe('mi pregunta')
  })
})
