const COPY = {
  en: {
    restTitle: 'Rest over 💪',
    restBody: 'Time for your next set.',
    testBody: 'Test notification ✅ — this is what alerts look like.',
    dayFallbackTitle: 'Workout planned today',
    dayRoutineSuffix: 'today',
    dayBody: "It's on your plan — let's go 💪",
  },
  'pt-BR': {
    restTitle: 'Descanso terminado 💪',
    restBody: 'Hora da próxima série.',
    testBody: 'Notificação de teste ✅ — é assim que os alertas aparecem.',
    dayFallbackTitle: 'Treino planejado para hoje',
    dayRoutineSuffix: 'hoje',
    dayBody: 'Está no seu plano — vamos treinar 💪',
  },
  es: {
    restTitle: 'Descanso terminado 💪',
    restBody: 'Hora de la próxima serie.',
    testBody: 'Notificación de prueba ✅ — así se ven los avisos.',
    dayFallbackTitle: 'Entreno planificado para hoy',
    dayRoutineSuffix: 'hoy',
    dayBody: 'Está en tu plan — vamos 💪',
  },
};

const copyFor = lang => COPY[lang] || COPY.en;

/* Since the routine redesign `r.emoji` holds an icon key — 'figureStrength',
   'dumbbell' — that the app draws as an SVG glyph. A notification is plain text, so
   the key is swapped for the emoji it describes; a key with no emoji stays out of
   the title instead of arriving as words ("figureStrength Día A · Empuje hoy").
   A literal emoji from pre-redesign data passes through untouched. */
const GLYPH_EMOJI = {
  figureStrength: '🏋️', arm: '💪', legs: '🦵', pullup: '🧗',
  dumbbell: '🏋️', barbell: '🏋️', kettlebell: '🦍', machine: '🤖',
  figureRun: '🏃', bike: '🚴', swim: '🏊', boxing: '🥊', timer: '⏱️',
  stretch: '🤸', moon: '🌙', heart: '❤️', flame: '🔥', bolt: '⚡',
  target: '🎯', trophy: '🏆', medal: '🥇', star: '⭐', crown: '👑', shield: '🛡️',
};
const routineMark = emoji =>
  !emoji ? ''
    : /\p{Extended_Pictographic}/u.test(emoji) ? emoji
    : GLYPH_EMOJI[emoji] || '';

export function restTimerPush(lang) {
  const copy = copyFor(lang);
  return { title: copy.restTitle, body: copy.restBody, tag: 'rest-timer' };
}

export function testPush(lang) {
  return { title: 'openGym', body: copyFor(lang).testBody, tag: 'test' };
}

export function dayReminderPush(lang, routine) {
  const copy = copyFor(lang);
  const mark = routineMark(routine && routine.emoji);
  return {
    title: routine
      ? `${mark ? `${mark} ` : ''}${routine.name} ${copy.dayRoutineSuffix}`
      : copy.dayFallbackTitle,
    body: copy.dayBody,
    tag: 'day-reminder',
  };
}
