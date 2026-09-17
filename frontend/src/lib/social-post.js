// Publicar una sesión en el feed del grupo (feature local «Amigos»).
// Construye el snapshot que viaja al servidor: agregados + destacados, todo en kg y sin
// pesos corporales. El servidor valida y acota (api/social.js).
import { api } from './api.js'
import { isWarmupRow } from './workout-model.js'
import { EXIDX } from './exercises.js'

const LB_TO_KG = 0.45359237

/** Resumen de un entreno terminado (w) para el feed. */
export function buildSessionPost(S, w, { prs = [], e1prs = [] } = {}) {
  const toKg = v => (S.unit === 'lb' ? v * LB_TO_KG : v)
  const routine = (S.routines || []).find(r => r.id === w.routineId) || null
  let sets = 0
  const top = []
  for (const e of (w.entries || [])) {
    const doneWork = (e.sets || []).filter(s => s.done && !isWarmupRow(s))
    sets += doneWork.length
    const loaded = doneWork.filter(s => Number(s.w) > 0)
    if (!loaded.length) continue
    const best = loaded.reduce((a, b) => (b.w > a.w || (b.w === a.w && (b.r || 0) > (a.r || 0)) ? b : a))
    const ex = EXIDX[e.id]
    top.push({
      id: e.id,
      w: Math.round(toKg(Number(best.w)) * 100) / 100,
      r: Math.round(Number(best.r) || 0),
      ...(ex?.custom ? { n: ex.n } : {}),
    })
  }
  top.sort((a, b) => b.w - a.w)
  return {
    routine: routine ? { name: routine.name || '', emoji: routine.emoji || '' } : null,
    minutes: Math.max(1, Math.round(((w.end || Date.now()) - (w.start || Date.now())) / 60000)),
    volumeKg: Math.round(toKg(Number(w.vol) || 0) * 10) / 10,
    sets,
    unit: 'kg',
    top: top.slice(0, 20),
    prs: [...new Set([...prs, ...e1prs.map(p => p.id)])].slice(0, 30),
  }
}

export async function shareSession(post) {
  return api('/api/social/post', { method: 'POST', body: JSON.stringify({ post }) })
}
