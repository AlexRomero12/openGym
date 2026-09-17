// Mapa de territorios — el cuerpo pintado con el color de quien manda en cada músculo
// (vista «Amigos», feature local de este fork). Reusa la geometría de lib/body-paths.js con
// import diferido, igual que BodyMap: son ~90 KB que solo se descargan al abrir esta vista.
import { useEffect, useState } from 'react'
import { MUSCLES, INERT } from '../lib/muscles.js'

// Nombres en español para leyenda y tooltips (la vista Amigos usa literales, no i18n).
export const MUSCLE_ES = {
  trapezius: 'Trapecios', deltoids: 'Hombros', chest: 'Pecho', 'upper-back': 'Espalda alta',
  serratus: 'Serrato', biceps: 'Bíceps', triceps: 'Tríceps', forearm: 'Antebrazos',
  abs: 'Abdominales', obliques: 'Oblicuos', 'lower-back': 'Espalda baja', gluteal: 'Glúteos',
  quadriceps: 'Cuádriceps', hamstring: 'Isquios', adductors: 'Aductores', 'hip-flexors': 'Flexores de cadera',
  calves: 'Gemelos', tibialis: 'Tibiales',
}

let CACHE = null
let PENDING = null

function useBodyPaths() {
  const [paths, setPaths] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    PENDING = PENDING || import('../lib/body-paths.js').then(m => (CACHE = m.default))
    PENDING.then(p => { if (alive) setPaths(p) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return paths
}

/** owners: { <músculo>: { name, color } }; los músculos sin dueño quedan en gris.
 *  Con `onMuscle` el mapa es la interfaz: tocás un músculo y el detalle se muestra afuera
 *  (sin lista duplicada debajo). */
export default function TerritoryMap({ owners = {}, body = 'male', className = '', onMuscle = null, selected = null }) {
  const paths = useBodyPaths()
  const g = paths && (paths[body] || paths.male)
  if (!g) return <div className={'bodymap tm ' + className}><div className="bm-ph" aria-hidden="true" /></div>
  return (
    <div className={'bodymap tm ' + className + (onMuscle ? ' tappable' : '')}>
      {Object.entries(g).map(([viewName, view]) => (
        <svg key={viewName} className="bm-v" viewBox={view.vb} role="img">
          {INERT.map(slug => (view.p[slug] || []).map((d, i) => <path key={slug + i} className="bm-sil" d={d} />))}
          {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) => {
            const own = owners[slug]
            return (
              <path key={slug + i}
                className={'tm-m' + (own ? ' own' : '') + (selected === slug ? ' sel' : '')}
                d={d}
                style={own ? { fill: own.color } : undefined}
                onClick={onMuscle ? () => onMuscle(slug) : undefined}
              >
                <title>{`${MUSCLE_ES[slug] || slug}${own ? ' · ' + own.name : ' · sin dueño'}`}</title>
              </path>
            )
          }))}
        </svg>
      ))}
    </div>
  )
}
