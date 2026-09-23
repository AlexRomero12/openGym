# Plan de notificaciones estilo Duolingo («burlingo») para openGym

Estado: **diseñado, listo para implementar**. Tono aprobado: Duolingo (burlas, streak-shaming
humorístico). Social: terminar sesión + adelantos + digest. Racha en riesgo: sí, 1/semana.

## 0. Base existente (no reinventar)

| Pieza | Dónde | Estado |
|---|---|---|
| Web Push (VAPID, subs en `db.json`) | `api/server.js:217-260`, `frontend/src/lib/push.js` | ✅ |
| Push de descanso / test / coach / día | `api/push-messages.js` (COPY en es/en/pt, tag por clase) | ✅ |
| Recordatorio del día H | tick 10s `api/server.js:262-343` (tz usuario, ventana 15 min, 1×fecha, salta si ya entrenó) | ✅ genérico, copy plano |
| Víspera / primera sesión / racha / social | — | ❌ |
| Social: ranking `api/friends.js`, feed `api/social.js`, consentimiento `data/friends.json` + `shareFlags` | | ✅ sin push |
| Racha = semanas seguidas | `frontend/src/lib/history.js:560-573` | ✅ |
| Plan de hoy = `S.week` + `S.dayPlan` | `history.js:306-351` (`effectiveRoutineIds`, `nextTrainingDay`) | ✅ |
| Móvil: notifs locales 60 días | `frontend/src/lib/mobile.js:96-164` | ✅ solo día H |

## 1. Taxonomía de notificaciones

Cada clase con `tag` propio (el SW ya reemplaza por tag, `sw.js:41-42`), 2-3 variantes de copy
rotadas de forma determinista (hash uid+fecha → no repetir), tono **Duolingo** por defecto:
burla simpática, culpa humorística, streak-shaming, nunca insulto real.

| # | Clase | Trigger | Copy ejemplo (es) | Cadencia máx |
|---|---|---|---|---|
| 1 | **onboarding-plan** | 0 rutinas/`S.week` vacío. Drip día 1 / 3 / 7 tras activar push | «Tu plan lleva más polvo que la bici estática del trastero. Crea tu primera rutina.» | **3 en total**, luego silencio eterno |
| 2 | **onboarding-first** | Hay plan pero `S.workouts` vacío (mismo drip) | «¿Primera sesión? Dicen que el PR más difícil es cruzar la puerta.» | 3 en total |
| 3 | **víspera** | 19:00 local (config) si mañana hay rutina efectiva con ≥1 ejercicio (`nextTrainingDay`) | «Mañana tienes entreno. El sofá ya ha reservado tu hueco, pero el gimnasio ha hecho overbooking.» | 1/día |
| 4 | **día-H** (ya existe, copy nuevo) | `S.reminder.time`, si hoy hay rutina y no está hecha | «Hoy toca D1. Llevas 4 semanas de racha. No se lo hagas a 4 semanas de historia.» | 1/día |
| 5 | **refuerzo-tarde** | 17:30 local, día de entreno, aún sin workout (opcional, default ON) | «Sigue contando el gimnasio que hoy has ido… porque no ha sonado el móvil de la app.» | 1/día |
| 6 | **racha-en-riesgo** | Último día de la semana (`weekStartOf`+6), 20:00, 0 workouts esta semana y `streakWeeks ≥ 2` | «Tu racha de 5 semanas está viendo su vida pasar.» | 1/semana |
| 7 | **amigo-terminó** | Otro usuario cierra sesión (`finishWorkout`) y hay consentimiento | «Ana ha terminado su entreno. Tú y el scroll seguís empatados.» | 1/día, **coalesce 5 min** → «Ana, Luis y 1 más han terminado» |
| 8 | **adelanto-ranking** | Al fan-out del evento 7, si cambió tu posición en el ranking (`api/friends.js`) | «Ana te ha adelantado en volumen esta semana. Ha entrado en modo bestia.» | 1/día, coalesce con 7 |
| 9 | **digest semanal** | Domingo 18:00 (último día de semana), solo si opt-in | «Semana cerrada: 2º de 4 en volumen, racha viva. El lunes no se perdona ni un kilo.» | 1/semana |

**Existentes que no se tocan:** rest-timer, test, coach-proposal.

### Escenarios que NO se notifican (y por qué)

- **Reacciones a tu publicación** → solo badge in-app; 3 emojis no justifican romper el silencio.
- **PR / récord personal** → celebración in-app (el push de autoelogio no es Duolingo, es LinkedIn).
- **«Llevas N días sin ir» en días sin plan** → castiga descansos legítimos; lo cubre la clase 6.
- **Push al terminar TÚ tu entreno** → redundante, lo acabas de hacer.

## 2. Motor anti-spam (el corazón del diseño)

Módulo nuevo puro **`api/notif-policy.js`** + tests (CONTRIBUTING: lógica de decisión = helper
puro con test). Toda notificación pasa por
`decide(event, history, now, ctx) → send | drop | defer | merge`:

1. **Horario silencioso** (`S.notif.quiet`, default 22:00–08:00 tz usuario): clases 1-3, 5-9 se
   **descartan** (no encoladas); clase 4 se retrasa al final de la ventana (sigue cumpliendo su
   función).
2. **Caps diarios por familia** — motivación (1-6): **2/día**; social (7-9): **1/día**.
   Rest-timer/coach exentos (son petición del usuario).
3. **Prioridad al superar cap** (se envía lo alto, se tira lo bajo):
   `día-H > víspera > racha > refuerzo > onboarding > digest > amigo-terminó > adelanto`.
   Así un domingo con digest+víspera+racha solo salen 2.
4. **Dedupe por clave persistida** en el usuario de `db.json` (estilo `user.lastReminder`,
   `api/server.js:328`): `lastEve`, `lastBoost`, `lastStreakRisk=weekKey`, `lastSocial=date`,
   `nudgeLog=[dates]`, `lastDigest=weekKey`.
5. **Coalesce social**: ventana deslizante de 5 min por destinatario (patrón hermano de
   `restTimers` Map en `server.js:235-257`); se mergean nombres (máx 3 + «y N más»).
6. **Los onboarding drip son finitos y monótonos decrecientes** (día 1/3/7, tope duro 3) y se
   **cancelan para siempre** en cuanto aparezca un workout / una rutina.
7. Toda clase con toggle en Settings (ver §5) — el usuario siempre puede matar una familia entera.
8. Ventana latencia 15 min del tick se conserva (anti-restart, `server.js:292`).

## 3. Social: consentimiento y privacidad

Doble compuerta (nunca una sola):

- **Emisor**: `S.friends.share === true` **y** nuevo flag `shareFlags.activity !== false` en
  `api/friends.js:148-151` / `data/friends.json`.
- **Receptor**: clase social activa + push activo.

Payload mínimo: solo nombre visible por ranking + evento. **Nunca** pesos, volúmenes, ejercicios
ni body-weight (regla ya declarada en `api/friends.js:1-11`). Los adelantos citan solo la
métrica (`volume`/`compliance`/`streak`/`lifts`) que ambos comparten según `shareFlags`.

## 4. Cambios técnicos por archivo

| Archivo | Cambio |
|---|---|
| `api/notif-policy.js` **(nuevo)** | Reglas §2 puras: caps, prioridad, quiet, dedupe, merge. + `api/notif-policy.test.js` |
| `api/push-messages.js` | Builders por clase con `tone` (`burlingo`\|`neutro`) y rotación de variantes (hash uid+fecha); nuevo `COPY` es/en/pt. Ampliar `push-messages.test.js` |
| `api/server.js` | Tick (:262-343): añade víspera, refuerzo, racha, onboarding drip, digest (todo con `userNow(S.reminder.tz)`). Nuevos campos de dedupe en `db.json`. Nuevo route `POST /api/session/finished` (llamado desde `doFinishWorkout`, `sheets.jsx:2141`) → fan-out social 5-min + delta de ranking (`api/friends.js`) + detección de clases vacías para drip |
| `api/friends.js` | Flag `activity` en `shareFlags`; export de posición en ranking para el delta |
| `frontend/public/sw.js` | `notificationclick` lee `data.url` (hoy abre siempre `./`, `sw.js:52-58`; el payload de coach ya manda `url` sin consumir) → deep-link a Home/Friends |
| `frontend/src/store/useStore.js` | `DEF`: `S.notif = { tone:'burlingo', classes:{train,boost,streak,social,digest,onboard}, quiet:{on,from,to} }`, `S.reminder.eveTime` |
| `frontend/src/views/Settings.jsx` (card :553-630) | Ver §5 |
| `frontend/src/lib/mobile.js` | `buildReminderNotifications` (:96-126): + notif de víspera y de racha en la ventana de 60 días, respetando quiet hours. **Social no aplica en móvil nativo** (requiere push del servidor; documentar en `docs/MOBILE.md` — solo clases 3-6 locales) |
| `frontend/src/lib/finish-workout.js` / `sheets.jsx` | Hook de `POST /api/session/finished` tras `doFinishWorkout` |
| `frontend/src/locales/*.js` | Strings de Settings |
| `api/openapi.yaml` | Endpoint + campos `reminder.eveTime`, `notif` |
| `api/test/server-reminder.test.js` etc. | Casos nuevos de víspera/racha/caps |
| `docs/SELF_HOSTING.md` §7 | Tabla de clases y caps |

**Rotación de copy**: cada builder recibe `variants[]` y elige `hash(uid + fechaISO) % n` — mismo
día siempre igual, días distintos cambian. Sin aleatorio puro (irreproducible en tests).

## 5. Settings → Notifications (UI)

- Switch **Push** (existente) + botón test (existente).
- **Recordatorio de entreno** + hora (existente) + **nueva hora «Aviso de víspera»** (default 19:00).
- Sección **«Ánimo y racha»**: toggles `Racha en riesgo` / `Refuerzo de tarde` / `Primera sesión`
  + select **Tono**: *Duolingo (burlas)* / *Neutro*.
- Sección **«Amigos»**: toggles `Terminan su entreno` / `Me adelantan` / `Resumen semanal`
  (solo visibles si `S.friends.share`).
- **Horario silencioso** (switch + rango, default 22-08) y línea de ayuda con los límites
  reales: «máx 2/día motivación · 1/día social · nunca de noche».

## 6. Verificación

- Unit: `notif-policy.test.js` (caps, prioridad, quiet, merge, drip finito),
  `push-messages.test.js` (variantes deterministas, i18n, tono).
- Server: extender `server-reminder.test.js` (víspera no duplicada, racha solo si
  `streakWeeks≥2`, clase 4 no spamea, fan-out respeta consentimiento).
- Mobile: `mobile.test.js` (víspera programada, fuera de quiet hours).
- Manual: test-push de cada clase + revisión de que domingo con digest+víspera+racha solo emite 2.

## 7. Fuera de alcance

FCM/APNs para móvil nativo (social solo en PWA por ahora), digest por email, reacciones como
push, multi-idioma del tono más allá de es/en/pt.

## Parámetros por defecto (pendientes de confirmar al implementar)

- Hora de víspera: **19:00**.
- Refuerzo-tarde: **ON** por defecto, 17:30.
- Digest: domingo **18:00**.
