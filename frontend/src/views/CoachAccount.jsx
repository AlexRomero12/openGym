// This profile's own AI account — the screen profile mode is built around.
//
// Instance mode has an admin card and nothing here; profile mode flips that: the admin only
// says "the Coach exists and each of you brings an account", and this screen is where a person
// chooses the provider (Anthropic, OpenAI, Gemini, DeepSeek, OpenCode or an OpenAI-compatible
// endpoint), checks
// the key by listing the models, and files it. The key is write-only from here on — it goes to
// the server once, is encrypted at rest, and comes back out only as the provider variable on
// this profile's own jobs. No route can read it back, not even for the admin.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { coachSetup, coachModels, coachConnect, coachDisconnect } from '../lib/coach-api.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Section, Row, Button, TextField } from '../components/ui.jsx'

export default function CoachAccount() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [d, setD] = useState(null)
  const [editing, setEditing] = useState(false)
  const [provider, setProvider] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = () => coachSetup().then(setD).catch(e => toast(e.message || t('Could not load')))
  useEffect(() => { load() }, [])

  // The form opens on whatever is filed (changing one field must not mean retyping the rest),
  // and on nothing at all for a profile connecting for the first time.
  useEffect(() => {
    if (!d || editing) return
    setProvider(d.provider || d.providers?.[0]?.id || '')
    setBaseUrl(d.baseUrl || '')
    setModel(d.model || '')
  }, [d])

  const meta = (d?.providers || []).find(p => p.id === provider) || null
  const unchangedKey = !!(d?.connected && d.provider === provider)

  const listModels = async () => {
    if (!meta) return
    if (meta.baseUrl && !baseUrl.trim()) return toast(t('Enter the endpoint'))
    if (!meta.keyOptional && !key.trim() && !unchangedKey) return toast(t('Enter your API key'))
    setBusy(true)
    try {
      const r = await coachModels(provider, key.trim(), baseUrl.trim())
      if (!r?.ok) { toast(t('Could not reach the provider: {0}', r?.error || '')); return }
      setModels(r.models || [])
      if (!model && meta.defaultModel && (r.models || []).includes(meta.defaultModel)) setModel(meta.defaultModel)
    } catch (e) {
      toast(e.message || t('Could not connect'))
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (!meta) return
    const chosen = model || meta.defaultModel || ''
    if (!chosen) return toast(t('Pick a model — list what the endpoint serves first'))
    if (!meta.keyOptional && !key.trim() && !unchangedKey) return toast(t('Enter your API key'))
    setBusy(true)
    try {
      await coachConnect({ provider, key: key.trim(), model: chosen, baseUrl: meta.baseUrl ? baseUrl.trim() : null })
      setKey(''); setModels(null); setEditing(false)
      toast(t('Your account is connected'))
      await load()
    } catch (e) {
      toast(e.message || t('Could not connect'))
    } finally { setBusy(false) }
  }

  const remove = () => confirmSheet({
    title: t('Remove your AI account?'),
    message: t('The Coach stops working for you until you connect again. Anything it is holding for you is discarded. Your key is deleted from the server.'),
    confirmText: t('Remove'),
    danger: true,
    onConfirm: async () => {
      try {
        await coachDisconnect()
        setModels(null); setEditing(false)
        toast(t('Your account was removed'))
        await load()
      } catch (e) { toast(e.message || t('Could not remove it')) }
    }
  })

  const back = () => nav(-1)

  if (!d) return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('My AI account')}</h1></div>
    </div>
    <div className="card"><div className="muted small">{t('Loading…')}</div></div>
  </div>

  return <div className="narrow">
    <div className="hdr">
      <button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 10 }}><h1>{t('My AI account')}</h1></div>
    </div>

    {!d.canConnect ? <div className="card">
      <div className="muted small">{t('This instance runs the Coach on one shared account, set up by its admin — there is nothing to connect here.')}</div>
    </div> : d.connected && !editing ? <>
      <Section title={t('Connected')} footer={t('Your key is stored encrypted on your server and is used only for your own Coach runs. Not even the admin can read it.')}>
        <Row icon="key" iconTint="var(--acc)" title={d.providerLabel || provider} subtitle={d.model ? t('Model {0}', d.model) : null} />
        <Row icon="wrench" iconTint="var(--indigo)" title={t('Change provider, key or model')} accessory="chevron"
          onClick={() => { setEditing(true); setModels(null); setKey('') }} />
        <Row icon="signOut" iconTint="var(--red)" title={t('Remove my account')} danger onClick={remove} />
      </Section>
    </> : <>
      <Section title={t('Provider')} footer={t('Each profile connects their own account: who you use here is yours alone, and so is the bill.')}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 7, padding: '8px 12px' }}>
          {(d.providers || []).map(p => <button key={p.id} className={'chip' + (p.id === provider ? ' on' : '')} disabled={busy}
            onClick={() => { setProvider(p.id); setModels(null); setModel('') }}>{p.label}</button>)}
        </div>
      </Section>

      {meta?.baseUrl && <Section title={t('Endpoint')} footer={t('The base URL of your OpenAI-compatible server — Ollama, LM Studio, OpenRouter, a gateway.')}>
        <div style={{ padding: '8px 12px' }}>
          <TextField value={baseUrl} placeholder="http://ollama.lan:11434" inputMode="url" autoCapitalize="none" autoCorrect="off"
            onChange={e => setBaseUrl(e.target.value)} />
        </div>
      </Section>}

      <Section title={t('API key')} footer={t('The key goes to your server once, encrypted. It is never shown again and never leaves except to call the provider.')}>
        <div style={{ padding: '8px 12px' }}>
          <TextField value={key} type="password" placeholder={unchangedKey ? '••••••••  ' + t('(saved)') : (meta?.keyPlaceholder || 'sk-…')} autoCapitalize="none" autoCorrect="off"
            onChange={e => setKey(e.target.value)} />
        </div>
      </Section>

      {models && <Section title={t('Model')}>
        <div style={{ padding: '8px 12px' }}>
          <select className="input" value={model} disabled={busy} onChange={e => setModel(e.target.value)} style={{ width: '100%' }}>
            <option value="">{meta?.defaultModel ? `(${meta.defaultModel})` : t('Pick a model')}</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </Section>}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {!models
          ? <Button variant="primary" icon="sparkles" disabled={busy} onClick={listModels}>{t('Check my key and list models')}</Button>
          : <Button variant="primary" icon="check" disabled={busy} onClick={save}>{t('Save and use the Coach')}</Button>}
        {models && <Button disabled={busy} onClick={listModels}>{t('List models again')}</Button>}
        {d.connected && <Button disabled={busy} onClick={() => { setEditing(false); setKey(''); setModels(null) }}>{t('Cancel')}</Button>}
      </div>
    </>}
  </div>
}
