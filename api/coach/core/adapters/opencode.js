/* OpenCode Zen — the OpenCode team's gateway, Chat Completions shaped.
 *
 * One endpoint serves models from several vendors, so the body stays to the shape every one of
 * them accepts: `max_tokens` (the classic field every gateway understands) and no temperature,
 * which some reasoning models reject outright. The model list is public and is what the setup
 * screen shows; nothing here pins a model name that can go stale.
 *
 * Effort belongs to the model, not the gateway: DeepSeek models reason by default and their
 * thinking is billed as output (a 16k budget came back with the answer cut off), so they get
 * the thinking toggle; the other vendors' models have their own, different knobs and get
 * nothing extra.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';
import { deepseekEffortBody } from './deepseek.js';

export const isDeepseekModel = model => String(model || '').toLowerCase().startsWith('deepseek');
export const isGlmModel = model => String(model || '').toLowerCase().startsWith('glm');

/* GLM also thinks by default, and its reasoning is billed as output — same story as DeepSeek:
 * a review ran for three minutes and came back cut off. The gateway takes OpenAI's
 * `reasoning_effort` and passes it through (verified against the live gateway: `none` answers in
 * 7 completion tokens where the default takes 20-30), so off is mapped to `none` and the rest to
 * the vendor's own names; `max` clamps to `high` because `max` behaved like no thinking at all.
 * The 2.5/3-style `thinking` field is refused by this upstream ("unknown field thinking"). */
const GLM_EFFORT = { off: 'none', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', max: 'high' };
export const glmEffortBody = effort => ({ reasoning_effort: GLM_EFFORT[effort] || 'none' });

export const opencodeEffortBody = (effort, { model } = {}) => {
  if (isDeepseekModel(model)) return deepseekEffortBody(effort);
  if (isGlmModel(model)) return glmEffortBody(effort);
  return null;
};

export const opencodeSpec = chatCompletionsSpec('opencode', { maxTokensField: 'max_tokens', effortBody: opencodeEffortBody });
export default httpAdapter(opencodeSpec);
