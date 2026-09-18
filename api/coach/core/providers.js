/* The providers that speak plain HTTPS, described once for both runtimes.
 *
 * The server's config.PROVIDERS spreads these rows in next to the runtime-backed providers
 * (Claude Agent SDK, Codex CLI); the phone reads them directly for its own picker. Keeping the
 * facts in one place is what stops the two ever offering different endpoints or defaults.
 *
 * `defaultModel` is a starting point, not a pin. Every one of these providers lists its models
 * over the same API, and the UI offers that list — a name typed here goes stale, a list does
 * not. `compatible` has no default at all: an OpenAI-compatible endpoint is whatever the owner
 * pointed it at, so the model has to come from what that endpoint actually serves.
 */
export const HTTP_PROVIDERS = Object.freeze({
  anthropic: Object.freeze({
    label: 'Anthropic API', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'ANTHROPIC_API_KEY', oauthEnv: null,
    defaultBase: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-5',
    keyPlaceholder: 'sk-ant-…'
  }),
  openai: Object.freeze({
    label: 'OpenAI API', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'OPENAI_API_KEY', oauthEnv: null,
    defaultBase: 'https://api.openai.com',
    defaultModel: 'gpt-5.6',
    keyPlaceholder: 'sk-…',
    efforts: ['minimal', 'low', 'medium', 'high'], defaultEffort: 'medium'
  }),
  gemini: Object.freeze({
    label: 'Google Gemini', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'GEMINI_API_KEY', oauthEnv: null,
    defaultBase: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-pro',
    keyPlaceholder: 'AIza… or AQ.…',
    // The 2.5/3 series reason by default and default to high; the Coach's work is formatting
    // JSON, so the low end is the sane starting point. `minimal` is left out: 3.1 Pro refuses it.
    efforts: ['low', 'medium', 'high'], defaultEffort: 'low'
  }),
  // Ollama, LM Studio, vLLM, OpenRouter, a corporate gateway: anything that serves the
  // Chat Completions shape. The base URL is the whole configuration; a key is optional
  // because a model on your own LAN usually has none.
  compatible: Object.freeze({
    label: 'OpenAI-compatible endpoint', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'OPENAI_COMPAT_API_KEY', oauthEnv: null,
    defaultBase: null, baseUrl: true, keyOptional: true,
    defaultModel: null,
    keyPlaceholder: '(optional)'
  }),
  // DeepSeek's own API — OpenAI-compatible, serves chat completions, JSON output and a models
  // list; `deepseek-flash` is the current cheap model (legacy `deepseek-v4-flash` still answers).
  // `efforts` is what the model can be asked for: off disables its thinking (the Coach's default
  // here — thinking ate the output budget), the rest enable it at that effort.
  deepseek: Object.freeze({
    label: 'DeepSeek API', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'DEEPSEEK_API_KEY', oauthEnv: null,
    defaultBase: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    keyPlaceholder: 'sk-…',
    efforts: ['off', 'low', 'medium', 'high', 'max'], defaultEffort: 'off'
  }),
  // OpenCode's gateway, in its two plans: Zen (pay as you go) and Go (subscription). The same
  // account key works on both; the catalogs differ, and each lists its own models. No default
  // model on purpose — the list decides, so a retired name never becomes a failed first run.
  opencode: Object.freeze({
    label: 'OpenCode Zen', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'OPENCODE_API_KEY', oauthEnv: null,
    defaultBase: 'https://opencode.ai/zen',
    defaultModel: null,
    keyPlaceholder: 'sk-…',
    efforts: ['off', 'minimal', 'low', 'medium', 'high', 'max'], defaultEffort: 'off', effortsForModels: ['deepseek', 'glm']
  }),
  'opencode-go': Object.freeze({
    label: 'OpenCode Go', runtime: 'HTTPS', http: true,
    apiKeyEnv: 'OPENCODE_API_KEY', oauthEnv: null,
    defaultBase: 'https://opencode.ai/zen/go',
    defaultModel: null,
    keyPlaceholder: 'sk-…',
    efforts: ['off', 'minimal', 'low', 'medium', 'high', 'max'], defaultEffort: 'off', effortsForModels: ['deepseek', 'glm']
  })
});

export const HTTP_PROVIDER_IDS = Object.freeze(Object.keys(HTTP_PROVIDERS));

/** The efforts a provider's current model accepts — empty when it has no such control, or when
 *  the control belongs to some models of a multi-vendor gateway and this is not one of them.
 *  `effortsForModels` is a lowercase model prefix (or a list of them) so it can travel to the
 *  setup screen as-is (a regex is not JSON), keeping the rule in one place. */
export function effortsFor(id, model) {
  const meta = HTTP_PROVIDERS[id];
  if (!meta || !meta.efforts) return [];
  if (meta.effortsForModels) {
    const prefixes = [].concat(meta.effortsForModels);
    const m = String(model || '').toLowerCase();
    if (!prefixes.some(p => m.startsWith(p))) return [];
  }
  return meta.efforts;
}

/** The base URL a provider will actually be called at: the configured override, else the default. */
export function baseUrlFor(id, cfg) {
  const meta = HTTP_PROVIDERS[id];
  const set = cfg && cfg.providerOptions && cfg.providerOptions[id] && cfg.providerOptions[id].baseUrl;
  const raw = (typeof set === 'string' && set.trim()) || (meta && meta.defaultBase) || '';
  return raw.replace(/\/+$/, '');
}

/**
 * Only http(s), only a parseable URL, and never credentials in it — a base URL is admin
 * configuration, but "admin-configured" and "safe to log" are different properties, and the
 * host is written into the job log so an operator can see where jobs went.
 */
export function validateBaseUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: true, value: null };
  let u;
  try { u = new URL(s); } catch { return { ok: false, error: 'not a valid URL' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'only http:// and https:// endpoints are supported' };
  if (u.username || u.password) return { ok: false, error: 'put the key in the credential field, not in the URL' };
  if (u.search || u.hash) return { ok: false, error: 'a base URL has no query string' };
  return { ok: true, value: u.toString().replace(/\/+$/, '') };
}
