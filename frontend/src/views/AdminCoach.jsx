import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import Icon from '../components/Icon.jsx'
import { Button, Switch, TextField } from '../components/ui.jsx'

/* The operator's side of the Coach, laid out as a guided setup: one master switch, numbered
   steps that each say what they are for, and everything an owner rarely needs folded away
   under "Advanced" and "Activity". The fork translates this surface with the rest of the app
   (upstream kept the admin screens English-only; the fork's rule — the UI language applies
   everywhere the operator reads — wins here).

   What it never shows: anybody's intake answers, payloads or proposals. An admin can enable
   the feature and see that jobs ran; they cannot read what their users asked it.

   This is the ONLY place the Coach can be switched off for everyone. Users can decline the
   consent screen for themselves, but they cannot disable the feature — that is an operator
   decision, so it lives with the operator. */

const rel = ts => {
  if (!ts) return t('never')
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return t('just now')
  if (s < 3600) return t('{0} min ago', Math.floor(s / 60))
  if (s < 86400) return t('{0} h ago', Math.floor(s / 3600))
  return t('{0} d ago', Math.floor(s / 86400))
}

// Which chips go under which heading. Runtime-backed providers are the ones that need the
// bigger `coach` image; the fixture exists so the whole loop can be walked without any account.
const RUNTIME_IDS = ['claude', 'codex']
const TESTING_IDS = ['fixture']

export default function AdminCoach() {
  const toast = useUI(s => s.toast)
  const openSheet = useUI(s => s.openSheet)
  const nav = useNavigate()
  const refreshConfig = useStore(s => s.refreshConfig)
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  // The models the endpoint serves, fetched on demand. Seeded from the status call when the
  // stored key already let it list them.
  const [models, setModels] = useState(null)
  // The last "Test the Coach" outcome, shown inline where the button is rather than only as a
  // toast that is gone before anyone has read the provider's reason.
  const [testResult, setTestResult] = useState(null)

  const load = () => api('/api/admin/coach').then(r => { setD(r); setModels(r.knownModels || null) }).catch(e => toast(e.message || t('Failed to load')))
  useEffect(() => { load() }, [])

  const patch = async body => {
    setBusy(true)
    try {
      await api('/api/admin/coach/config', { method: 'POST', body: JSON.stringify(body) })
      await load()
      // The rest of the app hangs off /api/config, which it caches from boot: the master switch
      // and the account mode must reach Settings and the Plan CTA without a page reload.
      refreshConfig().catch(() => {})
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const loadModels = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/coach/models', { method: 'POST', body: '{}' })
      if (r.ok) { setModels(r.models); toast(t('{0} models', r.models.length)) } else toast(r.error || t('Could not list models'))
    } catch (e) { toast(e.message) }
    setBusy(false)
  }
  const test = async () => {
    setBusy(true); setTestResult({ pending: true })
    try {
      const r = await api('/api/admin/coach/test', { method: 'POST', body: '{}' })
      setTestResult(r)
      toast(r.ok ? t('Coach test passed ✅') : t('Test failed'))
      await load()
    } catch (e) { setTestResult({ ok: false, error: e.message }); toast(e.message) }
    setBusy(false)
  }
  const disconnect = async () => {
    setBusy(true)
    try { await api('/api/admin/coach/disconnect', { method: 'POST', body: JSON.stringify({ provider: d.provider }) }); toast(t('Credential removed')); await load() }
    catch (e) { toast(e.message) }
    setBusy(false)
  }

  if (!d) return <div className="card"><div className="muted small">{t('Loading Coach status…')}</div></div>

  if (d.disabledByEnv) return <div className="card">
    <h2 style={{ margin: '0 0 6px' }}>{t('AI Coach')}</h2>
    <div className="adm-lead">{t('Force-disabled by COACH_DISABLED in the server environment. Remove that variable and restart to configure the Coach here.')}</div>
  </div>

  const meta = d.providers.find(p => p.id === d.provider) || {}
  const profile = d.authMode === 'profile'
  const authState = d.auth?.state
  const authed = authState === 'connected' || authState === 'not-required' || authState === 'optional'
  const needsEndpoint = !!meta.baseUrl
  const hasEndpoint = !needsEndpoint || !!d.baseUrl
  const live = d.enabled && (profile || (d.runtime.ok && authed && hasEndpoint))

  const status = !d.enabled ? t('Off — users see no Coach anywhere in the app.')
    : profile ? <>{t('On · each profile connects their own account')}{d.profiles?.connected ? t(' · {0} connected', d.profiles.connected) : ''}</>
      : live ? <>{t('On · {0}', meta.label + (d.model ? ' · ' + d.model : ''))}</>
        : !hasEndpoint ? t('On, but no endpoint yet — finish step 2.')
          : !authed ? t('On, but no credential yet — finish the Credential step.')
            : !d.runtime.ok ? t('On, but the provider cannot be reached — see the Test step.')
              : t('On')

  // Chips, grouped.
  const groups = [
    { title: t('Paste an API key'), hint: t('Plain HTTPS to the provider. Works on the default api image — nothing extra to install.'), items: d.providers.filter(p => p.http) },
    { title: t('Runs a local AI runtime'), hint: t('Needs the bigger api image built with --target coach.'), items: d.providers.filter(p => RUNTIME_IDS.includes(p.id)) },
    { title: t('Testing'), hint: t('A built-in fake that answers instantly, so the whole loop can be tried without an account.'), items: d.providers.filter(p => TESTING_IDS.includes(p.id)) }
  ]

  const hasCredentialStep = !!(meta.setupToken || meta.apiKey)
  const step1Done = !!d.provider
  const step2Done = hasEndpoint
  const step3Done = authed
  const step4Done = !!d.model
  const step5Done = !!testResult?.ok || !!d.lastSuccess
  // Step numbers only count the steps this provider actually shows — and like any wizard,
  // only the first unfinished step stands open; everything done folds to its summary line.
  const flags = [step1Done, ...(needsEndpoint ? [step2Done] : []), ...(hasCredentialStep ? [step3Done] : []), step4Done, step5Done]
  const doneCount = flags.filter(Boolean).length
  const firstTodo = flags.indexOf(false)
  let n = 1
  let idx = 0
  const num = () => n++
  const stepAt = () => { const i = idx++; return { open: i === (firstTodo === -1 ? -1 : firstTodo), key: i + ':' + (i === firstTodo) } }

  // Off = a quiet, optional feature: one clean pitch and one button, no half-dimmed controls.
  if (!d.enabled) return <div className="card">
    <div className="adm-hero">
      <div className="adm-hero-av"><Icon name="sparkles" /></div>
      <h2>{t('AI Coach')}</h2>
      <p>{t('An optional coach that designs training plans and reviews what people actually log. Off right now — nobody sees it anywhere in the app.')}</p>
      <div className="adm-hero-feats">
        <div><Icon name="clipboard" /><span><b>{t('Bring any AI.')}</b> {t('An API key from Anthropic, OpenAI, Gemini, DeepSeek or OpenCode — or a free local model via Ollama.')}</span></div>
        <div><Icon name="shield" /><span><b>{t('Private by design.')}</b> {t('A strict allowlist decides what leaves; every change needs the user’s yes and can be undone.')}</span></div>
        <div><Icon name="person" /><span><b>{t('Each user decides.')}</b> {t('Turning it on only makes the Coach available; every person consents for themselves.')}</span></div>
      </div>
      <Button variant="primary" icon="sparkles" disabled={busy} onClick={() => patch({ enabled: true })}>{t('Set up the Coach')}</Button>
    </div>
  </div>

  return <div className="card" style={{ borderColor: live ? 'var(--acc)' : undefined }}>
    <div className="row between" style={{ marginBottom: 2 }}>
      <h2 style={{ margin: 0 }}>{t('AI Coach')}</h2>
      <Switch checked={!!d.enabled} disabled={busy} onChange={v => patch({ enabled: v })} />
    </div>
    <div className="adm-status">
      <span className={'adm-pill ' + (live ? 'ok' : 'warn')}>{live ? t('ready') : t('not ready')}</span>
      <span>{status}</span>
    </div>
    {!live && !profile && <div className="adm-progress" aria-hidden="true"><i style={{ width: Math.round(doneCount / flags.length * 100) + '%' }} /></div>}
    <div className="adm-lead">
      {profile ? t('Each profile connects their own account under Settings → AI Coach. Only the key’s owner spends it, and nobody can read it back — not even you.')
        : live ? t('Users find the Coach under Plan → Coach. This switch is the only place it can be turned off for everyone.')
          : t('{0} of {1} steps done — finish the open step and the next one unfolds.', doneCount, flags.length)}
    </div>

    {/* Whose account pays — the one decision that shapes everything below. In profile mode the
        admin never holds a credential: the card only counts how many profiles have connected. */}
    {d.enabled && <>
      <div className="adm-group-t" style={{ marginTop: 14 }}>{t('Whose account pays')}</div>
      <div className="row between" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div className="adm-hint" style={{ margin: 0 }}>
          {profile
            ? <><b>{t('Each profile their own.')}</b> {t('Anyone can connect an Anthropic, OpenAI, Gemini, DeepSeek, OpenCode or compatible-endpoint key from Settings → AI Coach. It is encrypted, only that profile’s runs use it, and no route can read it back — not even yours. Switching back resets the daily limits to the shared-account defaults.')}</>
            : <><b>{t('One account for the whole instance.')}</b> {t('You connect one key below and every profile may use it under the daily limits. Turn this on to let each profile bring their own account instead.')}</>}
        </div>
        <Switch checked={profile} disabled={busy} onChange={v => patch({ authMode: v ? 'profile' : 'instance' })} />
      </div>
    </>}

    {d.enabled && <>
      {/* Instance mode only: the provider, endpoint, credential, model and test wizard. In
          profile mode there is no instance credential to configure, and pretending otherwise
          would be the one thing this mode exists to avoid. */}
      {!profile && <>

      {/* ---------- provider ---------- */}
      <Step n={num()} title={t('Provider')} hint={meta.label || t('Which AI answers the Coach')} done={step1Done} {...stepAt()}>
        <div className="adm-hint">{t('Pick who answers. A key or token you save stays with its provider, so you can switch back and forth without pasting it again.')}</div>
        {groups.map(g => !!g.items.length && <div key={g.title} className="adm-group">
          <div className="adm-group-t">{g.title}</div>
          <div className="adm-chips">
            {g.items.map(p => <button key={p.id} className={'chip' + (p.id === d.provider ? ' on' : '')} disabled={busy}
              onClick={() => { setTestResult(null); patch({ provider: p.id }) }}>
              {p.label}{p.connected && <span className="adm-chip-key">{t('key saved')}</span>}
            </button>)}
          </div>
          <div className="adm-hint" style={{ margin: '6px 0 0' }}>{g.hint}</div>
        </div>)}
      </Step>

      {/* ---------- endpoint (compatible only) ---------- */}
      {needsEndpoint && <Step n={num()} title={t('Endpoint')} hint={d.baseUrl || t('Where the model runs')} done={step2Done} {...stepAt()}>
        <div className="adm-hint">{t('The address of any server that speaks OpenAI’s chat API: Ollama, LM Studio, vLLM, OpenRouter, or a gateway of your own. Just the base — no /v1, no key in the URL.')}</div>
        <div className="adm-field">
          <label>{t('Base URL')}</label>
          <TextField key={d.baseUrl || ''} defaultValue={d.baseUrl || ''} placeholder="http://ollama:11434  or  https://openrouter.ai/api" inputMode="url" autoCapitalize="none" autoCorrect="off"
            onBlur={e => e.target.value !== (d.baseUrl || '') && patch({ baseUrl: e.target.value })} />
        </div>
        <div className="adm-hint" style={{ margin: 0 }}>{t('The host is written to the job log, so you can always see where requests went.')}</div>
      </Step>}

      {/* ---------- credential ---------- */}
      {hasCredentialStep && <Step n={num()} title={t('Credential')} hint={credentialHint(d.auth, meta)} done={step3Done} {...stepAt()}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <CredentialPill auth={d.auth} />
        </div>
        {authState === 'connected' ? <>
          <div className="adm-hint">{t('Connected{0} via {1}{2}. The key is stored encrypted and is never shown again.',
            d.auth.account ? t(' as {0}', d.auth.account) : '',
            credentialLabel(d.auth.type),
            d.auth.connectedAt ? t(' · added {0}', rel(d.auth.connectedAt)) : '')}</div>
          <div className="adm-actions">
            {meta.apiKey && <Button size="sm" variant="tinted" icon="lock" disabled={busy}
              onClick={() => openSheet(close => <ApiKeySheet close={close} onDone={load} label={meta.label} placeholder={meta.keyPlaceholder} optional={meta.keyOptional} />)}>{t('Replace key')}</Button>}
            <Button size="sm" danger disabled={busy} onClick={disconnect}>{t('Remove')}</Button>
          </div>
        </> : <>
          {authState === 'unreadable' && <div className="adm-hint" style={{ color: 'var(--red)' }}>
            {t('The stored credential can’t be decrypted. This usually means ./data was restored without its secret file. Add the key again to fix it.')}
          </div>}
          {authState === 'optional' && <div className="adm-hint">{t('This endpoint works without a key. Add one only if your server asks for it (OpenRouter does; a model on your own network usually does not).')}</div>}
          {authState === 'none' && <div className="adm-hint">{meta.setupToken
            ? t('Paste either a Claude Code setup token (your subscription) or an Anthropic API key (pay per use).')
            : t('Paste an API key from the provider’s console. It is stored encrypted on this server and sent to the provider only while a job runs.')}</div>}
          <div className="adm-actions">
            {meta.setupToken && <Button size="sm" variant="primary" icon="key" disabled={busy}
              onClick={() => openSheet(close => <SetupTokenSheet close={close} onDone={load} label={meta.label} />)}>{t('Add Claude Code token')}</Button>}
            {meta.apiKey && <Button size="sm" variant={meta.setupToken ? undefined : 'primary'} icon="lock" disabled={busy}
              onClick={() => openSheet(close => <ApiKeySheet close={close} onDone={load} label={meta.label} placeholder={meta.keyPlaceholder} optional={meta.keyOptional} />)}>
              {meta.keyOptional ? t('Add API key (optional)') : t('Add API key')}</Button>}
          </div>
        </>}
      </Step>}

      {/* ---------- model ---------- */}
      <Step n={num()} title={t('Model')} hint={d.model || (meta.defaultModel ? t('default: {0}', meta.defaultModel) : t('not chosen yet'))} done={step4Done} {...stepAt()}>
        <div className="adm-hint">{meta.http
          ? t('Which model the provider should use. "List models" asks the provider for its current list, so nothing here goes stale.')
          : t('Optional. Leave it empty to use the runtime’s own default.')}</div>
        <div className="adm-field">
          <label>{t('Model')}</label>
          {models && models.length
            ? <select className="adm-select" value={models.includes(d.model) ? d.model : ''} disabled={busy} onChange={e => patch({ model: e.target.value })}>
              <option value="">{meta.defaultModel ? t('Default ({0})', meta.defaultModel) : t('Pick a model…')}</option>
              {d.model && !models.includes(d.model) && <option value={d.model}>{t('{0} (not in the list)', d.model)}</option>}
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            : <TextField key={d.provider} defaultValue={d.models?.[d.provider] || ''} placeholder={meta.defaultModel ? t('Default: {0}', meta.defaultModel) : needsEndpoint ? t('e.g. qwen2.5:3b — or press "List models"') : t('(runtime default)')}
              onBlur={e => e.target.value !== (d.models?.[d.provider] || '') && patch({ model: e.target.value })} />}
        </div>
        {meta.http && <div className="adm-actions">
          <Button size="sm" variant="tinted" icon="reset" disabled={busy} onClick={loadModels}>{models ? t('Refresh list') : t('List models')}</Button>
          {models && models.length ? <span className="dim small" style={{ alignSelf: 'center' }}>{t('{0} served by the provider', models.length)}</span> : null}
        </div>}
      </Step>

      {/* ---------- test ---------- */}
      <Step n={num()} title={t('Test')} hint={step5Done ? t('passed') : t('one real round trip, no user data')} done={step5Done} {...stepAt()} forceOpen={!!testResult}>
        <div className="adm-hint">{t('Sends one tiny question to the provider and checks the answer. No training data is involved. Do this after every change above.')}</div>
        <div className="adm-actions">
          <Button size="sm" variant="primary" icon="check" disabled={busy || !authed || !hasEndpoint} onClick={test}>{t('Test the Coach')}</Button>
        </div>
        {(!authed || !hasEndpoint) && <div className="adm-hint" style={{ margin: '6px 0 0' }}>
          {!hasEndpoint ? t('Finish the Endpoint step first.') : t('Finish the Credential step first.')}
        </div>}
        {testResult && <div className={'adm-result ' + (testResult.pending ? '' : testResult.ok ? 'ok' : 'bad')}>
          {testResult.pending ? t('Asking the provider…')
            : testResult.ok ? <><b>{t('Passed')}</b>{testResult.version ? t('Provider: {0}', testResult.version) : t('The provider answered as expected.')}</>
              : <><b>{t('Failed')}</b>{testResult.error || t('No answer from the provider.')}</>}
        </div>}
        <div className="adm-kv" style={{ marginTop: 10 }}>
          <span className="k">{t('Runtime')}</span>
          <span className="v">{d.runtime.ok ? <span className="adm-pill ok">{t('ready')}</span> : <span className="adm-pill bad">{t('missing')}</span>}{d.runtime.version ? <div className="dim small">{d.runtime.version}</div> : null}{!d.runtime.ok && d.runtime.error ? <div className="small" style={{ color: 'var(--red)' }}>{d.runtime.error}</div> : null}</span>
        </div>
      </Step>
      </>}

      {/* ---------- profile mode: no instance credential, only a count ---------- */}
      {profile && <div style={{ marginTop: 14 }}>
        <div className="adm-group-t">{t('How profiles connect')}</div>
        <div className="adm-hint">{t('Each profile connects from Settings → AI Coach — or from the Coach itself, which offers the account screen on first open. Anthropic, OpenAI, Gemini, DeepSeek, OpenCode and any OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter, a gateway) are supported, and each profile picks its own; two people can run two different providers side by side.')}</div>
        <div className="adm-kv" style={{ marginTop: 10 }}>
          <span className="k">{t('Profiles connected')}</span>
          <span className="v">{t('{0} of {1}', d.profiles?.connected || 0, d.profiles?.total || 0)}</span>
        </div>
        <div className="adm-actions" style={{ marginTop: 10 }}>
          <Button size="sm" variant="tinted" icon="key" disabled={busy} onClick={() => nav('/coach/account')}>{t('Open my AI account')}</Button>
        </div>
        <div className="adm-hint" style={{ margin: '8px 0 0' }}>{t('Counts only. What each person asked the Coach, and the keys they filed, never appear here — a profile key is stored encrypted and no route reads it back.')}</div>
      </div>}

      {/* ---------- advanced ---------- */}
      <details className="adm-fold">
        <summary>{t('Advanced')} <Icon name="chevronRight" className="chev" /></summary>
        <div className="adm-fold-b">
          <div className="adm-group-t">{t('Limits')}</div>
          <div className="adm-hint">{profile
            ? t('With each profile on their own account there is nothing of yours to bound, so both limits start at 0 (no limit). Set one anyway if you want to cap how much the group can run in a day.')
            : t('How many Coach runs are allowed per day. Every run is one request on the provider account above. 0 means no limit.')}</div>
          <div className="adm-kv"><span className="k">{t('Per user, per day')}</span>
            <span className="v"><input className="num" type="number" min="0" max="200" defaultValue={d.caps.perProfileDaily} disabled={busy}
              onBlur={e => +e.target.value !== d.caps.perProfileDaily && patch({ caps: { ...d.caps, perProfileDaily: +e.target.value } })} /></span></div>
          <div className="adm-kv"><span className="k">{t('Whole instance, per day')}</span>
            <span className="v"><input className="num" type="number" min="0" max="5000" defaultValue={d.caps.instanceDaily} disabled={busy}
              onBlur={e => +e.target.value !== d.caps.instanceDaily && patch({ caps: { ...d.caps, instanceDaily: +e.target.value } })} /></span></div>

          <div className="adm-group-t" style={{ marginTop: 14 }}>{t('Compare with others')}</div>
          <div className="row between" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="adm-hint" style={{ margin: 0 }}>
              <b>{t('Let people compare with each other.')}</b> {t('Anonymous medians (estimated 1RM, sessions per week) across profiles that opt in; at least three must share before anyone sees a number. Each person switches themselves on in the Coach chat, and sees nothing unless they do.')}
            </div>
            <Switch checked={!!d.community} disabled={busy} onChange={v => patch({ community: v })} />
          </div>

          <div className="adm-group-t" style={{ marginTop: 14 }}>{t('Isolation')}</div>
          <div className="adm-hint">{profile
            ? t('Each profile calls its provider over HTTPS with its own key; no program runs on this server for a job.')
            : d.unprivileged && !d.unprivileged.ok
              ? <span style={{ color: 'var(--red)' }}>{t('Jobs are blocked: {0}. Nothing runs until this is fixed.', d.unprivileged.why)}</span>
              : d.unprivileged?.dropped
                ? t('Jobs run as a separate unprivileged user that cannot read your data directory or secrets.')
                : d.unprivileged?.why?.includes('no child process')
                  ? t('Not needed for this provider — it makes an HTTPS request and starts no program on this server.')
                  : t('Jobs run with the server’s own user on this host (no separate user to drop to).')}</div>
        </div>
      </details>

      {/* ---------- activity ---------- */}
      <details className="adm-fold">
        <summary>{t('Activity')} <Icon name="chevronRight" className="chev" /></summary>
        <div className="adm-fold-b">
          <div className="tiles" style={{ textAlign: 'left', marginBottom: 10 }}>
            <div className="tile"><div className="l">{t('Jobs today')}</div><div className="v" style={{ fontSize: '1.1rem' }}>{d.jobsToday}</div></div>
            <div className="tile"><div className="l">{t('Last success')}</div><div className="v" style={{ fontSize: '.85rem' }}>{rel(d.lastSuccess?.at)}</div></div>
          </div>
          {d.lastError && <>
            <div className="adm-group-t">{t('Last failure')}</div>
            <div className="adm-result bad" style={{ marginTop: 0, marginBottom: 10 }}>
              <b>{failureTitle(d.lastError.errorClass)}</b>
              {d.lastError.detail ? <span className="small">{d.lastError.detail}</span> : null}
              <div className="dim" style={{ fontSize: '.72rem', marginTop: 4 }}>{rel(d.lastError.at)}</div>
            </div>
          </>}
          <div className="adm-group-t">{t('Recent jobs')}</div>
          {d.recent?.length ? <div className="adm-log">
            {d.recent.slice(0, 10).map((e, i) => <div key={i} className="adm-log-row">
              <span>{e.kind === 'create' ? t('Plan') : t('Review job')}{e.trigger === 'scheduled' ? t(' · scheduled') : ''} · <span style={{ color: e.outcome === 'failed' ? 'var(--red)' : e.outcome === 'ready' ? 'var(--acc)' : 'var(--label-2)' }}>{e.outcome}</span>{e.ms ? t(' · {0} s', Math.round(e.ms / 1000)) : ''}</span>
              <span className="when">{rel(e.at)}</span>
            </div>)}
          </div> : <div className="adm-empty">{t('No jobs yet.')}</div>}
          <div className="adm-hint" style={{ margin: '8px 0 0' }}>{t('Counts and outcomes only. What people asked the Coach, and what it answered, is never shown here.')}</div>
        </div>
      </details>
    </>}
  </div>
}

/* ---------------------------------- pieces ---------------------------------- */

function Step({ n, title, hint, done, open, forceOpen, children }) {
  // `key` remounts the <details> when the wizard advances, so the next step unfolds itself.
  return <details className={'adm-step ' + (done ? 'done' : 'todo')} open={open || forceOpen}>
    <summary>
      <span className="adm-num">{done ? <Icon name="check" /> : n}</span>
      <span className="adm-step-t"><b>{title}</b><span>{hint}</span></span>
      <Icon name="chevronRight" className="chev" />
    </summary>
    <div className="adm-step-b">{children}</div>
  </details>
}

function CredentialPill({ auth }) {
  const s = auth?.state
  if (s === 'connected') return <span className="adm-pill ok">{t('connected')}{auth.account ? ' · ' + auth.account : ''}</span>
  if (s === 'not-required') return <span className="adm-pill">{t('not needed')}</span>
  if (s === 'optional') return <span className="adm-pill">{t('optional — none saved')}</span>
  if (s === 'unreadable') return <span className="adm-pill bad">{t('can’t be read')}</span>
  return <span className="adm-pill warn">{t('needed')}</span>
}

const credentialHint = (auth, meta) => {
  const s = auth?.state
  if (s === 'connected') return t('Connected{0}', auth.account ? t(' as {0}', auth.account) : '')
  if (s === 'not-required') return t('Not needed')
  if (s === 'optional') return t('Optional for this endpoint')
  if (s === 'unreadable') return t('Stored key can’t be read — add it again')
  return meta.setupToken ? t('Token or API key needed') : t('API key needed')
}

const credentialLabel = type => ({
  'cli-token': t('Claude Code setup token'), 'chatgpt-cli': t('ChatGPT CLI login'), oauth: t('legacy token'), apikey: t('API key')
}[type] || t('credential'))

// The failure classes jobs.js emits, in words an operator can act on.
const failureTitle = cls => ({
  timeout: t('The provider took longer than the job budget (COACH_JOB_TIMEOUT_MS, default 5 minutes)'),
  missing: t('The provider runtime or key is missing'),
  auth: t('The provider rejected the credential'),
  provider: t('The provider returned an error'),
  unusable: t('The model answered, but not in a shape the app could use'),
  restart: t('The server restarted while a job was running'),
  nostate: t('The user’s training data could not be read'),
  off: t('The Coach was off when the job ran'),
  internal: t('Something went wrong on the server')
}[cls] || cls || t('Failed'))

/* ------------------------------- setup token -------------------------------- */

function SetupTokenSheet({ close, onDone, label }) {
  const toast = useUI(s => s.toast)
  const [token, setToken] = useState('')
  // Which account this token belongs to. Optional, and stored as a plain label — it is what the
  // admin card and the user's Coach screen both show when they name whose account is spent.
  const [account, setAccount] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/coach/connect', { method: 'POST', body: JSON.stringify({ type: 'cli-token', token: token.trim(), account: account.trim() }) })
      setToken('')
      toast(r.test?.ok ? t('Connected ✅') : t('Token saved'))
      close(); onDone()
    } catch (e) { toast(e.message); setBusy(false) }
  }

  return <>
    <h3>{t('Connect {0}', label)}</h3>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      {t('On a trusted computer where you use Claude Code, run claude setup-token, complete its normal browser sign-in, then paste the token it prints here. This app never opens or handles Claude’s authorization flow.')}
    </div>
    <TextField value={token} autoFocus type="password" placeholder={t('paste setup token')} onChange={e => setToken(e.target.value)} />
    <div style={{ height: 8 }} />
    <TextField value={account} placeholder={t('whose account is this? (e.g. you@example.com)')} onChange={e => setAccount(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy || !token.trim()} onClick={save}>{t('Save token')}</Button>
    <div style={{ height: 8 }} />
  </>
}

function ApiKeySheet({ close, onDone, label, placeholder, optional }) {
  const toast = useUI(s => s.toast)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const r = await api('/api/admin/coach/connect', { method: 'POST', body: JSON.stringify({ type: 'apikey', token: key.trim() }) })
      toast(r.test?.ok ? t('Key saved ✅') : t('Key saved'))
      close(); onDone()
    } catch (e) { toast(e.message); setBusy(false) }
  }
  return <>
    <h3>{t('{0} API key', label)}</h3>
    <div className="muted small" style={{ lineHeight: 1.5, marginBottom: 12 }}>
      {t('Stored encrypted on this server and sent to the provider only while a job runs. It is never shown again and never leaves the server')}{optional ? t(' — and for an endpoint that takes no key, you can leave this empty and close the sheet.') : '.'}
    </div>
    <TextField value={key} autoFocus type="password" placeholder={placeholder || 'sk-…'} autoCapitalize="none" autoCorrect="off" onChange={e => setKey(e.target.value)} />
    <div style={{ height: 12 }} />
    <Button variant="primary" disabled={busy || !key.trim()} onClick={save}>{t('Save key')}</Button>
    <div style={{ height: 8 }} />
  </>
}
