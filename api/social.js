/* Social del grupo — feed de sesiones + rutinas publicadas (feature local de este fork).
 *
 * Mismo modelo que friends.js: se apoya en la lista/consentimiento de Amigos (resolveListed)
 * y guarda todo en data/social.json con escritura atómica. Solo viajan snapshots agregados
 * que el propio autor decidió publicar: nunca estados crudos ni pesos corporales.
 * Los posts se podan solos (90 días / 100 publicaciones / 30 rutinas).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { loadData, readConfig, resolveListed } from './friends.js'

const EMOJIS = ['🔥', '👏', '💪']
const POSTS_MAX = 100
const POSTS_DAYS = 90
const FEED_MAX = 50
const ROUTINES_MAX = 30

/* Los 18 músculos canónicos que dibuja el cuerpo (frontend/src/lib/muscles.js). El contexto de
 * build del api no incluye las librerías del frontend, así que la lista se replica acá con el
 * mismo criterio que las reglas de friends.js: si el frontend agrega un músculo, se cambia en
 * los dos lados. */
const MUSCLE_SLUGS = [
  'trapezius', 'deltoids', 'chest', 'upper-back', 'serratus', 'biceps', 'triceps', 'forearm',
  'abs', 'obliques', 'lower-back', 'gluteal', 'quadriceps', 'hamstring', 'adductors',
  'hip-flexors', 'calves', 'tibialis',
]

const fileFor = dataDir => path.join(dataDir, 'social.json')
function readStore(dataDir) {
  try {
    const s = JSON.parse(fs.readFileSync(fileFor(dataDir), 'utf8'))
    return { posts: Array.isArray(s.posts) ? s.posts : [], routines: Array.isArray(s.routines) ? s.routines : [] }
  } catch { return { posts: [], routines: [] } }
}
function writeStore(dataDir, store) {
  const tmp = fileFor(dataDir) + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n')
  fs.renameSync(tmp, fileFor(dataDir))
}

const str = (v, n) => String(v ?? '').slice(0, n)
const num = (v, min, max, dec = 1) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const p = 10 ** dec
  return Math.min(max, Math.max(min, Math.round(n * p) / p))
}
const idOf = v => (/^[A-Za-z0-9_-]{1,40}$/.test(String(v || '')) ? String(v) : null)

/** ¿Puede participar del social? Misma lista que el ranking (consentimiento compartido). */
function listedSet(config, data) {
  return new Set(resolveListed(config, data.states, data.users).map(p => p.uid))
}
function assertListed(dataDir, uid) {
  const config = readConfig(dataDir)
  const data = loadData(dataDir)
  if (!listedSet(config, data).has(uid)) {
    const e = new Error('not-listed')
    e.status = 403
    throw e
  }
}

/** Un post de sesión ya resumido por el cliente; acá se valida y se acota. */
function cleanPost(raw, uid) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const routine = p.routine && typeof p.routine === 'object'
    ? { name: str(p.routine.name, 60), emoji: str(p.routine.emoji, 8) }
    : null
  const minutes = num(p.minutes, 0, 900, 0)
  const volumeKg = num(p.volumeKg, 0, 1e6, 1)
  const sets = num(p.sets, 0, 300, 0)
  if (minutes == null && volumeKg == null && sets == null) return null
  const top = (Array.isArray(p.top) ? p.top : []).slice(0, 20).map(t => {
    const id = idOf(t && t.id)
    const w = num(t && t.w, 0, 2000, 2)
    const r = num(t && t.r, 0, 100, 0)
    if (!id || w == null || r == null) return null
    const n = t.n ? str(t.n, 60) : null
    return { id, w, r, ...(n ? { n } : {}) }
  }).filter(Boolean)
  const prs = (Array.isArray(p.prs) ? p.prs : []).map(idOf).filter(Boolean).slice(0, 30)
  // Series efectivas por músculo, calculadas por el cliente al publicar (misma librería que el
  // resumen de fin de entreno). Se recorre la lista canónica, así que claves desconocidas y
  // valores no numéricos caen solos; el tope evita que un post inventado ensucie los mapas.
  const muscles = {}
  if (p.muscles && typeof p.muscles === 'object' && !Array.isArray(p.muscles)) {
    for (const slug of MUSCLE_SLUGS) {
      const n = num(p.muscles[slug], 0, 300, 1)
      if (n) muscles[slug] = n
    }
  }
  return {
    id: crypto.randomBytes(8).toString('base64url'),
    uid,
    created: new Date().toISOString(),
    routine, minutes, volumeKg, sets,
    unit: p.unit === 'lb' ? 'lb' : 'kg',
    ...(Object.keys(muscles).length ? { muscles } : {}),
    top, prs, reactions: {},
  }
}

function prune(posts) {
  const cutoff = Date.now() - POSTS_DAYS * 86400000
  const fresh = posts
    .filter(p => { const t = Date.parse(p.created); return !Number.isFinite(t) || t >= cutoff })
    .sort((a, b) => String(a.created).localeCompare(String(b.created)))
  return fresh.slice(-POSTS_MAX)
}

export function addPost(dataDir, uid, raw) {
  assertListed(dataDir, uid)
  const post = cleanPost(raw, uid)
  if (!post) throw new Error('invalid post')
  const store = readStore(dataDir)
  store.posts.push(post)
  store.posts = prune(store.posts)
  writeStore(dataDir, store)
  return post
}

export function deletePost(dataDir, uid, id) {
  const store = readStore(dataDir)
  const before = store.posts.length
  store.posts = store.posts.filter(p => !(p.id === id && p.uid === uid))
  if (store.posts.length !== before) writeStore(dataDir, store)
  return { ok: true }
}

export function reactToPost(dataDir, uid, id, emoji) {
  assertListed(dataDir, uid)
  if (!EMOJIS.includes(emoji)) throw new Error('invalid emoji')
  const store = readStore(dataDir)
  const post = store.posts.find(p => p.id === id)
  if (!post) throw new Error('post not found')
  post.reactions = post.reactions && typeof post.reactions === 'object' ? post.reactions : {}
  if (post.reactions[uid] === emoji) delete post.reactions[uid]
  else post.reactions[uid] = emoji
  writeStore(dataDir, store)
  return { ok: true }
}

/* ------------------------------- rutinas publicadas ------------------------------- */

const cleanEx = e => {
  if (!e || typeof e !== 'object') return null
  const id = idOf(e.id)
  if (!id) return null
  const o = { id }
  if (Number.isFinite(Number(e.sets))) o.sets = Math.max(1, Math.min(20, Math.round(Number(e.sets))))
  for (const k of ['reps', 'repsMin', 'repsMax', 'warmupSets']) {
    if (Number.isFinite(Number(e[k]))) o[k] = Math.round(Number(e[k]))
  }
  for (const k of ['weight', 'inc', 'deloadFactor', 'sec', 'min', 'speed', 'restSec', 'warmupRestSec']) {
    if (Number.isFinite(Number(e[k]))) o[k] = Number(e[k])
  }
  if (e.mode === 'time' || e.mode === 'cardio') o.mode = e.mode
  if (typeof e.prog === 'string') o.prog = str(e.prog, 20)
  if (e.bodyweight === true) o.bodyweight = true
  if (e.side === true) o.side = true
  if (e.sg) o.sg = str(e.sg, 20)
  if (e.note) o.note = str(e.note, 200)
  if (e.intensifier && typeof e.intensifier === 'object') {
    const type = e.intensifier.type === 'restpause' ? 'restpause' : e.intensifier.type === 'dropset' ? 'dropset' : null
    if (type) o.intensifier = {
      type,
      ...(Number.isFinite(Number(e.intensifier.count)) ? { count: Math.max(1, Math.min(10, Math.round(Number(e.intensifier.count)))) } : {}),
      ...(Number.isFinite(Number(e.intensifier.pct)) ? { pct: Math.max(1, Math.min(50, Math.round(Number(e.intensifier.pct)))) } : {}),
    }
  }
  return o
}

function cleanRoutine(raw, uid, store) {
  const r = raw && typeof raw === 'object' ? raw : null
  if (!r) return null
  const name = str(r.name, 60).trim()
  if (!name) return null
  const ex = (Array.isArray(r.ex) ? r.ex : []).slice(0, 40).map(cleanEx).filter(Boolean)
  if (!ex.length) return null
  const customEx = (Array.isArray(r.customEx) ? r.customEx : []).slice(0, 40).map(c => {
    const id = idOf(c && c.id)
    const n = str(c && c.n, 60).trim()
    if (!id || !n) return null
    return { id, n, bp: str(c && c.bp, 20), ...(c.desc ? { desc: str(c.desc, 200) } : {}) }
  }).filter(Boolean)
  const keepKey = idOf(r.key) && store.routines.some(x => x.key === r.key && x.uid === uid)
  return {
    key: keepKey ? r.key : crypto.randomBytes(8).toString('base64url'),
    uid,
    ...(idOf(r.rid) ? { rid: idOf(r.rid) } : {}),
    name,
    emoji: str(r.emoji, 8),
    ex, customEx,
    updated: new Date().toISOString(),
  }
}

export function publishRoutine(dataDir, uid, raw) {
  assertListed(dataDir, uid)
  const store = readStore(dataDir)
  const routine = cleanRoutine(raw, uid, store)
  if (!routine) throw new Error('invalid routine')
  const idx = store.routines.findIndex(x => x.key === routine.key && x.uid === uid)
  if (idx >= 0) store.routines[idx] = routine
  else store.routines.push(routine)
  store.routines = store.routines.slice(-ROUTINES_MAX)
  writeStore(dataDir, store)
  return routine
}

export function unpublishRoutine(dataDir, uid, key) {
  const store = readStore(dataDir)
  store.routines = store.routines.filter(r => !(r.key === String(key) && r.uid === uid))
  writeStore(dataDir, store)
  return { ok: true }
}

/** Lo que ve la vista: feed + rutinas, filtrado por la lista de consentimiento. */
export function socialData(dataDir, viewerUid = null) {
  const config = readConfig(dataDir)
  const data = loadData(dataDir)
  const listed = listedSet(config, data)
  const store = readStore(dataDir)
  const posts = store.posts
    .filter(p => listed.has(p.uid))
    .sort((a, b) => String(b.created).localeCompare(String(a.created)))
    .slice(0, FEED_MAX)
    .map(p => ({
      id: p.id, uid: p.uid, created: p.created, routine: p.routine || null,
      minutes: p.minutes, volumeKg: p.volumeKg, sets: p.sets, unit: p.unit,
      muscles: p.muscles || null,
      top: p.top || [], prs: p.prs || [],
      counts: EMOJIS.reduce((o, e) => {
        const n = Object.values(p.reactions || {}).filter(v => v === e).length
        if (n) o[e] = n
        return o
      }, {}),
      mine: (viewerUid && p.reactions && p.reactions[viewerUid]) || null,
    }))
  const routines = store.routines
    .filter(r => listed.has(r.uid))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .map(r => ({ key: r.key, uid: r.uid, rid: r.rid || null, name: r.name, emoji: r.emoji, ex: r.ex, customEx: r.customEx || [], updated: r.updated }))
  return { generatedAt: new Date().toISOString(), me: viewerUid, posts, routines }
}
