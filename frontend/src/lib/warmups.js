// Calentamientos y estiramientos curados (feature local de este fork).
//
// El dataset del catálogo no trae una categoría "calentamiento": esta lista es una selección
// a mano de estiramientos y movimientos de movilidad que ya existen en el catálogo, cada uno
// asignado al músculo que prepara (`m`, slug de MUSCLES; null = parte general/cardio). Por eso
// cada fila trae la misma imagen y animación del catálogo (media/img y media/gif) sin tocar el
// dataset. `k` distingue el tipo para la etiqueta de la fila: cardio, activacion, movilidad o
// estiramiento.
import { EXIDX, matchExercise, normalizeStr } from './exercises.js'
import { MUSCLES, MUSCLE_NAME } from './muscles.js'
import { t } from './i18n-core.js'

// Orden = orden en pantalla (general primero; el resto se agrupa por músculo).
export const WARMUPS = [
  // ---- general / cardio ----
  { id: '2138', k: 'cardio', m: null },                    // stationary bike run v. 3 — bici estática
  { id: '3655', k: 'cardio', m: null },                    // walking high knees lunge — rodillas altas
  { id: '1471', k: 'movilidad', m: null },                 // inchworm — gusano
  // ---- activación / movilidad general ----
  { id: '3561', k: 'activacion', m: 'gluteal' },           // glute bridge march — puente con marcha
  { id: '0276', k: 'activacion', m: 'abs' },               // dead bug — bicho muerto (core)
  { id: '1688', k: 'movilidad', m: 'abs' },                // lunge with twist — zancada con giro
  { id: '3639', k: 'movilidad', m: 'lower-back' },         // bent knee lying twist (male) — giro tumbado
  { id: '1685', k: 'movilidad', m: 'quadriceps' },         // squat to overhead reach — sentadilla con alcance
  { id: '1368', k: 'movilidad', m: 'calves' },             // ankle circles — círculos de tobillo
  { id: '1428', k: 'movilidad', m: 'forearm' },            // wrist circles — círculos de muñeca
  { id: '0257', k: 'movilidad', m: 'quadriceps' },         // circles knee stretch — círculos de rodilla
  { id: '1167', k: 'movilidad', m: 'chest' },              // dynamic chest stretch (male)
  // ---- estiramientos por músculo (head-to-toe; primero sin material) ----
  // trapezius
  { id: '1403', k: 'estiramiento', m: 'trapezius' },       // neck side stretch
  { id: '0716', k: 'estiramiento', m: 'trapezius' },       // side push neck stretch
  // deltoids
  { id: '0669', k: 'estiramiento', m: 'deltoids' },        // rear deltoid stretch
  // chest
  { id: '1271', k: 'estiramiento', m: 'chest' },           // chest and front of shoulder stretch
  { id: '1259', k: 'estiramiento', m: 'chest' },           // behind head chest stretch
  { id: '1405', k: 'estiramiento', m: 'chest' },           // back pec stretch
  { id: '1272', k: 'estiramiento', m: 'chest' },           // chest stretch with exercise ball — pelota
  { id: '1716', k: 'estiramiento', m: 'chest' },           // assisted seated pectoralis major stretch with stability ball — asistido
  // upper-back
  { id: '1346', k: 'estiramiento', m: 'upper-back' },      // kneeling lat stretch
  { id: '1358', k: 'estiramiento', m: 'upper-back' },      // side lying floor stretch
  { id: '0794', k: 'estiramiento', m: 'upper-back' },      // standing lateral stretch
  { id: '1365', k: 'estiramiento', m: 'upper-back' },      // upper back stretch
  { id: '1339', k: 'estiramiento', m: 'upper-back' },      // exercise ball lat stretch — pelota
  { id: '1342', k: 'estiramiento', m: 'upper-back' },      // exercise ball lying side lat stretch — pelota
  { id: '2207', k: 'estiramiento', m: 'upper-back' },      // roller side lat stretch — rodillo
  // triceps
  { id: '0643', k: 'estiramiento', m: 'triceps' },         // overhead triceps stretch
  { id: '0817', k: 'estiramiento', m: 'triceps' },         // triceps stretch
  { id: '1745', k: 'estiramiento', m: 'triceps' },         // exercise ball seated triceps stretch — pelota
  // forearm
  { id: '0721', k: 'estiramiento', m: 'forearm' },         // side wrist pull stretch
  // abs
  { id: '1366', k: 'estiramiento', m: 'abs' },             // upward facing dog — perro mirando arriba
  // lower-back
  { id: '0690', k: 'estiramiento', m: 'lower-back' },      // seated lower back stretch
  { id: '1363', k: 'estiramiento', m: 'lower-back' },      // spine stretch
  { id: '1362', k: 'estiramiento', m: 'lower-back' },      // sphinx — esfinge
  { id: '1341', k: 'estiramiento', m: 'lower-back' },      // exercise ball lower back stretch (pyramid) — pelota
  { id: '2208', k: 'estiramiento', m: 'lower-back' },      // roller back stretch — rodillo
  // gluteal
  { id: '1424', k: 'estiramiento', m: 'gluteal' },         // seated glute stretch
  { id: '2567', k: 'estiramiento', m: 'gluteal' },         // seated piriformis stretch
  { id: '1419', k: 'movilidad', m: 'gluteal' },            // iron cross stretch
  { id: '2571', k: 'estiramiento', m: 'gluteal' },         // rocking frog stretch — rana
  { id: '1709', k: 'estiramiento', m: 'gluteal' },         // assisted lying glutes stretch — asistido
  { id: '1710', k: 'estiramiento', m: 'gluteal' },         // assisted lying gluteus and piriformis stretch — asistido
  { id: '2202', k: 'estiramiento', m: 'gluteal' },         // roller hip stretch — rodillo
  { id: '2205', k: 'estiramiento', m: 'gluteal' },         // roller hip lat stretch — rodillo
  // quadriceps
  { id: '1512', k: 'estiramiento', m: 'quadriceps' },      // all fours squad stretch
  { id: '1548', k: 'estiramiento', m: 'quadriceps' },      // chair leg extended stretch
  { id: '0613', k: 'estiramiento', m: 'quadriceps' },      // lying (side) quads stretch
  { id: '1713', k: 'estiramiento', m: 'quadriceps' },      // assisted prone lying quads stretch — asistido
  // hamstring
  { id: '1511', k: 'estiramiento', m: 'hamstring' },       // hamstring stretch
  { id: '1576', k: 'estiramiento', m: 'hamstring' },       // leg up hamstring stretch
  { id: '1585', k: 'movilidad', m: 'hamstring' },          // runners stretch
  { id: '1604', k: 'movilidad', m: 'hamstring' },          // world greatest stretch
  { id: '1587', k: 'estiramiento', m: 'hamstring' },       // seated wide angle pose sequence — ángulo amplio
  { id: '1560', k: 'estiramiento', m: 'hamstring' },       // exercise ball seated hamstring stretch — pelota
  { id: '1582', k: 'estiramiento', m: 'hamstring' },       // reclining big toe pose with rope — cuerda
  { id: '1599', k: 'estiramiento', m: 'hamstring' },       // standing hamstring and calf stretch with strap — cuerda
  // adductors
  { id: '1712', k: 'estiramiento', m: 'adductors' },       // assisted side lying adductor stretch
  { id: '1494', k: 'estiramiento', m: 'adductors' },       // butterfly yoga pose — mariposa
  // hip-flexors
  { id: '1559', k: 'estiramiento', m: 'hip-flexors' },     // exercise ball hip flexor stretch — pelota
  { id: '1564', k: 'estiramiento', m: 'hip-flexors' },     // intermediate hip flexor and quad stretch
  { id: '1714', k: 'estiramiento', m: 'hip-flexors' },     // assisted prone rectus femoris stretch — asistido
  // calves
  { id: '1377', k: 'estiramiento', m: 'calves' },          // calf stretch with hands against wall
  { id: '1390', k: 'estiramiento', m: 'calves' },          // seated calf stretch (male)
  { id: '1398', k: 'estiramiento', m: 'calves' },          // standing calves calf stretch
  { id: '1407', k: 'estiramiento', m: 'calves' },          // calf push stretch with hands against wall
  { id: '1378', k: 'estiramiento', m: 'calves' },          // calf stretch with rope — cuerda
  { id: '1388', k: 'estiramiento', m: 'calves' },          // peroneals stretch — cuerda
  { id: '1708', k: 'estiramiento', m: 'calves' },          // assisted lying calves stretch — asistido
  // tibialis
  { id: '1389', k: 'estiramiento', m: 'tibialis' },        // posterior tibialis stretch — cuerda
]

const WARMUP_BY_ID = new Map(WARMUPS.map(w => [w.id, w]))
const WARMUP_ORDER = new Map(WARMUPS.map((w, i) => [w.id, i]))

/** ¿Es un calentamiento curado? (para etiquetas y filtros en otras vistas) */
export const isWarmup = id => WARMUP_BY_ID.has(id)
/** Entrada curada de un ejercicio, o null. */
export const warmupOf = id => WARMUP_BY_ID.get(id) || null
/** Posición en la lista curada (Infinity si no es calentamiento) — para ordenar un filtro. */
export const warmupOrder = id => WARMUP_ORDER.has(id) ? WARMUP_ORDER.get(id) : Infinity

// Búsqueda por músculo: el catálogo del dataset no siempre usa el nombre que ve la persona
// («pectorals» donde el mapa dice «chest»), así que además de `matchExercise` (nombre,
// equipamiento y músculos del dataset) se busca por el músculo curado de la fila (`m`), en
// slug, en inglés y en el idioma activo. Acepta una fila curada o un ejercicio.
export function warmupMatches(exOrRow, query) {
  const ex = exOrRow?.ex || exOrRow
  if (!query) return true
  if (matchExercise(ex, query)) return true
  const row = exOrRow && exOrRow.m !== undefined ? exOrRow : warmupOf(ex?.id)
  if (!row?.m) return false
  const tokens = normalizeStr(query).split(/\s+/).filter(Boolean)
  if (!tokens.length) return true
  const name = MUSCLE_NAME[row.m] || row.m
  const names = [row.m, name, t(name)].map(normalizeStr)
  return tokens.every(tok => names.some(n => n.includes(tok)))
}

// Filas resueltas contra el catálogo; un id que ya no exista se descarta (dataset actualizado).
export const warmupRows = () => WARMUPS.map(w => ({ ...w, ex: EXIDX[w.id] })).filter(r => r.ex)

/** Grupos para la vista: general primero y después los músculos en orden head-to-toe. */
export function warmupSections() {
  const groups = new Map()
  for (const row of warmupRows()) {
    const key = row.m || 'general'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const order = ['general', ...MUSCLES]
  const out = []
  for (const key of order) if (groups.has(key)) out.push({ key, items: groups.get(key) })
  return out
}
