/* OpenCode Zen — the OpenCode team's gateway, Chat Completions shaped.
 *
 * One endpoint serves models from several vendors, so the body stays to the shape every one of
 * them accepts: `max_tokens` (the classic field every gateway understands) and no temperature,
 * which some reasoning models reject outright. The model list is public and is what the setup
 * screen shows; nothing here pins a model name that can go stale.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';

export const opencodeSpec = chatCompletionsSpec('opencode', { maxTokensField: 'max_tokens' });
export default httpAdapter(opencodeSpec);
