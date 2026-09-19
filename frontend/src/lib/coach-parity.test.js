/* The server's copies of three tiny reading rules, pinned against the frontend's originals.
 *
 * api/coach/payload.js re-implements modeOf, isBw and isPerSide because the api container has
 * no build step in common with the frontend and does not copy frontend/ into its image. That
 * trade-off is fine; what is not fine is the copy drifting, which is exactly what happened
 * when v1.2.4 taught the app about bodyweight work and per-side reps: the server kept reading
 * every set as a loaded rep set, so a push-up progression that was working would have looked
 * like a stalled bench press with the weight left at zero.
 *
 * This test only runs under vitest, which can load both runtimes. It compares behaviour over a
 * table of configs rather than comparing source, so the two are free to be written differently
 * as long as they answer the same.
 */
import { describe, it, expect } from 'vitest'
import { modeOf as uiModeOf, isBw as uiIsBw, isPerSide as uiIsPerSide } from './history.js'
import { modeOf as srvModeOf, isBw as srvIsBw, isPerSide as srvIsPerSide } from '../../../api/coach/core/payload.js'
import { exOr } from './exercises.js'
import {
  estimate1RM as uiEstimate1RM, bestSetOf as uiBestSetOf, best1RM as uiBest1RM
} from './onerm.js'
import {
  effectiveRoutineIds as uiEffectiveIds, effectiveRoutines as uiEffectiveRoutines, nextTrainingDay as uiNextDay
} from './history.js'
import {
  estimate1RM as srvEstimate1RM, bestSetOf as srvBestSetOf, best1RM as srvBest1RM
} from '../../../api/coach/core/onerm.js'
import {
  effectiveRoutineIds as srvEffectiveIds, effectiveRoutines as srvEffectiveRoutines, nextTrainingDay as srvNextDay
} from '../../../api/coach/core/plan-read.js'

// Real ids from the catalogue, so `eq`/`bp` are whatever the dataset actually says rather than
// whatever this test assumed. 0001 is a bodyweight sit-up; the others are looked up the same way.
const IDS = ['0001', '0025', '0043', 'no-such-exercise']

const CONFIGS = [
  {},
  { mode: 'reps' },
  { mode: 'time' },
  { mode: 'cardio' },
  { mode: 'nonsense' },
  { mode: '' },
  { bodyweight: true },
  { bodyweight: false },
  { bodyweight: true, mode: 'time' },
  { side: true },
  { side: false },
  { side: true, bodyweight: true, mode: 'reps' },
  { reps: 8, sets: 3 },
  { repsMax: 20, reps: 12 }
]

describe('server/client reading rules agree', () => {
  for (const id of IDS) {
    const ex = exOr(id)
    for (const base of CONFIGS) {
      const cfg = { ...base, id }
      const label = `${id} ${JSON.stringify(base)}`

      it(`modeOf — ${label}`, () => {
        expect(srvModeOf(cfg, ex)).toBe(uiModeOf(cfg))
      })

      it(`isBw — ${label}`, () => {
        expect(srvIsBw(cfg, ex)).toBe(uiIsBw(cfg))
      })

      it(`isPerSide — ${label}`, () => {
        expect(srvIsPerSide(cfg)).toBe(uiIsPerSide(cfg))
      })
    }
  }

  it('an explicit flag beats the catalogue, on both sides', () => {
    const bodyweightEx = exOr('0001')
    expect(uiIsBw({ id: '0001' })).toBe(true)
    expect(srvIsBw({ id: '0001' }, bodyweightEx)).toBe(true)
    // A dip done with a belt turns it off; the server must agree, or it keeps reading the
    // added load as no load.
    expect(uiIsBw({ id: '0001', bodyweight: false })).toBe(false)
    expect(srvIsBw({ id: '0001', bodyweight: false }, bodyweightEx)).toBe(false)
  })
})

/* The 1RM and the week reader the focused tasks carry. A card that shows one number in Stats
   and another in the chat is the failure this pins: the server's copy must answer exactly what
   the frontend's does, over the same table of sets and dates. */
const SETS = [
  { w: 100, r: 5, done: true },
  { w: 100, r: 12, done: true },
  { w: 100, r: 13, done: true },                       // past REP_CAP
  { w: 0, r: 10, done: true },
  { w: 60, r: 1, done: true },
  { w: 80, r: 8, done: false },                        // never performed
  { w: 90, r: 5, done: true, phase: 'warmup' },
  { w: 70, r: 6, done: true, warmup: true },           // legacy boolean
  { w: 62.5, r: 7, done: true },
  { w: '80', r: '8', done: true }                      // strings, as old data can carry
]

describe('the 1RM estimate agrees across runtimes', () => {
  for (const s of SETS) {
    it(`estimate1RM ${JSON.stringify(s)}`, () => {
      expect(srvEstimate1RM(s.w, s.r)).toBe(uiEstimate1RM(s.w, s.r))
    })
  }
  it('bestSetOf skips warm-ups and undone sets the same way', () => {
    expect(srvBestSetOf({ sets: SETS })).toEqual(uiBestSetOf({ sets: SETS }))
  })
  it('best1RM reads the same series out of the same log', () => {
    const S = {
      workouts: [
        { d: '2026-08-01', start: 1, entries: [{ id: 'x', sets: [SETS[0], SETS[8]] }] },
        { d: '2026-08-08', start: 2, entries: [{ id: 'x', sets: [SETS[1], SETS[5]] }] },
        { d: '2026-08-15', start: 3, entries: [{ id: 'x', sets: [SETS[3]] }] }
      ]
    }
    expect(srvBest1RM(S, 'x')).toEqual(uiBest1RM(S, 'x'))
    expect(srvBest1RM(S, 'y')).toBe(uiBest1RM(S, 'y'))
  })
})

describe('the week reader agrees across runtimes', () => {
  const routine = (id, ex = 1) => ({ id, name: id, ex: Array.from({ length: ex }, (_, i) => ({ id: 'e' + i, sets: 3, reps: 8 })) })
  const S = {
    routines: [routine('r1'), routine('r2'), routine('empty', 0)],
    week: { 1: ['r1'], 3: ['r2', 'r1'], 5: ['empty'], 6: 'r1' },
    dayPlan: { '2026-09-15': 'rest', '2026-09-16': 'r2', '2026-09-17': 'missing' }
  }
  const DATES = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']
  for (const iso of DATES) {
    it(`effectiveRoutineIds/Routines — ${iso}`, () => {
      expect(srvEffectiveIds(S, iso)).toEqual(uiEffectiveIds(S, iso))
      expect(srvEffectiveRoutines(S, iso).map(r => r.id)).toEqual(uiEffectiveRoutines(S, iso).map(r => r.id))
    })
    it(`nextTrainingDay — ${iso}`, () => {
      const a = srvNextDay(S, iso)
      const b = uiNextDay(S, iso)
      expect(a && { iso: a.iso, weekday: a.weekday, routines: a.routines.map(r => r.id) })
        .toEqual(b && { iso: b.iso, weekday: b.weekday, routines: b.routines.map(r => r.id) })
    })
  }
  it('a fully-rest week answers null on both sides', () => {
    const rest = { routines: [routine('r1')], week: {}, dayPlan: {} }
    expect(srvNextDay(rest, '2026-09-14')).toBe(uiNextDay(rest, '2026-09-14'))
    expect(srvNextDay(rest, '2026-09-14')).toBeNull()
  })
})
