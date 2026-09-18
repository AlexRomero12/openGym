/* Profile mode: each profile its own provider, its own key, its own bill.
 *
 * The promise this file pins: two profiles on the same server can run two different providers,
 * and no route — not even the admin's — can read a profile's key back. Instance mode keeps its
 * own refusals (see credential.test.js); here the interesting failures are the ones where the
 * instance *must not* decide for the profile: an unconnected profile is told to connect rather
 * than that the Coach is off, and a runtime-backed provider is not a thing a profile can choose.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { tempData, sampleState, writeState } from './helpers.mjs';

const dir = tempData();
const cfg = await import('../coach/config.js');
const { coachRoutes } = await import('../coach/routes.js');
const jobs = await import('../coach/jobs.js');

const UIDS = ['alice', 'bob', 'carol'];
const clearAll = () => UIDS.forEach(u => cfg.clearProfileAuth(u));
// Every test starts from an empty coach.json AND an empty profile shelf: save() merges over
// what is on disk, and a credential filed by the previous test would otherwise still be there.
const fresh = (patch = {}) => {
  cfg.reset();
  clearAll();
  cfg.save({ enabled: true, provider: 'fixture', auth: {}, models: {}, providerOptions: {}, boundUid: {}, authMode: 'profile', ...patch });
};

// The four helpers server.js hands in, as fakes — one signed-in profile, admin only if asked.
function harness(uid = 'alice', admin = false) {
  const routes = coachRoutes({
    json: (res, status, body) => { res.status = status; res.body = body; },
    readBody: async req => req.body || {},
    readSession: () => ({ id: uid, admin }),
    requireAdmin: () => admin
  });
  return async (key, body) => { const res = {}; await routes[key]({ body }, res); return res; };
}

/** A local endpoint speaking the OpenAI list shape, so no test ever reaches the internet. */
async function mockEndpoint(models = ['llama3', 'gemma']) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: models.map(id => ({ id })) }));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/* ---------- the resolution that jobs run on ---------- */

test('two profiles run two providers, and neither can reach the other key', () => {
  fresh();
  cfg.saveProfileAccount('alice', { provider: 'anthropic', token: 'sk-ant-a', model: 'claude-opus-5' });
  cfg.saveProfileAccount('bob', { provider: 'openai', token: 'sk-oa-b', model: 'gpt-5.6' });

  const a = cfg.effectiveFor('alice');
  const b = cfg.effectiveFor('bob');
  assert.equal(a.provider, 'anthropic');
  assert.equal(a.model, 'claude-opus-5');
  assert.equal(a.credential.auth.token, 'sk-ant-a');
  assert.equal(b.provider, 'openai');
  assert.equal(b.model, 'gpt-5.6');
  assert.equal(b.credential.auth.token, 'sk-oa-b');
  assert.equal(cfg.credentialFor('carol').ok, false, 'a profile that never connected has nothing');
});

test('the job environment carries the key under the profile own provider variable', () => {
  fresh();
  cfg.saveProfileAccount('alice', { provider: 'anthropic', token: 'sk-ant-a', model: 'm' });
  cfg.saveProfileAccount('bob', { provider: 'openai', token: 'sk-oa-b', model: 'm' });
  assert.equal(cfg.jobEnv('/tmp/job', cfg.effectiveFor('alice').credential).ANTHROPIC_API_KEY, 'sk-ant-a');
  assert.equal(cfg.jobEnv('/tmp/job', cfg.effectiveFor('bob').credential).OPENAI_API_KEY, 'sk-oa-b');
});

test('a compatible endpoint works without a key, but only once the profile files the endpoint', () => {
  fresh();
  assert.equal(cfg.credentialFor('alice').ok, false, 'nothing filed yet');
  cfg.saveProfileAccount('alice', { provider: 'compatible', token: '', model: 'llama3', baseUrl: 'http://127.0.0.1:11434' });
  const c = cfg.credentialFor('alice');
  assert.equal(c.ok, true);
  assert.equal(c.auth, null);
  assert.equal(c.baseUrl, 'http://127.0.0.1:11434');

  cfg.saveProfileAccount('bob', { provider: 'compatible', token: '', model: 'llama3', baseUrl: null });
  assert.equal(cfg.credentialFor('bob').ok, false, 'a keyless provider still needs an endpoint to call');
});

test('editing the model keeps the key; switching provider without a key leaves nothing to spend', () => {
  fresh();
  cfg.saveProfileAccount('alice', { provider: 'anthropic', token: 'sk-ant-a', model: 'm1' });
  cfg.saveProfileAccount('alice', { provider: 'anthropic', token: '', model: 'm2' });
  assert.equal(cfg.credentialFor('alice').auth.token, 'sk-ant-a', 'the key survives a model edit');
  assert.equal(cfg.effectiveFor('alice').model, 'm2');

  cfg.saveProfileAccount('alice', { provider: 'openai', token: '', model: 'm3' });
  assert.equal(cfg.credentialFor('alice').ok, false, 'a different provider gets a different key or none');
});

test('the account record names the provider and model, never the token', () => {
  fresh();
  cfg.saveProfileAccount('bob', { provider: 'gemini', token: 'AIza-secret', model: 'gemini-2.5-pro' });
  const a = cfg.accountFor('bob');
  assert.equal(a.connected, true);
  assert.equal(a.provider, 'gemini');
  assert.equal(a.providerLabel, 'Google Gemini');
  assert.equal(a.model, 'gemini-2.5-pro');
  assert.equal(JSON.stringify(a).includes('AIza-secret'), false);
});

test('the admin summary counts profiles, never their keys', () => {
  fresh();
  cfg.saveProfileAccount('alice', { provider: 'anthropic', token: 'sk-ant-a', model: 'm' });
  cfg.saveProfileAccount('bob', { provider: 'compatible', token: '', model: 'm', baseUrl: 'http://127.0.0.1:11434' });
  cfg.saveProfileAccount('carol', { provider: 'openai', token: '', model: 'm' });   // nothing filed

  const s = cfg.profileSummary();
  assert.deepEqual(s, { connected: 2, total: 3 });
  assert.equal(JSON.stringify(s).includes('sk-ant-a'), false);
});

/* ---------- the routes ---------- */

test('a profile files its own credential; another profile sees none of it, and no route echoes it', async () => {
  fresh();
  const alice = harness('alice');
  let r = await alice('POST /api/coach/credential', { provider: 'openai', key: 'sk-oa-secret', model: 'gpt-5.6' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  r = await alice('GET /api/coach/setup');
  assert.equal(r.status, 200);
  assert.equal(r.body.authMode, 'profile');
  assert.equal(r.body.connected, true);
  assert.equal(r.body.provider, 'openai');
  assert.ok(r.body.providers.some(p => p.id === 'anthropic'), 'the picker offers the HTTPS providers');
  assert.ok(r.body.providers.some(p => p.id === 'deepseek'), 'DeepSeek is one of them');
  assert.ok(r.body.providers.some(p => p.id === 'opencode-go'), 'so is the OpenCode Go catalog');
  assert.ok(!JSON.stringify(r.body).includes('sk-oa-secret'), 'no key ever comes back');

  const bob = harness('bob');
  assert.equal((await bob('GET /api/coach/setup')).body.connected, false, 'alice’s key is not bob’s');

  r = await alice('POST /api/coach/credential/remove');
  assert.equal(r.status, 200);
  assert.equal((await alice('GET /api/coach/setup')).body.connected, false);
});

test('in instance mode the per-profile routes are refused — the mode decides, not the caller', async () => {
  fresh({ authMode: 'instance' });
  const alice = harness('alice');
  assert.equal((await alice('POST /api/coach/credential', { provider: 'openai', key: 'k' })).status, 400);
  assert.equal((await alice('POST /api/coach/credential/models', { provider: 'openai' })).status, 400);
  assert.equal((await alice('POST /api/coach/credential/remove')).status, 400);
});

test('a runtime provider is not something a profile can choose; unknown ones are refused too', async () => {
  fresh();
  const alice = harness('alice');
  for (const provider of ['claude', 'codex', 'fixture', 'nope']) {
    const r = await alice('POST /api/coach/credential', { provider, key: 'k', model: 'm' });
    assert.equal(r.status, 400, provider);
  }
  assert.equal((await alice('GET /api/coach/setup')).body.connected, false);
});

test('the models route lists with the key on its way in, before anything is stored', async () => {
  const mock = await mockEndpoint();
  try {
    fresh();
    const alice = harness('alice');
    let r = await alice('POST /api/coach/credential/models', { provider: 'compatible', baseUrl: mock.base, key: null });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.models, ['gemma', 'llama3']);
    assert.equal(cfg.credentialFor('alice').ok, false, 'listing does not file anything');

    r = await alice('POST /api/coach/credential/models', { provider: 'compatible', baseUrl: mock.base + '/' });
    assert.equal(r.status, 200, 'a saved endpoint is enough on the second visit');
    r = await alice('POST /api/coach/credential', { provider: 'compatible', baseUrl: mock.base, key: null, model: 'llama3' });
    assert.equal(r.status, 200);
    assert.equal(cfg.credentialFor('alice').ok, true);
  } finally { mock.close(); }
});

/* ---------- the effort a profile picks ---------- */

test('the effort is stored, validated against the model, kept on a re-save and cleared on demand', async () => {
  fresh();
  const alice = harness('alice');

  // The gateway takes an effort only for its DeepSeek models — anything else is refused.
  let r = await alice('POST /api/coach/credential', { provider: 'opencode-go', key: 'sk-oc-1', model: 'glm-5.3-flash', effort: 'high' });
  assert.equal(r.status, 400);
  r = await alice('POST /api/coach/credential', { provider: 'opencode-go', key: 'sk-oc-1', model: 'deepseek-v4.1-flash', effort: 'high' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(cfg.effectiveFor('alice').effort, 'high');

  // The setup screen reports it back, with the options the model takes.
  r = await alice('GET /api/coach/setup');
  assert.equal(r.body.effort, 'high');
  const gw = r.body.providers.find(p => p.id === 'opencode-go');
  assert.deepEqual(gw.efforts, ['off', 'low', 'medium', 'high', 'max']);
  assert.equal(gw.effortsForModels, 'deepseek');

  // Editing the model keeps what was filed; clearing the effort falls back to the default.
  await alice('POST /api/coach/credential', { provider: 'opencode-go', model: 'deepseek-v4.1-flash' });
  assert.equal(cfg.effectiveFor('alice').effort, 'high');
  await alice('POST /api/coach/credential', { provider: 'opencode-go', model: 'deepseek-v4.1-flash', effort: null });
  assert.equal(cfg.effectiveFor('alice').effort, 'off');
});

/* ---------- instance-level behaviour that must not follow the profiles ---------- */

test('an unconnected profile is told to connect, not that the instance is off', () => {
  fresh();
  writeState(dir, 'alice', sampleState());
  assert.throws(() => jobs.enqueue('alice', { kind: 'review' }),
    e => e.code === 'connect' && /connect/i.test(e.message));
});

test('the admin card reports per-profile mode, counts connections and never a credential', async () => {
  fresh();
  cfg.saveProfileAccount('alice', { provider: 'anthropic', token: 'sk-ant-x', model: 'm' });
  const admin = harness('alice', true);

  let r = await admin('GET /api/admin/coach');
  assert.equal(r.status, 200);
  assert.equal(r.body.authMode, 'profile');
  assert.equal(r.body.provider, null);
  assert.deepEqual(r.body.auth, { state: 'per-profile' });
  assert.deepEqual(r.body.profiles, { connected: 1, total: 1 });
  assert.equal(r.body.runtime.perProfile, true);
  assert.ok(!JSON.stringify(r.body).includes('sk-ant-x'));

  r = await admin('POST /api/admin/coach/test');
  assert.equal(r.body.ok, false, 'there is no instance credential to round-trip in profile mode');
});

test('switching modes resets the daily limits to that mode defaults', async () => {
  fresh({ authMode: 'instance', caps: { perProfileDaily: 5, instanceDaily: 100 } });
  const admin = harness('alice', true);

  await admin('POST /api/admin/coach/config', { authMode: 'profile' });
  assert.deepEqual(cfg.load().caps, { perProfileDaily: 0, instanceDaily: 0 });

  await admin('POST /api/admin/coach/config', { authMode: 'instance' });
  assert.deepEqual(cfg.load().caps, { perProfileDaily: 10, instanceDaily: 0 });
});

test('publicConfig in profile mode names no instance provider', () => {
  fresh();
  const p = cfg.publicConfig();
  assert.equal(p.enabled, true);
  assert.equal(p.authMode, 'profile');
  assert.equal(p.provider, null);
  assert.equal(p.providerLabel, null);
});
