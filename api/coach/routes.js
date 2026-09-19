/* HTTP surface for the Coach — user routes and admin routes.
 *
 * Written as a factory taking server.js's own helpers rather than importing them: the helpers
 * are closures over the db and the session secret, and passing them in keeps this module free
 * of a cycle (and trivially testable against fakes).
 */
import * as cfgStore from './config.js';
import * as jobs from './jobs.js';
import { computeCohort } from './cohort.js';
import { adapterFor } from './adapters/index.js';
import { canDropPrivileges } from './adapters/spawn.js';
import { DATA_CATEGORIES } from './core/payload.js';
import { nextTrainingDay } from './core/plan-read.js';
import { validateBaseUrl, baseUrlFor, effortsFor } from './core/providers.js';

// Job failures the user sees, in the app's own voice. The raw provider detail never reaches
// them — it goes to the admin card, which is where someone can act on it (FR-47).
const USER_ERROR = {
  off: 'the Coach is not set up on this instance',
  busy: 'the Coach is already thinking about your training',
  cap: 'the Coach is resting — try again tomorrow',
  consent: 'the Coach needs your go-ahead first',
  // Profile mode, no credential of your own: the one thing that resolves it is connecting one,
  // so the message says that rather than blaming the instance.
  connect: 'connect your own AI account under Settings → AI Coach',
  // Verbatim, because it tells the user the one thing that resolves it and names who resolves
  // it. A vaguer message here turns into a support question for the person running the box.
  shared: cfgStore.SHARED_ACCOUNT_REFUSAL,
  unprivileged: 'the Coach is switched off on this instance for safety reasons',
  // `loads` with no routine left to estimate for: a brand-new profile, or a plan whose
  // exercises were all removed. Nothing has gone wrong; there is just nothing to answer about.
  noplan: 'there is no routine to estimate loads for yet — build a plan first'
};
const HTTP_FOR = { off: 503, busy: 409, cap: 429, consent: 403, connect: 409, shared: 409, unprivileged: 503, noplan: 400 };

export function coachRoutes({ json, readBody, readSession, requireAdmin }) {
  /** Every user route starts the same way: signed in, feature on, feature reachable. */
  const guard = (req, res) => {
    const user = readSession(req);
    if (!user) { json(res, 401, { error: 'not signed in' }); return null; }
    if (!cfgStore.isEnabled() || !cfgStore.isConnected()) { json(res, 503, { error: USER_ERROR.off }); return null; }
    return user;
  };
  const failEnqueue = (res, e) => {
    if (e instanceof jobs.CoachError) return json(res, HTTP_FOR[e.code] || 400, { error: USER_ERROR[e.code] || e.message, code: e.code });
    throw e;
  };

  return {
    /* ------------------------------ user ------------------------------ */

    // What the consent screen has to disclose, straight from the module that builds payloads,
    // so the screen cannot drift from what actually leaves (FR-09). Signed in only: the screen
    // that reads it sits behind a session anyway, and on an invite-only instance which provider
    // this box is wired to is nobody's business who has not been let in.
    'GET /api/coach/disclosure': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const cfg = cfgStore.load();
      // In profile mode the provider is the one this person connected; before they connect,
      // there is genuinely nobody to name yet — the UI says "your provider" rather than
      // borrowing the instance's leftover choice.
      const c = cfgStore.credentialFor(user.id);
      const provider = c.ok || cfg.authMode !== 'profile' ? (c.provider || cfg.provider) : null;
      json(res, 200, {
        provider,
        providerLabel: provider ? (cfgStore.PROVIDERS[provider] || {}).label || null : null,
        categories: DATA_CATEGORIES,
        version: 1
      });
    },

    'GET /api/coach/status': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      json(res, 200, jobs.status(user.id));
    },

    'POST /api/coach/plan': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const job = jobs.enqueue(user.id, {
          kind: 'create',
          intake: body.intake || null,
          refine: body.refine ? String(body.refine).slice(0, 1000) : null
        });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    'POST /api/coach/review': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const job = jobs.enqueue(user.id, { kind: 'review', note: body.note ? String(body.note).slice(0, 1000) : null });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    // One workout, read closely. Nothing to apply — the card is kept in the user's log.
    'POST /api/coach/debrief': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const job = jobs.enqueue(user.id, { kind: 'debrief', workoutId: body.workoutId ? String(body.workoutId).slice(0, 40) : null });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    /* A question, answered from the smallest context that can answer it. Nothing to apply:
       the answer is kept in the log like a debrief. `exId` focuses it on one exercise when the
       question is about one, and is simply ignored if it resolves to nothing. */
    'POST /api/coach/ask': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const job = jobs.enqueue(user.id, {
          kind: 'ask',
          question: body.question ? String(body.question).slice(0, 1000) : null,
          exId: body.exId ? String(body.exId).slice(0, 40) : null
        });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    /* Working weights for the next time the target routine is trained. The job resolves the
       day itself (the same week reader the app uses) and the proposal carries that date; the
       client keeps it for that one session and only after the lifter confirms it. */
    'POST /api/coach/loads': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      try {
        const routineIds = Array.isArray(body.routineIds)
          ? body.routineIds.slice(0, 7).map(id => String(id).slice(0, 40))
          : null;
        // The device's calendar day, when it sent one: the container may sit in a different
        // timezone, and "tomorrow's session" must not skip a day because of that.
        const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : null;
        // Checked before queueing, not only when the job runs: enqueueing spends a daily run,
        // and a plan with no trainable routine can never answer — so there is nothing to spend
        // it on. The job checks again for a plan edited between the two.
        if (!nextTrainingDay(jobs.readState(user.id) || {}, today || new Date().toISOString().slice(0, 10), { routineIds })) {
          return json(res, 400, { error: USER_ERROR.noplan, code: 'noplan' });
        }
        const job = jobs.enqueue(user.id, { kind: 'loads', routineIds, today });
        json(res, 202, { job });
      } catch (e) { failEnqueue(res, e); }
    },

    /* How this profile sits against everyone else on the instance who opted in: medians only,
       at least three people, and nothing for a profile that does not share itself. */
    'GET /api/coach/cohort': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      if (!cfgStore.load().community) return json(res, 200, { ok: false, enabled: false });
      json(res, 200, computeCohort(user.id));
    },
    'POST /api/coach/cohort/share': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      json(res, 200, { ok: true, sharing: jobs.setShare(user.id, !!body.share) });
    },

    'POST /api/coach/pending/resolve': async (req, res) => {
      const user = guard(req, res); if (!user) return;
      const body = await readBody(req);
      json(res, 200, jobs.resolvePending(user.id, {
        accepted: Array.isArray(body.accepted) ? body.accepted : [],
        rejected: Array.isArray(body.rejected) ? body.rejected : [],
        dismissed: !!body.dismissed
      }));
    },

    // Consent withdrawn, or the profile turned the Coach off: drop everything held server-side
    // for them at once, without waiting for a sync to carry the news (D5).
    'POST /api/coach/forget': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      jobs.clearUser(user.id);
      json(res, 200, { ok: true });
    },

    /* ---------------- profile mode: each profile its own account ----------------
       Three routes, one owner: everything below acts on the signed-in profile's record and
       nothing else. Nobody can read back a token, not even the admin, and no route takes a
       profile id — the session is the id. */

    /* What the "my AI account" screen needs: the mode, whether this profile is connected, and
       the provider table to choose from. Signed in only, and only while the feature is on —
       filing a credential for a Coach nobody can run would just be storing a secret for nothing. */
    'GET /api/coach/setup': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (!cfgStore.isEnabled()) return json(res, 503, { error: USER_ERROR.off });
      const cfg = cfgStore.load();
      const c = cfgStore.credentialFor(user.id);
      json(res, 200, {
        authMode: cfg.authMode,
        canConnect: cfg.authMode === 'profile',
        connected: !!c.ok,
        provider: c.provider || null,
        providerLabel: c.provider ? ((cfgStore.PROVIDERS[c.provider] || {}).label || null) : null,
        model: c.model || null,
        effort: c.effort || null,
        baseUrl: c.baseUrl || null,
        account: c.ok ? (c.account || null) : null,
        providers: cfgStore.PROFILE_PROVIDERS.map(id => {
          const p = cfgStore.PROVIDERS[id];
          return {
            id, label: p.label, keyPlaceholder: p.keyPlaceholder || null, baseUrl: !!p.baseUrl, keyOptional: !!p.keyOptional, defaultModel: p.defaultModel || null,
            // Which models take an effort, and which values it accepts (absent for providers
            // with no such control at all; `effortsByModel` covers the multi-vendor gateways).
            efforts: p.efforts || null, defaultEffort: p.defaultEffort || null, effortsForModels: p.effortsForModels || null, effortsByModel: p.effortsByModel || null
          };
        })
      });
    },

    /* The models an endpoint serves, listed with the key on its way in (or the one already
       filed): the round trip that doubles as the "does this key work" answer, before anything
       is stored. Plain-HTTPS providers only — a runtime provider has no such endpoint. */
    'POST /api/coach/credential/models': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (!cfgStore.isEnabled()) return json(res, 503, { error: USER_ERROR.off });
      const cfg = cfgStore.load();
      if (cfg.authMode !== 'profile') return json(res, 400, { error: 'this instance uses a shared account' });
      const body = await readBody(req);
      const id = String(body.provider || '');
      const meta = cfgStore.PROVIDERS[id];
      if (!meta || !meta.http) return json(res, 400, { error: 'unknown provider' });
      const v = meta.baseUrl ? validateBaseUrl(body.baseUrl) : { ok: true, value: null };
      if (!v.ok) return json(res, 400, { error: v.error });
      if (meta.baseUrl && !v.value) return json(res, 400, { error: 'this provider needs an endpoint' });
      const stored = cfgStore.credentialFor(user.id);
      const key = String(body.key || '').trim() || (stored.ok && stored.provider === id && stored.auth ? stored.auth.token : null);
      if (!key && !meta.keyOptional) return json(res, 400, { error: 'no API key supplied' });
      const jobCfg = {
        ...cfg, provider: id,
        providerOptions: { ...(cfg.providerOptions || {}), [id]: { ...((cfg.providerOptions || {})[id] || {}), ...(v.value ? { baseUrl: v.value } : {}) } }
      };
      const env = cfgStore.jobEnv(process.env.TMPDIR || '/tmp', { provider: id, type: 'apikey', auth: key ? { token: key } : null });
      json(res, 200, await adapterFor(id).models(jobCfg, env));
    },

    /* File this profile's own account. The token goes up once and is never read back: it leaves
       again only as the provider variable on this profile's own jobs. The provider, model and
       endpoint are filed with it — that is what lets the next profile choose different ones. */
    'POST /api/coach/credential': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      if (!cfgStore.isEnabled()) return json(res, 503, { error: USER_ERROR.off });
      const cfg = cfgStore.load();
      if (cfg.authMode !== 'profile') return json(res, 400, { error: 'this instance uses a shared account' });
      const body = await readBody(req);
      const id = String(body.provider || '');
      const meta = cfgStore.PROVIDERS[id];
      if (!meta || !meta.http) return json(res, 400, { error: 'unknown provider' });
      const v = meta.baseUrl ? validateBaseUrl(body.baseUrl) : { ok: true, value: null };
      if (!v.ok) return json(res, 400, { error: v.error });
      if (meta.baseUrl && !v.value) return json(res, 400, { error: 'this provider needs an endpoint' });
      const token = String(body.key || '').trim();
      const prev = cfgStore.loadProfileAuth(user.id);
      const keep = prev && prev.provider === id && prev.data;
      if (!token && !meta.keyOptional && !keep) return json(res, 400, { error: 'no API key supplied' });
      // An effort that this provider and model do not take is refused rather than stored and
      // silently ignored: the screen can only offer what the model accepts, so anything else
      // is a client that skipped the check.
      let effort;
      if (body.effort !== undefined) {
        effort = body.effort ? String(body.effort) : null;
        const allowed = effort ? effortsFor(id, body.model ? String(body.model) : null) : [];
        if (effort && !allowed.includes(effort)) return json(res, 400, { error: 'this model does not take that effort' });
      }
      cfgStore.saveProfileAccount(user.id, { provider: id, token, model: body.model ? String(body.model) : null, effort, baseUrl: v.value, account: body.account });
      json(res, 200, { ok: true, account: cfgStore.accountFor(user.id) });
    },

    /* Replacing one provider with another, or leaving the Coach: the profile's own record is
       the only thing this removes. A job already queued resolves its credential at run time
       and fails with `connect`, which is the honest answer. */
    'POST /api/coach/credential/remove': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      const cfg = cfgStore.load();
      if (cfg.authMode !== 'profile') return json(res, 400, { error: 'this instance uses a shared account' });
      cfgStore.clearProfileAuth(user.id);
      json(res, 200, { ok: true });
    },

    /* ------------------------------ admin ------------------------------ */

    'GET /api/admin/coach': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const cfg = cfgStore.load();
      const profile = cfg.authMode === 'profile';
      const adapter = profile ? null : adapterFor(cfg.provider);
      // For the runtime-backed providers this asks "is the runtime there"; for an HTTPS one it
      // lists the models with the stored key, which is the round trip the card wants anyway.
      // In profile mode there is no instance credential, so there is nothing to ask with — the
      // card says so rather than showing a failure that sounds like the instance is broken.
      const cred = !profile && adapter?.spawns === false ? cfgStore.credentialFor(cfgStore.boundUidFor(cfg)) : undefined;
      const check = profile ? { ok: true, perProfile: true }
        : adapter ? await adapter.check(cfg, cfgStore.jobEnv(process.env.TMPDIR || '/tmp', cred?.ok ? cred : undefined))
          : { ok: false, error: 'unknown provider' };
      const log = cfg.log || [];
      const today = new Date().toISOString().slice(0, 10);
      json(res, 200, {
        disabledByEnv: cfgStore.COACH_DISABLED,
        enabled: !!cfg.enabled,
        provider: profile ? null : cfg.provider,
        providers: Object.entries(cfgStore.PROVIDERS).map(([id, p]) => ({
          id, label: p.label, runtime: p.runtime,
          setupToken: !!p.setupToken, deviceLogin: !!p.deviceLogin, apiKey: !!p.apiKeyEnv,
          http: !!p.http, baseUrl: !!p.baseUrl, keyOptional: !!p.keyOptional, keyPlaceholder: p.keyPlaceholder || null,
          defaultModel: p.defaultModel || null,
          efforts: p.efforts || null, defaultEffort: p.defaultEffort || null, effortsForModels: p.effortsForModels || null, effortsByModel: p.effortsByModel || null,
          // Which providers already hold a key — so switching chips is visibly not a reset.
          connected: !!(cfgStore.authFor(cfg, id) && cfgStore.authFor(cfg, id).data)
        })),
        model: profile ? null : cfgStore.modelFor(cfg),
        effort: profile ? null : cfgStore.effortFor(cfg),
        models: cfg.models,
        baseUrl: !profile && cfgStore.providerMeta(cfg).http ? baseUrlFor(cfg.provider, cfg) : null,
        knownModels: profile ? null : (check.models || null),
        caps: cfg.caps,
        community: !!cfg.community,
        runtime: profile
          ? { ok: true, perProfile: true, version: null, error: null, needsKey: false }
          : { ok: !!check.ok, version: check.version || null, error: check.error || null, needsKey: !!check.needsKey },
        authMode: cfg.authMode,
        boundUid: cfgStore.boundUidFor(cfg),
        /* Whether a credential is filed, and whose — never the credential. `unreadable` is its
           own state rather than "not connected" because it has a specific cause and a specific
           fix: ./data was restored without its `secret`, so the blob is intact and undecryptable,
           and connecting again is the way out. In profile mode there is no instance credential
           at all: each profile's own state lives on its screen, and the card gets counts. */
        auth: profile ? { state: 'per-profile' } : (() => {
          const meta = cfgStore.providerMeta(cfg);
          const rec = cfgStore.authFor(cfg);
          if (!meta.oauthEnv && !meta.apiKeyEnv) return { state: 'not-required' };
          if (!rec || !rec.data) return { state: meta.keyOptional ? 'optional' : 'none' };
          if (!cfgStore.decrypt(rec.data)) return { state: 'unreadable' };
          return { state: 'connected', type: rec.type || null, account: rec.account || null, connectedAt: rec.connectedAt || null };
        })(),
        profiles: cfgStore.profileSummary(),
        // Whether the privilege drop can actually be performed. Surfaced because the control
        // now fails closed: if this reads false, no job runs, and the admin needs to know that
        // from the card rather than from a user reporting that nothing happens. An HTTPS
        // provider has no process to drop, and the card must not show a red banner for it.
        unprivileged: profile
          ? { ok: true, dropped: false, why: 'each profile runs over HTTPS' }
          : adapter?.spawns === false
            ? { ok: true, dropped: false, why: 'this provider runs no child process' }
            : canDropPrivileges(),
        // Counts and outcomes only — never intake answers, payloads or proposals (FR-12/A4).
        // The same counter the instance cap reads, so the card and the cap cannot disagree.
        jobsToday: cfg.daily?.date === today ? cfg.daily.count : 0,
        lastSuccess: cfgStore.lastSuccess(),
        lastError: cfgStore.lastError(),
        recent: log.slice(-20).reverse().map(e => ({ at: e.at, kind: e.kind, trigger: e.trigger, outcome: e.outcome, errorClass: e.errorClass, ms: e.ms }))
      });
    },

    'POST /api/admin/coach/config': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const patch = {};
      if (body.enabled !== undefined) patch.enabled = !!body.enabled;
      const current = cfgStore.load();
      if (body.authMode !== undefined) {
        const mode = body.authMode === 'profile' ? 'profile' : 'instance';
        // Switching modes resets the daily caps to that mode's defaults, because "10/day" means
        // two different things: in instance mode it bounds what one profile can spend of the
        // owner's account; in profile mode everybody pays their own, and 0 (no limit) is the
        // starting point. The card renders the new values, so the reset is visible, not silent.
        if (mode !== current.authMode) {
          patch.authMode = mode;
          patch.caps = mode === 'profile' ? { perProfileDaily: 0, instanceDaily: 0 } : { perProfileDaily: 10, instanceDaily: 0 };
        }
      }
      if (body.provider !== undefined) {
        if (!cfgStore.PROVIDERS[body.provider]) return json(res, 400, { error: 'unknown provider' });
        // Credentials, model and endpoint are all keyed by provider — switching never drops them.
        patch.provider = body.provider;
      }
      const target = patch.provider || current.provider;
      if (body.model !== undefined) {
        patch.models = { ...current.models };
        if (body.model) patch.models[target] = String(body.model).slice(0, 80); else delete patch.models[target];
      }
      if (body.effort !== undefined) {
        const model = body.model !== undefined ? (body.model ? String(body.model) : null) : cfgStore.modelFor(current, target);
        const allowed = body.effort ? effortsFor(target, model) : [];
        if (body.effort && !allowed.includes(String(body.effort))) return json(res, 400, { error: 'this model does not take that effort' });
        patch.efforts = { ...current.efforts };
        if (body.effort) patch.efforts[target] = String(body.effort); else delete patch.efforts[target];
      }
      if (body.baseUrl !== undefined) {
        if (!cfgStore.PROVIDERS[target].baseUrl) return json(res, 400, { error: `${target} has a fixed endpoint` });
        const v = validateBaseUrl(body.baseUrl);
        if (!v.ok) return json(res, 400, { error: v.error });
        patch.providerOptions = { ...current.providerOptions, [target]: { ...(current.providerOptions[target] || {}), baseUrl: v.value } };
      }
      if (body.community !== undefined) patch.community = !!body.community;
      if (body.caps) {
        patch.caps = {
          perProfileDaily: Math.max(0, Math.min(200, +body.caps.perProfileDaily || 0)),
          instanceDaily: Math.max(0, Math.min(5000, +body.caps.instanceDaily || 0))
        };
      }
      cfgStore.save(patch);
      json(res, 200, { ok: true });
    },

    'POST /api/admin/coach/test': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const r = await jobs.testRun();
      json(res, 200, r);
    },

    /* The models the configured endpoint serves, so the card can offer a list rather than a
       text field that goes stale with every model release. HTTPS providers only. */
    'POST /api/admin/coach/models': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const cfg = cfgStore.load();
      const adapter = adapterFor(cfg.provider);
      if (!adapter || typeof adapter.models !== 'function') return json(res, 200, { ok: false, error: 'this provider does not list models', models: [] });
      const cred = cfgStore.credentialFor(cfgStore.boundUidFor(cfg));
      const env = cfgStore.jobEnv(process.env.TMPDIR || '/tmp', cred.ok ? cred : undefined);
      json(res, 200, await adapter.models(cfg, env));
    },

    /* Connect the instance credential. Deferred while the fixture was the only provider — it
       has none, so there was nothing to connect. The real providers give it something to hold,
       which is the condition this route was waiting on.

       The token is accepted once and never read back: it is encrypted here and leaves again
       only as an environment variable on a job's child process. `type` has to match a variable
       the configured provider actually declares, so a Codex key cannot be filed under Claude
       and then silently go nowhere at job time. */
    'POST /api/admin/coach/connect': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const cfg = cfgStore.load();
      // A key may be filed for a provider that is not the active one, so the chips can be
      // prepared ahead of switching; by default it is the active provider's.
      const provider = body.provider !== undefined ? String(body.provider) : cfg.provider;
      if (!cfgStore.PROVIDERS[provider]) return json(res, 400, { error: 'unknown provider' });
      const meta = cfgStore.PROVIDERS[provider];
      const type = String(body.type || '');
      const envVar = (type === 'cli-token' || type === 'oauth') ? meta.oauthEnv
        : type === 'apikey' ? meta.apiKeyEnv : null;
      if (!envVar) {
        return json(res, 400, { error: `${provider} does not take a credential of type "${type}"` });
      }
      const token = String(body.token || '').trim();
      if (!token) return json(res, 400, { error: 'no token supplied' });
      cfgStore.saveAuth(provider, {
        type, account: String(body.account || '').slice(0, 120), data: cfgStore.encrypt({ token }), connectedAt: new Date().toISOString()
      });
      json(res, 200, { ok: true });
    },

    'POST /api/admin/coach/disconnect': async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const body = await readBody(req);
      const provider = body.provider !== undefined ? String(body.provider) : cfgStore.load().provider;
      if (!cfgStore.PROVIDERS[provider]) return json(res, 400, { error: 'unknown provider' });
      cfgStore.saveAuth(provider, null);
      json(res, 200, { ok: true });
    },

    /* Still absent: `authMode`, and with it the per-profile credential routes. Instance mode is
       the whole of what these two routes serve, and per-profile needs its own connect/clear pair
       against saveProfileAuth/clearProfileAuth — a switch with nothing on the other side is worse
       than no switch, so it waits for the PR that builds that side. */

    /* Whose account this profile is about to spend. Its own route because both the Coach screen
       and the admin card must state it, and neither should be inferring it from settings. */
    'GET /api/coach/account': async (req, res) => {
      const user = readSession(req);
      if (!user) return json(res, 401, { error: 'not signed in' });
      json(res, 200, cfgStore.accountFor(user.id));
    }
  };
}
