const $ = sel => document.querySelector(sel)
const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const fmt = n => (n == null ? '—' : nf.format(n))
const cap = s => String(s || '').replace(/(^|[\s(\-/])(\p{Ll})/gu, (m, pre, ch) => pre + ch.toUpperCase())

const METRIC_LABELS = { volume: 'Volumen', compliance: 'Cumplimiento', streak: 'Racha' }
const NORM_LABELS = { rel: '× peso', abs: 'kg' }

let state = { data: null, metric: 'volume', norm: 'rel', loading: false }

function weekLabel(start, end) {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const md = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
  return `${md(s)} – ${md(e)}`
}

/* --------------------------------------------------------------- tema -- */
function applyTheme() {
  const stored = localStorage.getItem('ogf-theme')
  const theme = stored || (state.data?.theme === 'light' ? 'light' : 'dark')
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.accent = state.data?.accent || 'lime'
  $('#themeGlyph').textContent = theme === 'light' ? '☾' : '☀'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f2f7' : '#000000')
}

/* ------------------------------------------------------------ ranking -- */
// Volumen: en %s se muestra como múltiplo del peso corporal (×N); si no, kg.
function volumeText(v) {
  if (v == null) return null
  return state.norm === 'rel' ? `×${fmt(v)}` : `${fmt(v)} ${state.data.unit}`
}

function metricValue(p, metric) {
  if (metric === 'volume') return volumeText(p.week.volume)
  if (metric === 'compliance') {
    if (p.week.ratio == null) return p.week.done == null ? null : `${p.week.done} ses.`
    return `${Math.round(p.week.ratio * 100)}%`
  }
  return p.streakWeeks == null ? null : `${p.streakWeeks} sem`
}

function subLine(p, metric) {
  const parts = []
  if (metric !== 'volume' && p.week.volume != null) parts.push(volumeText(p.week.volume))
  if (metric !== 'compliance' && p.week.done != null) parts.push(p.week.planned ? `${p.week.done}/${p.week.planned} días` : `${p.week.done} ses.`)
  if (metric !== 'streak' && p.streakWeeks != null) parts.push(`${p.streakWeeks} sem racha`)
  return parts.join(' · ')
}

function renderRanking() {
  const d = state.data
  const list = $('#rankList')
  list.textContent = ''
  const order = d.ranking[state.metric] || []
  const byUid = new Map(d.participants.map(p => [p.uid, p]))
  const normTag = state.metric === 'volume' ? ` · ${NORM_LABELS[state.norm]}` : ''
  $('#rankTitle').textContent = `${METRIC_LABELS[state.metric]}${normTag} · semana ${weekLabel(d.week.start, d.week.end)}`
  $('#rankFoot').textContent = d.participantCount
    ? `${d.participantCount} ${d.participantCount === 1 ? 'participante' : 'participantes'} · se reinicia cada ${d.weekDays === 'sunday' ? 'domingo' : 'lunes'}`
    : ''

  if (!order.length) {
    const msg = state.metric === 'volume' && state.norm === 'rel'
      ? 'Nadie con peso corporal registrado para el volumen relativo. Probá “kg”.'
      : 'Nadie comparte esta métrica todavía.'
    list.append(el('div', 'loading', msg))
    return
  }
  order.forEach((uid, i) => {
    const p = byUid.get(uid)
    if (!p) return
    const row = el('div', 'lrow')
    row.append(el('span', 'rank r' + (i + 1), String(i + 1)))
    row.append(el('span', 'lrow-i', p.emoji || '💪'))
    const mid = el('div', 'lrow-m')
    mid.append(el('div', 'lrow-t', p.name))
    const sub = subLine(p, state.metric)
    if (sub) mid.append(el('div', 'lrow-s', sub))
    row.append(mid)
    row.append(el('span', 'lrow-v strong' + (i === 0 ? ' win' : ''), metricValue(p, state.metric) ?? '—'))
    list.append(row)
  })
}

/* -------------------------------------------------------------- mejora -- */
function renderImprovement() {
  const d = state.data
  const sect = $('#imprSect')
  const list = $('#imprList')
  list.textContent = ''
  if (!d.improvement || !d.improvement.length) { sect.hidden = true; return }
  sect.hidden = false
  d.improvement.forEach((p, i) => {
    const row = el('div', 'lrow')
    row.append(el('span', 'rank r' + (i + 1), String(i + 1)))
    row.append(el('span', 'lrow-i', p.emoji || '💪'))
    const mid = el('div', 'lrow-m')
    mid.append(el('div', 'lrow-t', p.name))
    const parts = [`${p.prs} ${p.prs === 1 ? 'récord' : 'récords'}`]
    if (p.best) parts.push(`mejor: ${p.best.name} +${p.best.pct}%`)
    mid.append(el('div', 'lrow-s', parts.join(' · ')))
    row.append(mid)
    row.append(el('span', 'lrow-v strong' + (i === 0 ? ' win' : ''), `+${fmt(p.gainPct)}%`))
    list.append(row)
  })
}

/* ----------------------------------------------------------- ejercicio -- */
function renderExercises() {
  const d = state.data
  const sect = $('#exSect')
  const box = $('#exList')
  box.textContent = ''
  sect.querySelector('.sect-t').textContent = state.norm === 'rel'
    ? 'Por ejercicio · 1RM estimado relativo (× peso)'
    : 'Por ejercicio · mejor 1RM estimado (Epley)'
  if (!d.exercises.length) { sect.hidden = true; return }
  sect.hidden = false
  const byUid = new Map(d.participants.map(p => [p.uid, p]))

  for (const ex of d.exercises) {
    const card = el('div', 'card')
    const head = el('div', 'ex-head')
    head.append(el('span', 'name', cap(ex.name)))
    head.append(el('span', 'tag acc', `${ex.people}`))
    card.append(head)
    const ul = el('ul', 'ex-list')
    ex.entries.forEach(e => {
      const p = byUid.get(e.uid)
      const row = el('li', 'ex-row')
      row.append(el('span', 'lrow-i', p?.emoji || '💪'))
      row.append(el('span', 'nm', p?.name || e.uid))
      const val = state.norm === 'rel'
        ? el('span', 'val', `×${fmt(e.rel)}`)
        : el('span', 'val', `≈${fmt(e.est)} ${d.unit}`)
      if (e.improved) val.append(el('span', 'up', '▲'))
      row.append(val)
      row.append(el('span', 'src', state.norm === 'rel' ? `${e.r} reps` : `de ${fmt(e.w)}×${e.r}`))
      ul.append(row)
    })
    card.append(ul)
    box.append(card)
  }
}

/* ------------------------------------------------------------ histórico -- */
function cellValue(v, metric) {
  if (!v) return null
  if (metric === 'volume') return v.volume == null ? null : (state.norm === 'rel' ? `×${fmt(v.volume)}` : `${fmt(v.volume)}`)
  if (metric === 'compliance') return v.ratio == null ? null : `${Math.round(v.ratio * 100)}%`
  return v.done == null ? null : `${v.done}`
}

function renderHistory() {
  const d = state.data
  const sect = $('#histSect')
  const table = $('#histTable')
  table.textContent = ''
  if (!d.history.length || !d.participants.length) { sect.hidden = true; return }
  sect.hidden = false

  const thead = el('thead')
  const htr = el('tr')
  htr.append(el('th', null, 'Semana'))
  for (const p of d.participants) {
    if (p.shares[state.metric] === false || (state.metric === 'volume' && state.norm === 'rel' && !p.hasBodyweight)) continue
    htr.append(el('th', null, `${p.emoji} ${p.name}`))
  }
  thead.append(htr)
  table.append(thead)

  const tbody = el('tbody')
  d.history.forEach((w, idx) => {
    const tr = el('tr')
    tr.append(el('td', null, (idx === 0 ? 'Actual · ' : '') + weekLabel(w.start, w.end)))
    const leader = state.metric === 'compliance' ? w.leaders.compliance : w.leaders.volume
    for (const p of d.participants) {
      if (p.shares[state.metric] === false || (state.metric === 'volume' && state.norm === 'rel' && !p.hasBodyweight)) continue
      const v = cellValue(w.values[p.uid], state.metric)
      tr.append(el('td', v == null ? 'empty' : (p.uid === leader ? 'lead' : null), v ?? '—'))
    }
    tbody.append(tr)
  })
  table.append(tbody)

  const unit = state.metric !== 'volume' ? (state.metric === 'compliance' ? ' (% días hechos / planificados)' : ' (días entrenados)')
    : (state.norm === 'rel' ? ' (× peso corporal por semana)' : ` (${d.unit})`)
  $('#histFoot').textContent = `${METRIC_LABELS[state.metric]}${unit} · últimas ${d.history.length} semanas`
}

/* ----------------------------------------------------------------- app -- */
function render() {
  if (!state.data) return
  applyTheme()
  const d = state.data
  $('#title').textContent = d.title
  $('#subtitle').textContent = d.subtitle || `Semana ${weekLabel(d.week.start, d.week.end)}`
  document.title = d.title

  const mSeg = $('#metricSeg')
  mSeg.hidden = false
  mSeg.style.setProperty('--i', String(['volume', 'compliance', 'streak'].indexOf(state.metric)))
  mSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.metric === state.metric))

  const nSeg = $('#normSeg')
  nSeg.hidden = false
  nSeg.style.setProperty('--i', String(state.norm === 'rel' ? 0 : 1))
  nSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.norm === state.norm))

  renderRanking()
  renderImprovement()
  renderExercises()
  renderHistory()

  const when = new Date(d.generatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  $('#footNote').textContent = `Datos de solo lectura · actualizado ${when}. `
    + (state.norm === 'rel'
      ? '“× peso” = cuántas veces tu peso corporal; tus kg de peso nunca se muestran.'
      : 'El 1RM por ejercicio es una estimación (Epley), no una marca real.')
}

async function load() {
  if (state.loading) return
  state.loading = true
  $('#refresh').style.opacity = '.5'
  try {
    const res = await fetch(`/api/ranking?norm=${state.norm}`, { cache: 'no-store' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    state.data = await res.json()
    render()
  } catch (err) {
    $('#subtitle').textContent = 'No se pudo cargar: ' + err.message
  } finally {
    state.loading = false
    $('#refresh').style.opacity = ''
  }
}

$('#metricSeg').addEventListener('click', e => {
  const btn = e.target.closest('button[data-metric]')
  if (!btn) return
  state.metric = btn.dataset.metric
  render()
})
$('#normSeg').addEventListener('click', e => {
  const btn = e.target.closest('button[data-norm]')
  if (!btn || btn.dataset.norm === state.norm) return
  state.norm = btn.dataset.norm
  load()
})
$('#refresh').addEventListener('click', load)
$('#theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme
  localStorage.setItem('ogf-theme', cur === 'light' ? 'dark' : 'light')
  applyTheme()
})

load()
