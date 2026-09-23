# Modo deporte — spec implementable

Estado: **acordado, sin implementar** (fork local). Este documento guarda las decisiones y el
diseño para retomarlo más adelante; describe qué construir, no un cambio ya hecho.

## 1. Objetivo

Elegir un deporte (pádel, fútbol, basket, running, ciclismo) y que la app genere automáticamente
un plan de entrenamiento enfocado en ese deporte, adaptado a los días de gimnasio disponibles, al
equipamiento real y a los días de práctica del deporte. Cada sesión combina:

1. **Movilidad / activación** al inicio (`mode: 'time'`, `sec`).
2. **Fuerza + prehab** (músculos prioritarios y prevención de lesiones del deporte).
3. **Cardio / intervalos** como cierre (`mode: 'cardio'`, `min`/`speed`), acorde al deporte.

Los tres bloques y los presets de equipamiento son toggles al generar; el plan es determinista,
offline y testeable.

## 2. Decisiones cerradas

| Punto | Decisión |
|---|---|
| Enfoque | **Híbrido**: plantillas deterministas (fase 1) + goal «Deporte» en el Entrenador IA (fase 2) |
| Deportes v1 | Pádel, fútbol, basket, running, ciclismo |
| Equipamiento | Adaptativo: el usuario elige `gym` (completo), `home` (mancuernas + bandas + peso corporal) o `bodyweight` |
| Contenido | Movilidad + fuerza/prehab + cardio/intervalos (los tres, con toggles) |
| Nombres de rutina | En español para este fork («Fútbol · Fuerza posterior»); son datos de usuario, no i18n |
| Días de práctica | Se usan para **elegir** los días de gym (no pisarlos, dejar ≥1 día antes de partido). Pregunta abierta: ¿además se registran como descanso (`dayPlan[iso] = 'rest'`)? |

## 3. Arquitectura (fase 1)

### 3.1 Motor: `frontend/src/lib/sport-plans.js` (helper puro, sin deps)

Mismo molde que `lib/starter.js`: nada aquí se renderiza directo, los textos de UI van en `t()`
dentro de `sheets.jsx` (regla de `scripts/check-source-strings.mjs`).

```js
// Registro de deportes. `brief` lo reusa la fase 2 para el prompt del Coach.
export const SPORTS = {
  futbol: {
    emoji: '⚽',
    priorities: ['hamstring', 'gluteal', 'quadriceps', 'adductors', 'calves', 'tibialis', 'abs', 'obliques'],
    brief: 'Fuerza posterior y unilateral, aductores, core anti-rotación y capacidad aeróbica.',
    sessions: {
      2: [DAY_POSTERIOR, DAY_UNILATERAL],
      3: [DAY_POSTERIOR, DAY_UNILATERAL, DAY_TORSO],
    },
    mobility: [...],       // drills mode:'time'
    conditioning: {...},   // intervalo mode:'cardio'
  },
  padel: { ... }, basket: { ... }, running: { ... }, ciclismo: { ... },
}
```

Cada **slot** de una sesión es:

```js
{
  role: 'main' | 'unilateral' | 'prehab' | 'core' | 'accessory' | 'conditioning',
  sets: 3, reps: 8,                    // o sec / min+speed según mode
  mode: 'reps' | 'time' | 'cardio',    // opcional; default 'reps'
  candidates: ['0085', '0811', '1459'], // ordenados: mejor para gym primero; el builder elige
}                                       // el primero cuyo `eq` esté en el equipamiento elegido
```

- El builder filtra candidatos por `eq` contra el preset (`gym`: todo; `home`: `dumbbell`,
  `band`, `resistance band`, `kettlebell`, `body weight`, `stability ball`, `roller`;
  `bodyweight`: solo `body weight`/`band`), evitando repetir un ejercicio dentro de la sesión.
- Si ningún candidato entra por equipamiento, el slot se omite y un test de cobertura exige que
  eso no deje al deporte sin sus músculos prioritarios en ningún preset.

### 3.2 API del helper

```js
buildSportPlan(sportId, { days, practiceDays, equipment, mobility = true, conditioning = true })
// → { routines, schedule }  // mismo shape que buildStarterPlan (lib/starter.js)

pickGymDays(days, practiceDays)
// Elige días libres: nunca pisa un día de práctica; intenta ≥1 día de separación antes de cada
// práctica para la sesión de pierna pesada; reparte los días (evita bloques de 3+ seguidos).
// Best-effort: si no alcanzan los días, completa y devuelve `warnings`.
```

Cada rutina resultante usa lo que el modelo ya soporta (`history.js:30-143`): `mode:'time'`
(`sec`), `mode:'cardio'` (`min`/`speed`), `prog`, `inc`, `repsMin`, supersets (`sg`).

### 3.3 UI

- `sheets.jsx`: `sportPlanSheet` → `SportPlanChooser` (mismo patrón que `StarterPlanChooser`,
  sheets.jsx:130): deporte → días (2/3) → equipamiento (chips) → días de práctica (opcional) →
  toggles «Calentamiento» y «Cardio» → confirmación solo si pisa días ocupados.
- Extraer `applyPlan({ routines, schedule })` de `loadStarterPlan` (sheets.jsx:116) y reusarlo.
- Entrada en `views/Plan.jsx`: estado vacío (junto a «Cargar plan base») y flujo «+».
- i18n: literales en `t()` en `sheets.jsx` + entradas en `locales/es.js` (resto de idiomas cae a
  inglés).

### 3.4 Tests: `frontend/src/lib/sport-plans.test.js`

- Todos los ids referenciados existen en `EXIDB` y los `mode` traen sus campos (`sec`,
  `min`/`speed`).
- Nº de rutinas = días pedidos; sin ejercicios repetidos dentro de una sesión.
- `pickGymDays` no devuelve días de práctica; con días suficientes deja separación antes del
  deporte; con pocos días devuelve `warnings`.
- Cobertura semanal: cada músculo prioritario del deporte recibe ≥N series efectivas
  (`musclesOf`), para los 5 deportes × 2/3 días.
- Con preset `bodyweight`, todo candidato resuelto tiene `eq` permitido.

## 4. Contenido por deporte (borrador a validar por los tests)

Ids confirmados en el catálogo: `0085` RDL, `0811` trap bar deadlift, `1409` hip thrust, `0586`
curl femoral, `0605` gemelos de pie, `0763` reverse calf (tibialis), `0410` búlgara, `0099`
búlgara con barra, `0431` step-up, `0409` gemelo a una pierna, `1775`/`3667` aductores, `0598`
aducción en máquina, `0597` abducción en máquina, `0979`/`1015` pallof, `0276` dead bug, `2133`
farmer walk, `0025`/`0047` press banca/inclinado, `1323` remo sentado, `0027` remo con barra,
`2330` jalón, `0203` face pull, `0235`/`0864` rotación externa de hombro, `1410` desplante
lateral, `0514` jump squat, `1374` box jump, `0739` prensa, `0585` extensión de piernas.

- **Fútbol**: posterior (RDL/trap bar, hip thrust, femoral), unilateral (búlgara, step-up,
  gemelo a una pierna), aductores, tibialis, core anti-rotación; intervalo 4×4.
- **Pádel**: manguito rotador + face pull, espalda alta (remo/jalón), antebrazo y agarre (farmer,
  curl de muñeca), lateralidad (desplante lateral, aducción/abducción), core anti-rotación,
  gemelos; intervalos cortos con cambios de dirección (cardio).
- **Basket**: sentadilla/trap bar, hip thrust, saltos y aterrizajes (jump/box + control),
  unilateral (búlgara, step-up, gemelo), core, hombro/pecho.
- **Running**: posterior (RDL, femoral), unilateral (step-up, gemelo a una pierna), tibialis,
  cadera/abductores, core; fartlek/tempo.
- **Ciclismo**: cuádriceps (sentadilla/prensa/extensión), glúteo (hip thrust, trap bar),
  femoral, gemelos/tibialis, core y espalda alta; sweet spot/intervals.

Gaps del catálogo (usar sustitutos): no hay nordic curl ni copenhagen ni Y-raise. Quedan cubiertos
con curl femoral + RDL, y `1775`/`3667` para aductores.

## 5. Fase 2 — goal «Deporte» en el Entrenador IA

- `views/CoachIntake.jsx`: opción de goal «Rendimiento deportivo» + paso de deporte (reusa
  `SPORTS`); guarda `coach.profile.sport`.
- `lib/coach.js` (`profileLines`) y paridad en `lib/coach-local.js` / `coach-demo.js`.
- `api/coach/core/payload.js`: `coachProfile.sport`.
- `scripts/build-coach-assets.mjs` genera `api/coach/core/sport-briefs.js` desde el registro del
  frontend (mismo patrón que `exercise-names.js`); `create.md`/`refine.md`/`review.md` suman la
  sección de foco deportivo (prioridades, prehab, días de práctica).
- Tests de paridad/payload: `coach-focused.test.js`, `coach-local.test.js`, `payload.test.js`.

## 6. Orden de ejecución

1. `sport-plans.js` + tests (fútbol y pádel como molde, después basket/running/ciclismo).
2. `sportPlanSheet` + refactor `applyPlan` + entrada en Plan + `locales/es.js`.
3. Verificación local (`docker compose up -d --build`) y uso real.
4. Fase 2 del Coach cuando la fase 1 esté rodada.

## 7. Notas y riesgos

- La semana del modelo es fija (se repite); los días de práctica solo eligen los días de gym, no
  cambian semana a semana.
- Volumen de curación: 5 deportes × 2/3 sesiones × slots con candidatos; los tests de cobertura e
  ids acotan el error.
- El cardio del deporte se registra como `mode:'cardio'` (min/speed); no reemplaza trabajo de
  cancha/agilidad no modelado por la app.
