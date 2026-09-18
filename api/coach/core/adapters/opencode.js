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
 * a review ran for three minutes and came back cut off. The difference is that GLM cannot stop
 * thinking at all; its own gateway says so ("This model always engages in thinking and cannot be
 * disabled; please use low, high, or max"), which is why the effort list for these models starts
 * at `low`. The field it does take is OpenAI's `reasoning_effort`, verified against the live
 * gateway, and `medium` rides as `high` — the vendor's own middle value. */
const GLM_EFFORT = { low: 'low', medium: 'high', high: 'high', max: 'max' };
export const glmEffortBody = effort => ({ reasoning_effort: GLM_EFFORT[effort] || 'low' });

export const opencodeEffortBody = (effort, { model } = {}) => {
  if (isDeepseekModel(model)) return deepseekEffortBody(effort);
  if (isGlmModel(model)) return glmEffortBody(effort);
  return null;
};

export const opencodeSpec = chatCompletionsSpec('opencode', { maxTokensField: 'max_tokens', effortBody: opencodeEffortBody });
export default httpAdapter(opencodeSpec);
