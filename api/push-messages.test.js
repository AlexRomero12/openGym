import test from 'node:test';
import assert from 'node:assert/strict';
import { dayReminderPush, restTimerPush, testPush } from './push-messages.js';

test('localizes every server-generated notification in pt-BR', () => {
  assert.deepEqual(restTimerPush('pt-BR'), {
    title: 'Descanso terminado 💪',
    body: 'Hora da próxima série.',
    tag: 'rest-timer',
  });
  assert.deepEqual(testPush('pt-BR'), {
    title: 'openGym',
    body: 'Notificação de teste ✅ — é assim que os alertas aparecem.',
    tag: 'test',
  });
  assert.deepEqual(dayReminderPush('pt-BR', { name: 'Treino A', emoji: '💪' }), {
    title: '💪 Treino A hoje',
    body: 'Está no seu plano — vamos treinar 💪',
    tag: 'day-reminder',
  });
});

test('keeps the existing English copy as the fallback', () => {
  assert.deepEqual(restTimerPush('fr'), restTimerPush('en'));
  assert.equal(dayReminderPush('unknown', null).title, 'Workout planned today');
  assert.equal(testPush(undefined).body, 'Test notification ✅ — this is what alerts look like.');
});

test('localizes every server-generated notification in es', () => {
  assert.deepEqual(restTimerPush('es'), {
    title: 'Descanso terminado 💪',
    body: 'Hora de la próxima serie.',
    tag: 'rest-timer',
  });
  assert.deepEqual(testPush('es'), {
    title: 'openGym',
    body: 'Notificación de prueba ✅ — así se ven los avisos.',
    tag: 'test',
  });
  assert.deepEqual(dayReminderPush('es', { name: 'Día A · Empuje', emoji: '🏋️' }), {
    title: '🏋️ Día A · Empuje hoy',
    body: 'Está en tu plan — vamos 💪',
    tag: 'day-reminder',
  });
});

test('turns a routine icon key into an emoji instead of sending it as words', () => {
  // The redesign stores icon keys ('figureStrength', …) — they must never reach the
  // notification as text.
  assert.equal(
    dayReminderPush('es', { name: 'Día A · Empuje', emoji: 'figureStrength' }).title,
    '🏋️ Día A · Empuje hoy'
  );
  // A key with no emoji behind it drops the mark, it does not arrive as words.
  assert.equal(
    dayReminderPush('es', { name: 'Nueva rutina', emoji: 'someNewGlyph' }).title,
    'Nueva rutina hoy'
  );
  // No emoji at all: same shape, no leftover mark.
  assert.equal(dayReminderPush('es', { name: 'Nueva rutina', emoji: '' }).title, 'Nueva rutina hoy');
});
