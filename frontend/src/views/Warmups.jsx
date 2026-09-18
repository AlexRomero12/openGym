// Vista «Calentamientos» (feature local de este fork): estiramientos y movilidad curados del
// catálogo, agrupados por el músculo que prepara cada uno. Cada fila usa la imagen y el detalle
// de siempre, así que se puede ver la animación y mandarlo al plan con el botón «Plan».
// La búsqueda, los chips de músculo y el selector «Por músculo» siguen el patrón de Ejercicios.
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { warmupSections, warmupMatches, warmupRows, warmupOf } from '../lib/warmups.js'
import { MUSCLE_NAME, musclesOf } from '../lib/muscles.js'
import { Thumb } from '../components/Media.jsx'
import MuscleExplorer from '../components/MuscleExplorer.jsx'
import { exerciseDetailSheet, addToRoutineSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { tappable, useRevealActiveChip } from '../lib/use-sheet-keyboard.js'

// Etiqueta del tipo de calentamiento (feature local: los textos van en español, como Amigos).
const KIND = {
  cardio: 'Cardio',
  activacion: 'Activación',
  movilidad: 'Movilidad',
  estiramiento: 'Estiramiento',
}

// En Calentamientos el músculo que manda es el curado, que puede no coincidir con el `tg` del
// dataset («back pec stretch» prepara el pecho, no los dorsales): el explorador usa este mapa.
const warmMuscles = ex => {
  const m = warmupOf(ex.id)?.m
  return m ? { [m]: 1 } : musclesOf(ex)
}

export default function Warmups() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [m, setM] = useState('')   // '' = todos los músculos
  const [byMuscle, setByMuscle] = useState(false)
  const strip = useRef(null)
  // El selector de músculos explora solo los calentamientos curados.
  const warmCatalog = useMemo(() => warmupRows().map(r => r.ex), [])
  const groups = warmupSections()
  useRevealActiveChip(strip, m)
  const sections = groups
    .filter(s => !m || s.key === m)
    .map(s => ({ ...s, items: s.items.filter(r => warmupMatches(r.ex, q)) }))
    .filter(s => s.items.length)
  return <>
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/plan?tab=exercises')} aria-label={t('Exercises')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 12 }}>
        <h1>Calentamientos</h1>
        <div className="sub">Movilidad y estiramientos: cada uno con el músculo que prepara.</div>
      </div>
    </div>
    {/* El botón va fuera del hdr: en móvil la flecha + el título largo + «Por músculo» no caben
        y el encabezado se partía. Va en la fila del buscador (o solo, al volver del explorador). */}
    {byMuscle
      ? <>
        <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
          <Button size="sm" variant="tinted" icon="target" onClick={() => setByMuscle(false)}>{t('All')}</Button>
        </div>
        <MuscleExplorer catalog={warmCatalog} muscleMap={warmMuscles} onDetail={exerciseDetailSheet} onPlan={addToRoutineSheet} />
      </>
      : <>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <div className="search" style={{ flex: 1 }}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input className="input" placeholder="Buscar por músculo o nombre…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <Button size="sm" variant="tinted" icon="target" onClick={() => setByMuscle(true)}>{t('By muscle')}</Button>
        </div>
        <div className="chips" ref={strip} style={{ marginBottom: 12 }}>
          <button className={'chip nocap' + (!m ? ' on' : '')} onClick={() => setM('')}>Todos</button>
          {groups.map(s => <button key={s.key} className={'chip' + (m === s.key ? ' on' : '')}
            onClick={() => setM(m === s.key ? '' : s.key)}>
            {s.key === 'general' ? 'General' : t(MUSCLE_NAME[s.key] || s.key)}
          </button>)}
        </div>
        {sections.map(s => <div key={s.key} style={{ marginBottom: 18 }}>
          <div className="sect-t" style={{ padding: '0 2px 7px' }}>
            {s.key === 'general' ? 'Calentamiento general' : t(MUSCLE_NAME[s.key] || s.key)}
          </div>
          <div className="list">
            {s.items.map(r => <div key={r.id} className="item" {...tappable(() => exerciseDetailSheet(r.ex))}>
              <Thumb ex={r.ex} />
              <div className="grow">
                <div className="tt">{exerciseNameFor(r.ex)}</div>
                <div className="ss">{(KIND[r.k] || '') + ' · ' + t(r.ex.eq)}</div>
              </div>
              <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(r.ex) }}>{t('Plan')}</Button>
            </div>)}
          </div>
        </div>)}
        {sections.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
      </>}
  </>
}
