// Territorios — dueño de cada músculo para el mapa de la vista «Amigos».
//
// La competencia es SEMANAL: el api manda `weekExercises` (mejor ×peso de la semana en curso por
// ejercicio, `api/friends.js`) y acá se agrega por músculo. Dueño = mejor ×peso promedio entre
// los ejercicios que lo trabajan directo (`musclesOf` ≥ 0.5); si nadie lo hace directo, cae al
// pozo de los secundarios y se marca `direct:false`. Con menos de dos contendientes de la
// semana, el músculo queda gris. Con un api viejo (sin `weekExercises`) se usa la última semana
// de `series`, que es la misma ventana.
import { ACCENTS } from './format.js'
import { exOr } from './exercises.js'
import { muscleGroupsOf, musclesOf, MUSCLES } from './muscles.js'

const weekRelOf = (data, en) => (Array.isArray(data.weekExercises)
  ? en.rel
  : (en.series?.[en.series.length - 1]?.rel ?? null))

export function territoryOf(data) {
  const byUid = new Map(data.participants.map(p => [p.uid, p]))
  const exercises = data.weekExercises || data.exercises
  const bySlug = new Map()
  for (const ex of exercises) {
    const e = exOr(ex.id)
    const weights = musclesOf(e)
    for (const slug of muscleGroupsOf(e)) {
      let m = bySlug.get(slug)
      if (!m) { m = { all: new Map(), primary: new Map() }; bySlug.set(slug, m) }
      const direct = (weights[slug] || 0) >= 0.5
      const bump = (map, en, rel) => {
        const cur = map.get(en.uid) || { sum: 0, n: 0, best: 0 }
        cur.sum += rel; cur.n++
        if (rel > cur.best) cur.best = rel
        map.set(en.uid, cur)
      }
      for (const en of ex.entries) {
        const rel = weekRelOf(data, en)
        if (rel == null) continue
        bump(m.all, en, rel)
        if (direct) bump(m.primary, en, rel)
      }
    }
  }
  const owners = {}
  for (const [slug, m] of bySlug) {
    const toList = map => [...map.entries()].map(([uid, v]) => ({ uid, avg: v.sum / v.n, best: v.best }))
    const listAll = toList(m.all)
    if (listAll.length < 2) continue
    const listPrimary = toList(m.primary)
    const pool = (listPrimary.length ? listPrimary : listAll).sort((a, b) => b.avg - a.avg || b.best - a.best)
    const w = pool[0]
    const p = byUid.get(w.uid)
    owners[slug] = {
      uid: w.uid, name: p?.name || w.uid, color: ACCENTS[p?.color] || 'var(--label-3)',
      avg: Math.round(w.avg * 100) / 100, direct: listPrimary.length > 0,
    }
  }
  return { owners, list: MUSCLES.filter(s => owners[s]).map(s => ({ slug: s, ...owners[s] })) }
}
