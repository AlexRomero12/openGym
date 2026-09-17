// Vista «Amigos» — ranking entre perfiles de esta instancia (feature local de este fork).
// Consume /api/friends (agregados de solo lectura; nunca estados crudos ni pesos corporales).
// Quién aparece: switch «Aparecer en el ranking» (opt-in por perfil) + lista del dueño
// (friends.json). Textos literales en español a propósito: la única usuaria es Alex.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { EXIDX, exOr } from '../lib/exercises.js'
import { ACCENTS, fmtNum, fmtVol } from '../lib/format.js'
import { muscleGroupsOf, musclesOf, MUSCLES } from '../lib/muscles.js'
import { Button, Segmented, Switch } from '../components/ui.jsx'
import LineChart from '../components/LineChart.jsx'
import TerritoryMap, { MUSCLE_ES } from '../components/TerritoryMap.jsx'
import Icon, { ICON_NAMES } from '../components/Icon.jsx'
import { glyphOf } from '../lib/glyphs.js'
import { mergePlan } from '../lib/plan-share.js'
import { confirmSheet } from '../sheets.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { exerciseNameFor } from '../lib/i18n.js'

const cap = s => String(s || '').replace(/(^|[\s(\-/])(\p{Ll})/gu, (m, pre, ch) => pre + ch.toUpperCase())
const weekLabel = (a, b) => {
  const f = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)}`
}
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
// «Temporada» = número de semana ISO (cada lunes estrena temporada en el ranking).
const isoWeek = iso => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3)      // jueves de esa semana
  const firstThu = new Date(d.getFullYear(), 0, 4)
  firstThu.setDate(firstThu.getDate() - ((firstThu.getDay() + 6) % 7) + 3)
  return 1 + Math.round((d - firstThu) / 604800000)
}
const METRIC_LABELS = { volume: 'Volumen', compliance: 'Cumplimiento', streak: 'Racha' }
// Nombre del ejercicio con el pack de español (cae al nombre del servidor o al id).
const exLabel = (id, fallback) => {
  const ex = exOr(id)
  return cap(ex ? exerciseNameFor(ex) : (fallback || id))
}

export default function Friends() {
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [data, setData] = useState(null)
  const [metric, setMetric] = useState('volume')
  const [norm, setNorm] = useState('rel')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [openEx, setOpenEx] = useState(null)
  const [tSlug, setTSlug] = useState(null)   // músculo tocado en el mapa de territorios
  const [view, setView] = useState('ranking') // Ranking · Actividad · Rutinas
  const [social, setSocial] = useState(null)  // feed + rutinas publicadas (api/social.js)

  const load = useCallback(async () => {
    try {
      const d = await api('/api/friends?norm=' + norm)
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.status === 401
        ? 'Ingresá con tu perfil para ver el ranking (el modo invitado no tiene acceso).'
        : 'No se pudo cargar: ' + e.message)
    }
  }, [norm])

  useEffect(() => { load() }, [load])

  // Social del grupo (feed + rutinas): solo perfiles con sesión.
  const loadSocial = useCallback(async () => {
    if (!user || isGuest) return
    try { setSocial(await api('/api/social')) } catch { /* el feed avisa con su propio estado */ }
  }, [user, isGuest])
  useEffect(() => { loadSocial() }, [loadSocial])

  // Opt-in propio: se guarda en el perfil (sincroniza como cualquier ajuste de la app).
  const sharing = !!S.friends?.share
  const toggleShare = v => {
    update(s => { s.friends = { ...(s.friends || {}), share: v } })
    setTimeout(load, 1600)   // deja que el cambio sincronice antes de refrescar la tabla
  }

  // Gestión de perfiles de la instancia (solo el dueño; el servidor lo verifica igual).
  const manageFriend = async (path, uid) => {
    setBusy(uid)
    try { await api(path, { method: 'POST', body: JSON.stringify({ uid }) }); await load() }
    catch (e) { setError('No se pudo actualizar: ' + e.message) }
    finally { setBusy(null) }
  }

  // Identidad: color por participante (lo asigna el api o lo fija friends.json).
  const byUid = new Map((data?.participants || []).map(p => [p.uid, p]))
  const colorOf = uid => ACCENTS[byUid.get(uid)?.color] || 'var(--label-3)'
  const tintOf = uid => { const c = byUid.get(uid)?.color; return c ? { '--tint': ACCENTS[c] } : undefined }
  const me = user?.id

  const territories = data ? territoryOf(data) : null
  const premios = data ? prizesOf(data) : null
  // Mapa de territorios: el detalle del músculo tocado se muestra afuera (sin lista duplicada).
  const terSel = tSlug && territories ? territories.owners[tSlug] : null
  const terOwners = data && territories ? data.participants.filter(p => territories.list.some(t => t.uid === p.uid)) : []
  const terCounts = territories ? terOwners.map(p => `${p.name.split(' ')[0]} ${territories.list.filter(t => t.uid === p.uid).length}`) : []
  const terConq = territories ? territories.list.filter(t => t.recent) : []

  const sub = data
    ? `Temporada ${isoWeek(data.week.start)} · ${weekLabel(data.week.start, data.week.end)} · ${data.participantCount} participante${data.participantCount === 1 ? '' : 's'}`
    : 'Semana a semana, entre amigos'

  return <>
    <div className="hdr">
      <div>
        <h1>Amigos</h1>
        <div className="sub">{sub}</div>
      </div>
    </div>

    {user && !isGuest && <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow-t">Aparecer en el ranking</div>
        <div className="lrow-s">
          {sharing
            ? 'Tu perfil compite para todos los de la instancia.'
            : 'Tu perfil queda fuera de la tabla. Prendelo cuando quieras.'}
        </div>
      </div>
      <Switch checked={sharing} onChange={toggleShare} />
    </div>}

    {user && !isGuest && <div className="card" style={{ padding: 10, marginBottom: 12 }}>
      <Segmented value={view} onChange={setView} options={[
        { value: 'ranking', label: 'Ranking' },
        { value: 'feed', label: 'Actividad' },
        { value: 'routines', label: 'Rutinas' },
      ]} />
    </div>}

    {!data && !error && <div className="card dim" style={{ textAlign: 'center', padding: 24 }}>Cargando…</div>}
    {error && <div className="card dim" style={{ padding: 24 }}>{error}</div>}

    {view === 'ranking' && data && <>
      <div className="card">
        <Segmented className="seg-range" value={metric} onChange={setMetric} options={[
          { value: 'volume', label: 'Volumen' },
          { value: 'compliance', label: 'Cumplimiento' },
          { value: 'streak', label: 'Racha' },
        ]} />
        {metric === 'volume' && <>
          <div style={{ height: 8 }} />
          <Segmented className="seg-range" value={norm} onChange={setNorm} options={[
            { value: 'rel', label: '× peso' },
            { value: 'abs', label: 'kg' },
          ]} />
        </>}
        <h2 style={{ marginTop: 12 }}>
          {METRIC_LABELS[metric]}{metric === 'volume' ? (norm === 'rel' ? ' · × peso corporal' : ` · ${data.unit}`) : ''}
        </h2>
        <RankList data={data} metric={metric} norm={norm} tintOf={tintOf} />
        {data.participantCount > 0 && <div className="dim small" style={{ marginTop: 8 }}>
          Se reinicia cada {data.weekDays === 'sunday' ? 'domingo' : 'lunes'}.
        </div>}
      </div>

      {(premios.list.length > 0 || premios.champion) && <div className="card">
        <h2>Premios de la semana</h2>
        {premios.champion && <div className="lrow">
          <span className="lrow-i">🏁</span>
          <div className="lrow-m">
            <div className="lrow-t">
              <span className="fx-dot" style={{ background: colorOf(premios.champion.uid), marginRight: 6 }} />
              {premios.champion.name}
            </div>
            <div className="lrow-s">Campeón de la semana pasada · volumen</div>
          </div>
          <span className="lrow-v">{premios.champion.value}</span>
        </div>}
        {premios.list.map(ti => (
          <div className="lrow" key={ti.k}>
            <span className="lrow-i">{ti.icon}</span>
            <div className="lrow-m">
              <div className="lrow-t">
                <span className="fx-dot" style={{ background: colorOf(ti.uid), marginRight: 6 }} />
                {ti.name}
              </div>
              <div className="lrow-s">{ti.label}</div>
            </div>
            <span className="lrow-v" style={{ color: 'var(--label)', fontWeight: 600 }}>{ti.value}</span>
          </div>
        ))}
      </div>}

      {(territories.list.length > 0 || data.participantCount > 0) && <div className="card">
        <h2>Mapa de territorios</h2>
        {territories.list.length > 0 ? <>
          <div className="dim small" style={{ marginBottom: 8, lineHeight: 1.4 }}>
            Cada músculo lo pinta su dueño: mejor ×peso entre sus ejercicios, priorizando el
            trabajo directo. Los grises todavía no tienen datos compartidos.
          </div>
          <TerritoryMap owners={territories.owners} onMuscle={slug => setTSlug(s => (s === slug ? null : slug))} selected={tSlug} />
          <div className="fx-legend">
            {terOwners.map(p => (
              <span className="fx-legend-i" key={p.uid}>
                <span className="fx-dot" style={{ background: ACCENTS[p.color] }} />{p.name}
              </span>
            ))}
          </div>
          <div className="dim small" style={{ marginTop: 8, textAlign: 'center', lineHeight: 1.4 }}>
            {tSlug
              ? (terSel
                ? <><b style={{ color: 'var(--label)', fontWeight: 600 }}>{MUSCLE_ES[tSlug]}</b> · {terSel.name} · ×{fmtNum(terSel.avg)}{terSel.direct ? '' : ' · sin trabajo directo'}{terSel.recent ? ' · 🏴 esta semana' : ''}</>
                : `${MUSCLE_ES[tSlug]} · sin dueño todavía`)
              : `Tocá un músculo para ver el dueño${terCounts.length ? ' · ' + terCounts.join(' · ') : ''}`}
          </div>
          {terConq.length > 0 && <div className="dim small" style={{ marginTop: 4, textAlign: 'center' }}>
            🏴 Esta semana: {terConq.map(t => `${MUSCLE_ES[t.slug]} (${t.name.split(' ')[0]})`).join(' · ')}
          </div>}
        </> : <>
          <TerritoryMap owners={{}} />
          <div className="dim small" style={{ marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
            El mapa se activa cuando haya <b style={{ color: 'var(--label)', fontWeight: 600 }}>al menos 2 personas</b> en el ranking
            con datos en los mismos ejercicios.
            {data.participantCount >= 2 && <><br />Entrenen los mismos ejercicios y los músculos se van a ir pintando 🏴</>}
          </div>
        </>}
      </div>}

      {data.exercises.length > 0 && <>
        <h4 className="sec">
          Por ejercicio · {norm === 'rel' ? '1RM estimado relativo (× peso)' : 'mejor 1RM estimado (Epley)'}
        </h4>
        <div className="dim small" style={{ margin: '0 4px 10px', lineHeight: 1.4 }}>
          Barras relativas al líder · ▲▼ vs semana anterior · «Progreso» muestra la evolución de cada uno.
        </div>
      </>}
      {data.exercises.map(ex => {
        const keys = ex.entries.map(e => (norm === 'rel' ? e.rel : e.est))
        const maxV = Math.max(...keys.filter(v => v != null), 0)
        const open = openEx === ex.id
        return <div className="card" key={ex.id}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="t-head">{exLabel(ex.id, ex.name)}</span>
            <Button size="sm" variant="ghost" icon={open ? 'chevronUp' : 'chevronDown'}
              onClick={() => setOpenEx(o => (o === ex.id ? null : ex.id))}>Progreso</Button>
          </div>
          {ex.entries.map((e, i) => {
            const p = byUid.get(e.uid)
            const mine = me && e.uid === me
            const v = norm === 'rel' ? e.rel : e.est
            const pct = maxV > 0 && v != null ? Math.max(8, Math.round((v / maxV) * 100)) : 0
            return <div className={'fx-row' + (mine ? ' me' : '')} key={e.uid}>
              <span className={'fx-medal' + (i < 3 ? ' m' + (i + 1) : '')}>{i + 1}</span>
              <span className="lrow-i" style={tintOf(e.uid)}>{p?.emoji || '💪'}</span>
              <div className="fx-main">
                <div className="fx-line">
                  <span className="fx-name">{p?.name || e.uid}{mine ? ' · vos' : ''}</span>
                  <span className="fx-val">
                    {norm === 'rel' ? `×${fmtNum(e.rel)}` : `≈${fmtNum(e.est)} ${data.unit}`}
                    <Trend tr={e.trend} />
                  </span>
                </div>
                <div className="fx-bar"><i style={{ width: pct + '%', background: colorOf(e.uid) }} /></div>
              </div>
            </div>
          })}
          {open && <div className="fx-prog">
            {ex.entries.map(e => {
              const p = byUid.get(e.uid)
              const key = norm === 'rel' ? 'rel' : 'est'
              const pts = (e.series || []).filter(s => s[key] != null).map(s => ({ t: Date.parse(s.w + 'T12:00:00'), y: s[key], d: s.w }))
              return <div key={e.uid}>
                <div className="fx-prog-h">
                  <span className="fx-dot" style={{ background: colorOf(e.uid) }} />
                  {p?.name || e.uid}{pts.length > 1 ? ` · ${pts.length} sem` : ''}
                </div>
                <div className="chart">
                  <LineChart points={pts} h={84} unit={norm === 'rel' ? '' : data.unit} color={colorOf(e.uid)} axes={false} />
                </div>
              </div>
            })}
          </div>}
        </div>
      })}

      {data.participantCount === 0 && <div className="card dim" style={{ padding: 20 }}>
        Nadie está compartiendo todavía. Prendé «Aparecer en el ranking» o sumá participantes en <b>friends.json</b>.
      </div>}

      {data.improvement.length > 0 && <div className="card">
        <h2>Mejora de la semana · récords vs su mejor anterior</h2>
        {data.improvement.map((p, i) => (
          <div className="lrow" key={p.uid}>
            <Rank i={i} />
            <span className="lrow-i" style={tintOf(p.uid)}>{p.emoji || '💪'}</span>
            <div className="lrow-m">
              <div className="lrow-t">{p.name}</div>
              <div className="lrow-s">
                {p.prs} {p.prs === 1 ? 'récord' : 'récords'}
                {p.best ? ` · mejor: ${exLabel(p.best.id, p.best.name)} +${p.best.pct}%` : ''}
              </div>
            </div>
            <span className="lrow-v" style={{ color: i === 0 ? 'var(--acc)' : undefined, fontWeight: 600 }}>+{fmtNum(p.gainPct)}%</span>
          </div>
        ))}
      </div>}

      {data.history.length > 0 && data.participantCount > 0 && <div className="card">
        <h2>Últimas {data.history.length} semanas</h2>
        <div className="tbl-scroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Semana</th>
              {data.participants.filter(p => p.shares[metric] !== false).map(p => (
                <th key={p.uid} style={{ ...th, textAlign: 'right' }}>
                  <span className="fx-dot" style={{ background: colorOf(p.uid), marginRight: 5 }} />
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.history.map((w, idx) => (
              <tr key={w.start}>
                <td style={td}>{(idx === 0 ? 'Actual · ' : '') + weekLabel(w.start, w.end)}</td>
                {data.participants.filter(p => p.shares[metric] !== false).map(p => {
                  const v = w.values[p.uid]
                  const cell = metric === 'volume' ? v.volume : metric === 'compliance' ? v.ratio : v.done
                  const isLead = (metric === 'compliance' ? w.leaders.compliance : w.leaders.volume) === p.uid
                  return <td key={p.uid} style={{ ...td, textAlign: 'right', color: isLead ? 'var(--acc)' : undefined, fontWeight: isLead ? 600 : 400 }}>
                    {cell == null ? '—'
                      : metric === 'compliance' ? `${Math.round(cell * 100)}%`
                        : metric === 'volume' ? (norm === 'rel' ? `×${fmtNum(cell)}` : fmtNum(cell))
                          : `${cell}`}
                  </td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <div className="dim small" style={{ marginTop: 8 }}>
          {metric === 'compliance' ? 'Días hechos / planificados'
            : metric === 'streak' ? 'Días entrenados'
              : norm === 'rel' ? 'Volumen ÷ peso corporal' : 'Volumen (kg)'}
        </div>
      </div>}

      {data.manage && <div className="card">
        <h2>Perfiles de la instancia · gestión</h2>
        <div className="dim small" style={{ marginBottom: 6, lineHeight: 1.4 }}>
          Sumá o quitá gente del ranking. El switch «Aparecer en el ranking» de cada uno manda:
          si alguien se sale por su cuenta, no lo fuerces.
        </div>
        {data.manage.profiles.map(pr => (
          <div className="lrow" key={pr.uid}>
            <span className="lrow-i" style={tintOf(pr.uid)}>💪</span>
            <div className="lrow-m">
              <div className="lrow-t">{pr.name}{pr.uid === data.manage.me ? ' (vos)' : ''}</div>
              <div className="lrow-s">{pr.included ? 'En el ranking' : 'Fuera del ranking'}</div>
            </div>
            {pr.uid !== data.manage.me && (pr.included
              ? <Button size="sm" variant="ghost" disabled={busy === pr.uid} onClick={() => manageFriend('/api/friends/remove', pr.uid)}>Quitar</Button>
              : <Button size="sm" variant="tinted" disabled={busy === pr.uid} onClick={() => manageFriend('/api/friends/add', pr.uid)}>Agregar</Button>)}
          </div>
        ))}
        {data.manage.profiles.length <= 1 && <div className="dim small" style={{ marginTop: 6 }}>
          Cuando tus amigos se registren en esta instancia, aparecen acá para sumarlos.
        </div>}
      </div>}

      <div className="dim small" style={{ textAlign: 'center', marginTop: 4 }}>
        Datos de solo lectura · actualizado {new Date(data.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.{' '}
        {norm === 'rel'
          ? '“× peso” = cuántas veces tu peso corporal; tus kg nunca se muestran.'
          : 'El 1RM por ejercicio es una estimación (Epley), no una marca real.'}
      </div>
    </>}

    {view === 'feed' && (user && !isGuest
      ? <Feed social={social} byUid={byUid} tintOf={tintOf} me={me} sharing={sharing} onChanged={loadSocial} />
      : <div className="card dim" style={{ padding: 24 }}>Ingresá con tu perfil para ver la actividad del grupo.</div>)}

    {view === 'routines' && (user && !isGuest
      ? <Routines social={social} byUid={byUid} tintOf={tintOf} me={me} S={S} update={update} onChanged={loadSocial} sharing={sharing} />
      : <div className="card dim" style={{ padding: 24 }}>Ingresá con tu perfil para ver las rutinas del grupo.</div>)}
  </>
}

function Rank({ i }) {
  const win = i === 0
  return <span aria-hidden="true" style={{
    width: 22, height: 22, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600, background: win ? 'var(--acc-soft)' : 'var(--surface-2)', color: win ? 'var(--acc)' : 'var(--label-2)',
  }}>{i + 1}</span>
}

function Trend({ tr }) {
  if (!tr) return null
  if (tr.dir === 'same') return <span className="fx-tr same">=</span>
  return <span className={'fx-tr ' + tr.dir}>{tr.dir === 'up' ? '▲' : '▼'}{tr.pct ? ` ${Math.abs(tr.pct)}%` : ''}</span>
}

function RankList({ data, metric, norm, tintOf }) {
  const order = data.ranking[metric] || []
  const byUid = new Map(data.participants.map(p => [p.uid, p]))
  if (!order.length) {
    return <div className="dim small" style={{ padding: '10px 2px' }}>
      {metric === 'volume' && norm === 'rel'
        ? 'Nadie con peso corporal registrado para el volumen relativo. Probá «kg».'
        : 'Nadie comparte esta métrica todavía.'}
    </div>
  }
  return order.map((uid, i) => {
    const p = byUid.get(uid)
    if (!p) return null
    const value = metric === 'volume'
      ? (p.week.volume == null ? '—' : (norm === 'rel' ? `×${fmtNum(p.week.volume)}` : `${fmtNum(p.week.volume)} ${data.unit}`))
      : metric === 'compliance'
        ? (p.week.ratio == null ? (p.week.done == null ? '—' : `${p.week.done} ses.`) : `${Math.round(p.week.ratio * 100)}%`)
        : (p.streakWeeks == null ? '—' : `${p.streakWeeks} sem`)
    const parts = []
    if (metric !== 'volume' && p.week.volume != null) parts.push(norm === 'rel' ? `×${fmtNum(p.week.volume)}` : `${fmtNum(p.week.volume)} ${data.unit}`)
    if (metric !== 'compliance' && p.week.done != null) parts.push(p.week.planned ? `${p.week.done}/${p.week.planned} días` : `${p.week.done} ses.`)
    if (metric !== 'streak' && p.streakWeeks != null) parts.push(`${p.streakWeeks} sem racha`)
    if (p.lastWorkout) parts.push('últ. ' + shortDate(p.lastWorkout))
    return <div className="lrow" key={uid}>
      <Rank i={i} />
      <span className="lrow-i" style={tintOf(uid)}>{p.emoji || '💪'}</span>
      <div className="lrow-m">
        <div className="lrow-t">{p.name}</div>
        {parts.length > 0 && <div className="lrow-s">{parts.join(' · ')}</div>}
      </div>
      <span className="lrow-v" style={{ color: i === 0 ? 'var(--acc)' : undefined, fontWeight: 600 }}>{value}</span>
    </div>
  })
}

/* ============================ social: actividad y rutinas ============================ */

const timeAgo = iso => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const min = Math.round((Date.now() - t) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d} días`
  return new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const RX = ['🔥', '👏', '💪']

// Feed del grupo: publicaciones de sesiones terminadas (snapshot: nunca entrenos crudos ni pesos).
function Feed({ social, byUid, tintOf, me, sharing, onChanged }) {
  const autoShare = useStore(s => s.S.social?.autoShare)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const [err, setErr] = useState(null)

  const act = async (path, body) => {
    try { await api(path, { method: 'POST', body: JSON.stringify(body) }); await onChanged(); setErr(null) }
    catch (e) { setErr('No se pudo: ' + e.message) }
  }
  const remove = id => confirmSheet({
    title: '¿Borrar esta publicación?',
    message: 'Se quita de Actividad para todos.',
    confirmText: 'Borrar', danger: true,
    onConfirm: () => {
      api('/api/social/post/delete', { method: 'POST', body: JSON.stringify({ id }) })
        .then(onChanged).then(() => toast('Publicación borrada'))
        .catch(e => setErr('No se pudo: ' + e.message))
    },
  })

  if (!social) return <div className="card dim" style={{ padding: 24 }}>Cargando…</div>

  return <>
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lrow-t">Compartir automáticamente</div>
        <div className="lrow-s">
          {sharing ? 'Cada entreno que termines se publica solo acá.' : 'Prendé «Aparecer en el ranking» para participar del feed.'}
        </div>
      </div>
      <Switch checked={!!autoShare} disabled={!sharing} onChange={v => update(s => { s.social = { ...(s.social || {}), autoShare: v } })} />
    </div>

    {social.posts.length === 0 && <div className="card dim" style={{ padding: 20 }}>
      Todavía no hay actividad. Terminá un entreno y compartilo 💪
    </div>}

    {social.posts.map(p => {
      const author = byUid.get(p.uid)
      const mine = me && p.uid === me
      const rEmoji = p.routine && !ICON_NAMES.includes(p.routine.emoji) ? p.routine.emoji : ''
      const rname = p.routine ? [rEmoji, p.routine.name].filter(Boolean).join(' ') : ''
      return <div className="card" key={p.id}>
        <div className="feed-hd">
          <span className="lrow-i" style={tintOf(p.uid)}>{author?.emoji || '💪'}</span>
          <div className="lrow-m">
            <div className="lrow-t">{author?.name || p.uid}</div>
            <div className="lrow-s">{timeAgo(p.created)}{rname ? ' · ' + rname : ''}</div>
          </div>
          {mine && <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>Borrar</Button>}
        </div>
        <div className="feed-stats">
          <span><b>{p.minutes}</b> min</span>
          {p.volumeKg > 0 && <span><b>{fmtVol(p.volumeKg, 'kg')}</b></span>}
          <span><b>{p.sets}</b> series</span>
        </div>
        {p.top.length > 0 && <div className="feed-top">
          {p.top.slice(0, 4).map(s => (
            <div className="feed-set" key={s.id}>
              <span className="feed-set-n">{exLabel(s.id, s.n)}</span>
              <span className="feed-set-v">{fmtNum(s.w)} kg × {s.r}</span>
            </div>
          ))}
          {p.top.length > 4 && <div className="dim small" style={{ marginTop: 2 }}>+{p.top.length - 4} más</div>}
        </div>}
        {p.prs.length > 0 && <div className="small" style={{ color: 'var(--acc)', marginTop: 8 }}>
          🎯 {p.prs.length} PR{p.prs.length > 1 ? 's' : ''}: {p.prs.slice(0, 3).map(id => exLabel(id)).join(' · ')}{p.prs.length > 3 ? ' …' : ''}
        </div>}
        <div className="rx-row">
          {RX.map(e => (
            <button key={e} className={'rx' + (p.mine === e ? ' on' : '')} onClick={() => act('/api/social/react', { id: p.id, emoji: e })}>
              {e}{p.counts[e] ? ' ' + p.counts[e] : ''}
            </button>
          ))}
        </div>
      </div>
    })}
    {err && <div className="dim small" style={{ textAlign: 'center', marginTop: 6 }}>{err}</div>}
  </>
}

// Rutinas del grupo: publicar/actualizar/despublicar las mías y copiar las de los demás.
function Routines({ social, byUid, tintOf, me, S, update, onChanged, sharing }) {
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState(null)
  if (!social) return <div className="card dim" style={{ padding: 24 }}>Cargando…</div>

  const published = (social.routines || []).filter(r => r.uid === me)
  const publishedFor = rid => published.find(p => p.rid === rid) || null
  const myRoutines = (S.routines || []).filter(r => r.ex && r.ex.length)
  const others = (social.routines || []).filter(r => r.uid !== me)

  const publish = async r => {
    setBusy(r.id)
    try {
      const usedCustom = new Set((r.ex || []).map(e => e.id).filter(id => EXIDX[id]?.custom))
      const customEx = (S.customEx || []).filter(c => usedCustom.has(c.id)).map(c => ({ id: c.id, n: c.n, bp: c.bp, ...(c.desc ? { desc: c.desc } : {}) }))
      await api('/api/social/routine', { method: 'POST', body: JSON.stringify({
        routine: { key: publishedFor(r.id)?.key, rid: r.id, name: r.name, emoji: r.emoji, ex: r.ex, customEx },
      }) })
      await onChanged()
      toast('Rutina publicada para el grupo ✓')
    } catch (e) { setErr('No se pudo publicar: ' + e.message) }
    finally { setBusy(null) }
  }
  const unpublish = async r => {
    const pub = publishedFor(r.id)
    if (!pub) return
    setBusy(r.id)
    try { await api('/api/social/routine', { method: 'POST', body: JSON.stringify({ remove: true, key: pub.key }) }); await onChanged() }
    catch (e) { setErr('No se pudo quitar: ' + e.message) }
    finally { setBusy(null) }
  }
  const copy = r => {
    update(s => mergePlan(s, { routines: [{ ...r, id: r.key }], customEx: r.customEx || [] }))
    toast('Rutina copiada a tu plan ✓')
  }

  return <>
    <div className="card">
      <h2>Mis rutinas</h2>
      {!sharing && <div className="dim small" style={{ marginBottom: 6, lineHeight: 1.4 }}>
        Prendé «Aparecer en el ranking» para publicar rutinas para el grupo.
      </div>}
      {myRoutines.length === 0 && <div className="dim small">Todavía no tenés rutinas con ejercicios.</div>}
      {myRoutines.map(r => {
        const pub = publishedFor(r.id)
        return <div className="lrow" key={r.id}>
          <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
          <div className="lrow-m">
            <div className="lrow-t">{r.name || 'Rutina'}</div>
            <div className="lrow-s">{(r.ex || []).length} ejercicios{pub ? ' · publicada' : ''}</div>
          </div>
          <Button size="sm" variant={pub ? 'ghost' : 'tinted'} disabled={!sharing || busy === r.id} onClick={() => publish(r)}>{pub ? 'Actualizar' : 'Publicar'}</Button>
          {pub && <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => unpublish(r)}>Quitar</Button>}
        </div>
      })}
    </div>

    <div className="card">
      <h2>Rutinas del grupo</h2>
      {others.length === 0 && <div className="dim small">Todavía no hay rutinas compartidas por otros.</div>}
      {others.map(r => {
        const author = byUid.get(r.uid)
        return <div className="lrow" key={r.key}>
          <span className="lrow-i" style={tintOf(r.uid)}><Icon name={glyphOf(r.emoji)} /></span>
          <div className="lrow-m">
            <div className="lrow-t">{r.name}</div>
            <div className="lrow-s">{author?.name || r.uid} · {r.ex.length} ejercicios · {timeAgo(r.updated)}</div>
          </div>
          <Button size="sm" variant="tinted" onClick={() => copy(r)}>Copiar</Button>
        </div>
      })}
    </div>
    {err && <div className="dim small" style={{ textAlign: 'center', marginTop: 6 }}>{err}</div>}
  </>
}

/* ============================ datos derivados de la vista ============================ */

/** Territorios: dueño de cada músculo = mejor ×peso promedio **entre los ejercicios que lo
 *  trabajan directo** (peso ≥ 0.5 en `musclesOf`); si nadie lo hace directo, cae al pozo de
 *  los secundarios y se marca `direct:false`. Con menos de dos contendientes, el músculo queda
 *  gris. Se calcula acá porque el mapeo ejercicio→músculos vive en las librerías del frontend. */
function territoryOf(data) {
  const byUid = new Map(data.participants.map(p => [p.uid, p]))
  const bySlug = new Map()
  for (const ex of data.exercises) {
    const e = exOr(ex.id)
    if (!e) continue
    const weights = musclesOf(e)
    for (const slug of muscleGroupsOf(e)) {
      let m = bySlug.get(slug)
      if (!m) { m = { all: new Map(), primary: new Map() }; bySlug.set(slug, m) }
      const direct = (weights[slug] || 0) >= 0.5
      const bump = (map, en) => {
        const cur = map.get(en.uid) || { sum: 0, n: 0, best: 0, d: null }
        cur.sum += en.rel; cur.n++
        if (en.rel > cur.best) { cur.best = en.rel; cur.d = en.d }
        map.set(en.uid, cur)
      }
      for (const en of ex.entries) {
        if (en.rel == null) continue
        bump(m.all, en)
        if (direct) bump(m.primary, en)
      }
    }
  }
  const owners = {}
  for (const [slug, m] of bySlug) {
    const toList = map => [...map.entries()].map(([uid, v]) => ({ uid, avg: v.sum / v.n, best: v.best, d: v.d }))
    const listAll = toList(m.all)
    if (listAll.length < 2) continue
    const listPrimary = toList(m.primary)
    const pool = (listPrimary.length ? listPrimary : listAll).sort((a, b) => b.avg - a.avg || b.best - a.best)
    const w = pool[0]
    const p = byUid.get(w.uid)
    owners[slug] = {
      uid: w.uid, name: p?.name || w.uid, color: ACCENTS[p?.color] || 'var(--label-3)',
      avg: Math.round(w.avg * 100) / 100, d: w.d, recent: !!(w.d && w.d >= data.week.start),
      direct: listPrimary.length > 0,
    }
  }
  return { owners, list: MUSCLES.filter(s => owners[s]).map(s => ({ slug: s, ...owners[s] })) }
}

/** Premios semanales + campeón de la semana pasada (todo sale de datos que ya viajan). */
function prizesOf(data) {
  const byUid = new Map(data.participants.map(p => [p.uid, p]))
  const list = []
  const vol = (data.ranking.volume || []).map(uid => byUid.get(uid)).find(p => p && p.week.volume != null)
  if (vol) list.push({
    k: 'vol', icon: '👑', label: 'Rey del volumen', uid: vol.uid, name: vol.name,
    value: data.norm === 'rel' ? `×${fmtNum(vol.week.volume)}` : `${fmtNum(vol.week.volume)} ${data.unit}`,
  })
  const muro = data.participants.filter(p => p.week.ratio != null && p.week.planned > 0)
    .sort((a, b) => b.week.ratio - a.week.ratio)[0]
  if (muro) list.push({
    k: 'muro', icon: '🧱', label: 'El muro · cumplimiento', uid: muro.uid, name: muro.name,
    value: `${Math.round(muro.week.ratio * 100)}%`,
  })
  const pr = data.improvement[0]
  if (pr) list.push({ k: 'pr', icon: '🎯', label: 'Cazador de PRs', uid: pr.uid, name: pr.name, value: `+${fmtNum(pr.gainPct)}%` })
  const racha = [...data.participants].sort((a, b) => (b.streakWeeks || 0) - (a.streakWeeks || 0))[0]
  if (racha && racha.streakWeeks > 0) list.push({ k: 'racha', icon: '🔥', label: 'En llamas · racha', uid: racha.uid, name: racha.name, value: `${racha.streakWeeks} sem` })
  const duel = new Map()
  for (const ex of data.exercises) { const lead = ex.entries[0]; if (lead) duel.set(lead.uid, (duel.get(lead.uid) || 0) + 1) }
  const [dUid, dN] = [...duel.entries()].sort((a, b) => b[1] - a[1])[0] || []
  if (dUid && dN > 1) list.push({ k: 'duel', icon: '⚔️', label: 'Duelista · ejercicios liderados', uid: dUid, name: byUid.get(dUid)?.name || dUid, value: `${dN}` })

  const prev = data.history[1]
  const champUid = prev?.leaders?.volume
  let champion = null
  if (champUid) {
    const v = prev.values[champUid]?.volume
    if (v != null) champion = {
      uid: champUid, name: byUid.get(champUid)?.name || champUid,
      value: data.norm === 'rel' ? `×${fmtNum(v)}` : `${fmtNum(v)} ${data.unit}`,
    }
  }
  return { list, champion }
}

const th = { textAlign: 'left', fontWeight: 400, fontSize: 12, color: 'var(--label-2)', padding: '6px 4px', borderBottom: 'var(--hair) solid var(--sep)', whiteSpace: 'nowrap' }
const td = { padding: '6px 4px', borderBottom: 'var(--hair) solid var(--sep)', whiteSpace: 'nowrap' }
