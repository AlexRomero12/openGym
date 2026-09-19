// Actividad del grupo — músculos de una publicación del feed (feature local «Amigos»).
// Helper puro y sin React: Friends.jsx lo usa para el mini-mapa de cada tarjeta.
// Los posts anteriores a la distribución muscular traen solo los destacados (post.top),
// así que se estima desde ahí: 1 serie por ejercicio listado, solo built-ins; la vista lo
// marca con «est.».
import { loadOf } from './muscles.js'

/**
 * Series efectivas por músculo de una publicación.
 *
 * Con `post.muscles` (posts nuevos) son las reales. Sin él (posts publicados antes de que el
 * resumen viajara) se estiman desde los destacados: un ejercicio listado = una serie, y los
 * customs de otros perfiles no tienen metadata, así que quedan afuera. `estimated` lo delata.
 */
export function postMuscles(post) {
  const real = post?.muscles
  if (real && typeof real === 'object' && !Array.isArray(real)) {
    const load = {}
    for (const slug in real) {
      const sets = Number(real[slug])
      if (Number.isFinite(sets) && sets > 0) load[slug] = sets
    }
    if (Object.keys(load).length) return { load, estimated: false }
  }
  const top = Array.isArray(post?.top) ? post.top : []
  const load = loadOf(top.map(t => ({ id: t?.id, sets: 1 })))
  return { load, estimated: Object.keys(load).length > 0 }
}
