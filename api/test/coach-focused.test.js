/* The two focused tasks, on their own: an answer (nothing to apply) and a set of next-session
 * loads (one change type, one date). No queue, no provider — the validator and the payload
 * builder are where the safety lives, so they are tested without anything else in the way.
 *
 * The rule this file exists to pin: a review still refuses `weight` (the progression engine
 * owns day-to-day loads), while `loads` — and only `loads` — accepts it. If the two ever
 * collapse into one path, one of these fails.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { tempData, sampleState } from './helpers.mjs';

tempData();
const { validateAsk, validateLoads, validateReview } = await import('../coach/core/validate.js');
const payload = await import('../coach/core/payload.js');
const { handleFor } = await import('../coach/handle.js');

const PLAN = {
  routines: [{
    id: 'r1', name: 'Full body A',
    ex: [{ id: '0001', sets: 3, reps: 10, weight: 20 }, { id: '0007', sets: 3, sec: 45 }]
  }],
  week: { 1: 'r1' }
};
const change = over => ({ id: 'w1', type: 'weight', target: { routineId: 'r1', exId: '0001' }, after: 22.5, why: 'hit every target at RPE 8', ...over });
const loads = (changes, ctx) => validateLoads({ coach_contract: 1, summary: 's', changes }, PLAN, ctx);

/* ---------------- an answer ---------------- */

test('an answer is prose and nothing else — a change in one is refused, not trimmed', () => {
  assert.equal(validateAsk({ coach_contract: 1, answer: 'Tu 1RM estimado es 26.7 kg.' }).ok, true);
  const withChanges = validateAsk({ coach_contract: 1, answer: 'x', changes: [change()] });
  assert.equal(withChanges.ok, false);
  assert.ok(withChanges.errors.some(e => e.includes('no plan changes')));
});

test('an answer needs actual text, and its extras are clamped and bounded', () => {
  assert.equal(validateAsk({ coach_contract: 1 }).ok, false);
  const r = validateAsk({
    coach_contract: 1, title: 't'.repeat(200), answer: 'a'.repeat(9000),
    notes: ['n1', '', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'].map((n, i) => n ? n + i : n)
  });
  assert.equal(r.ok, true);
  assert.equal(r.proposal.title.length, 80);
  assert.equal(r.proposal.answer.length, 4000);
  assert.equal(r.proposal.notes.length, 6);
});

/* ---------------- next-session loads ---------------- */

test('a weight is the only change a load estimate may carry, and the plan supplies `before`', () => {
  const r = loads([change()], { iso: '2026-09-19', weekday: 6 });
  assert.equal(r.ok, true);
  assert.equal(r.proposal.changes.length, 1);
  assert.equal(r.proposal.changes[0].type, 'weight');
  assert.equal(r.proposal.changes[0].before, 20, 'read off the plan, not taken from the answer');
  assert.equal(r.proposal.changes[0].after, 22.5);
  assert.deepEqual(r.proposal.target, { iso: '2026-09-19', weekday: 6 });

  const wrong = loads([change({ type: 'sets' })]);
  assert.equal(wrong.ok, false);
  assert.ok(wrong.errors.some(e => e.includes('must be "weight"')));
});

test('every target has to resolve: a routine that exists, an exercise inside it', () => {
  const ghostRoutine = loads([change({ target: { routineId: 'nope', exId: '0001' } })]);
  assert.equal(ghostRoutine.ok, false);
  const ghostEx = loads([change({ target: { routineId: 'r1', exId: 'nope' } })]);
  assert.equal(ghostEx.ok, false);
});

test('a load has to be a real positive number inside the same ceiling a plan allows', () => {
  for (const after of [0, -22.5, 'heavy', null, 1001, NaN]) {
    const r = loads([change({ after })]);
    assert.equal(r.ok, false, `after=${after} must be refused`);
  }
});

test('a load equal to the plan weight is still a proposal — the plan weight is only a fallback', () => {
  const r = loads([change({ after: 20 })]);
  assert.equal(r.ok, true);
  assert.equal(r.proposal.changes.length, 1);
});

test('"nothing to change" and an empty list are the same honest answer', () => {
  const quiet = validateLoads({ coach_contract: 1, nochange: true, reading: 'sin historial suficiente' });
  assert.equal(quiet.ok, true);
  assert.equal(quiet.nochange, true);
  assert.equal(quiet.reading, 'sin historial suficiente');
  const empty = loads([]);
  assert.equal(empty.nochange, true);
});

test('a review still refuses a weight change — the loads task is the only door', () => {
  const r = validateReview({ coach_contract: 1, summary: 's', changes: [change()] }, PLAN);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('not allowed')));
});

/* ---------------- the payload both tasks read ---------------- */

test('an ask payload focused on an exercise carries its numbers and a library led by its body part', () => {
  const S = sampleState();
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'ask', question: '¿Cuánto levanto en press?', exId: '0001' });
  assert.equal(p.task, 'ask');
  assert.equal(p.question, '¿Cuánto levanto en press?');
  assert.equal(p.focus.id, '0001');
  assert.equal(p.focus.config.id, '0001');
  assert.equal(p.focus.bp, 'waist', 'the body part travels so a replacement can be matched against it');

  assert.equal(p.focus.sessions, 1);
  assert.ok(p.focus.history[0].top);
  assert.equal(p.focus.config.bodyweight, true, 'the catalogue flag is resolved for the model');
  assert.equal(p.focus.best.est, 26.7, 'Epley over 20x10');

  // The answer has a real vocabulary to name exercises from, led by the focus's own body part:
  // without it "replace this" could only name whatever happened to be in `plan`, which is how a
  // lateral raise came back offered a calf raise as a substitute.
  assert.ok(p.library.length);
  assert.equal(p.library[0].bp, 'waist');
  assert.ok(p.library.some(e => e.id === '0001'), 'the exercise itself is in the slice');
  assert.ok(p.library.some(e => e.id !== '0001' && e.bp === 'waist'), 'so are its neighbours');
  assert.ok(p.library.length <= 50);
});

test('an ask payload with no focus falls back to the compact window, and still names exercises', () => {
  const S = sampleState({ workouts: [] });
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'ask', question: '¿cómo voy?' });
  assert.equal(p.focus, undefined);
  assert.deepEqual(p.window.workouts, []);
  assert.ok(p.aggregates);
  assert.ok(p.library.length);
});

test('a replacement question gets same-body-part candidates, not just whatever the plan holds', () => {
  // The exact shape of the bug: "what replaces my one-arm lateral raise" must not be answered
  // with a calf raise because the plan happens to contain one.
  const S = sampleState({
    routines: [{
      id: 'r1', name: 'Hombro', ex: [
        { id: '0355', sets: 3, reps: 12, mode: 'reps' },        // dumbbell one arm lateral raise
        { id: '1379', sets: 3, reps: 15, mode: 'reps' }         // dumbbell seated calf raise
      ]
    }],
    week: { 1: 'r1' },
    workouts: []
  });
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'ask', question: '¿Cuál sería un reemplazo?', exId: '0355' });
  assert.equal(p.focus.bp, 'shoulders');
  assert.equal(p.library[0].id, '0355');
  assert.ok(p.library.filter(e => e.bp === 'shoulders').length >= 20, 'same-body-part candidates dominate the slice');
  assert.ok(p.library.some(e => e.id === '0334'), 'a plain dumbbell lateral raise is a candidate');
  assert.ok(p.library.filter(e => e.bp === 'lower legs').length <= 1, 'the plan’s calf raise is context, not the candidate list');
});

test('a loads payload resolves the next training day and holds each exercise up to the light', () => {
  const S = sampleState();
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'loads', today: '2026-09-14' });   // a Monday
  assert.equal(p.task, 'loads');
  assert.equal(p.target.iso, '2026-09-16', 'Wednesday follows Monday when the week trains Mon/Wed/Fri');
  assert.equal(p.target.weekday, 3);
  assert.equal(p.target.routines[0].id, 'r1');
  const bench = p.target.routines[0].ex.find(e => e.id === '0001');
  assert.equal(bench.config.weight, 20);
  assert.equal(bench.sessions, 1);
  assert.equal(bench.history.length, 1);
  assert.equal(bench.best.est, 26.7);
  const plank = p.target.routines[0].ex.find(e => e.id === '0007');
  assert.equal(plank.config.mode, 'time');
});

test('a loads payload asked about one routine finds the next day that routine lands on', () => {
  const S = sampleState({ week: { 5: 'r1' } });   // Fridays only, starting from a Monday
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'loads', today: '2026-09-14', routineIds: ['r1'] });
  assert.equal(p.target.iso, '2026-09-18', 'the next Friday');
  assert.deepEqual(p.target.routines.map(r => r.id), ['r1']);
});

test('a routine with no day left in the week gets the next day, because the question was about it', () => {
  const S = sampleState({ week: { 5: 'r1' }, dayPlan: { '2026-09-18': 'rest' } });
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'loads', today: '2026-09-14', routineIds: ['r1'] });
  assert.equal(p.target.iso, '2026-09-15', 'the override hides the only occurrence in reach, so tomorrow stands in');
  assert.deepEqual(p.target.routines.map(r => r.id), ['r1']);
});

test('an ask payload names an exercise it was asked about even when it is not in the plan', () => {
  const S = sampleState();
  const p = payload.build(S, { handle: handleFor('u1'), kind: 'ask', question: '¿cómo va?', exId: '0009' });
  assert.equal(p.focus.id, '0009');
  assert.equal(p.focus.config, undefined, 'no plan entry, so no config — but history and a name still travel');
  assert.ok(p.focus.name);
});
