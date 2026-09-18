/* OpenCode Go — the subscription plan on the same gateway as Zen, a different catalog.
 *
 * Same wire shape as Zen (`../opencode.js` explains the body choices); only the base URL
 * differs, which is why this is its own adapter and its own provider row: a `go` key lists a
 * different set of models, and pointing it at the Zen catalog would answer 404s the app could
 * only show as a failed run.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';

export const opencodeGoSpec = chatCompletionsSpec('opencode-go', { maxTokensField: 'max_tokens' });
export default httpAdapter(opencodeGoSpec);
