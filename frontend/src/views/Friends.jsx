// Vista «Amigos» — ranking entre perfiles de esta instancia (feature local de este fork).
// Consume /api/friends (agregados de solo lectura; nunca estados crudos ni pesos corporales).
// Quién aparece: switch «Aparecer en el ranking» (opt-in por perfil) + lista del dueño
// (friends.json). Textos literales en español a propósito: la única usuaria es Alex.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { exOr } from '../lib/exercises.js'
import { fmtNum } from '../lib/format.js'
import { Button, Segmented, Switch } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { exerciseNameFor } from '../lib/i18n.js'

const cap = s => String(s || '').replace(/(^|[\s(\-/])(\p{Ll})/gu, (m, pre, ch) => pre + ch.toUpperCase())
const weekLabel = (a, b) => {
  const f = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return `${f(a)} – ${f(b)}`
}
const shortDate = iso => new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
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

  const sub = data
    ? `${weekLabel(data.week.start, data.week.end)} · ${data.participantCount} participante${data.participantCount === 1 ? '' : 's'}`
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

    {!data && !error && <div className="card dim" style={{ textAlign: 'center', padding: 24 }}>Cargando…</div>}
    {error && <div className="card dim" style={{ padding: 24 }}>{error}</div>}

    {data && <>
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
        <RankList data={data} metric={metric} norm={norm} />
        {data.participantCount > 0 && <div className="dim small" style={{ marginTop: 8 }}>
          Se reinicia cada {data.weekDays === 'sunday' ? 'domingo' : 'lunes'}.
        </div>}
      </div>

      {data.improvement.length > 0 && <div className="card">
        <h2>Mejora de la semana · récords vs su mejor anterior</h2>
        {data.improvement.map((p, i) => (
          <div className="lrow" key={p.uid}>
            <Rank i={i} />
            <span className="lrow-i">{p.emoji || '💪'}</span>
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

      {data.exercises.length > 0 && <h4 className="sec">
        Por ejercicio · {norm === 'rel' ? '1RM estimado relativo (× peso)' : 'mejor 1RM estimado (Epley)'}
      </h4>}
      {data.exercises.map(ex => (
        <div className="card" key={ex.id}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <span className="t-head">{exLabel(ex.id, ex.name)}</span>
            <span className="tag">{ex.people}</span>
          </div>
          {ex.entries.map((e, i) => {
            const p = data.participants.find(x => x.uid === e.uid)
            return <div className="lrow" key={e.uid}>
              <Rank i={i} />
              <span className="lrow-i">{p?.emoji || '💪'}</span>
              <div className="lrow-m"><div className="lrow-t">{p?.name || e.uid}</div></div>
              <span className="lrow-v" style={{ color: i === 0 ? 'var(--acc)' : undefined }}>
                {norm === 'rel' ? `×${fmtNum(e.rel)}` : `≈${fmtNum(e.est)} ${data.unit}`}
                {e.improved ? ' ▲' : ''}
              </span>
            </div>
          })}
        </div>
      ))}

      {data.participantCount === 0 && <div className="card dim" style={{ padding: 20 }}>
        Nadie está compartiendo todavía. Prendé «Aparecer en el ranking» o sumá participantes en <b>friends.json</b>.
      </div>}

      {data.history.length > 0 && data.participantCount > 0 && <div className="card">
        <h2>Últimas {data.history.length} semanas</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={th}>Semana</th>
              {data.participants.filter(p => p.shares[metric] !== false).map(p => (
                <th key={p.uid} style={{ ...th, textAlign: 'right' }}>{p.emoji} {p.name}</th>
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
            <span className="lrow-i">💪</span>
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
  </>
}

function Rank({ i }) {
  const win = i === 0
  return <span aria-hidden="true" style={{
    width: 22, height: 22, borderRadius: 11, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 600, background: win ? 'var(--acc-soft)' : 'var(--surface-2)', color: win ? 'var(--acc)' : 'var(--label-2)',
  }}>{i + 1}</span>
}

function RankList({ data, metric, norm }) {
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
      <span className="lrow-i">{p.emoji || '💪'}</span>
      <div className="lrow-m">
        <div className="lrow-t">{p.name}</div>
        {parts.length > 0 && <div className="lrow-s">{parts.join(' · ')}</div>}
      </div>
      <span className="lrow-v" style={{ color: i === 0 ? 'var(--acc)' : undefined, fontWeight: 600 }}>{value}</span>
    </div>
  })
}

const th = { textAlign: 'left', fontWeight: 400, fontSize: 12, color: 'var(--label-2)', padding: '6px 4px', borderBottom: 'var(--hair) solid var(--sep)', whiteSpace: 'nowrap' }
const td = { padding: '6px 4px', borderBottom: 'var(--hair) solid var(--sep)', whiteSpace: 'nowrap' }
