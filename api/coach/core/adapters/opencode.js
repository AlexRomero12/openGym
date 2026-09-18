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

export const opencodeEffortBody = (effort, { model } = {}) => (isDeepseekModel(model) ? deepseekEffortBody(effort) : null);

export const opencodeSpec = chatCompletionsSpec('opencode', { maxTokensField: 'max_tokens', effortBody: opencodeEffortBody });
export default httpAdapter(opencodeSpec);
