/* DeepSeek — its own API, Chat Completions shaped.
 *
 * `max_tokens` rather than `max_completion_tokens`: that is the field DeepSeek documents, and
 * the same one the compatible adapter uses. Temperature 0 keeps a plan diff deterministic.
 * JSON output is supported (`response_format: { type: 'json_object' }`); the spec asks for a
 * schema first and the transport falls back through plain JSON mode when the API refuses it.
 *
 * Thinking is off unless the profile asks for an effort. DeepSeek's models reason by default —
 * `high` effort — and that reasoning is output: on a 16k-token budget it swallowed the JSON
 * answer whole ("the answer was cut off at the output limit") and made every job several times
 * slower. The Coach's answers are shaped by its prompt and checked by its validator, not
 * discovered by the model, so reasoning is opt-in here.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';

// DeepSeek takes low/high/max; `medium` is the middle option in our UI, not a value their API
// knows, so it rides as `high` — asking for the middle and getting high is honest; asking for
// something the API rejects is not.
const DEEPSEEK_EFFORT = { low: 'low', medium: 'high', high: 'high', max: 'max' };

export const deepseekEffortBody = effort => (effort && effort !== 'off'
  ? { thinking: { type: 'enabled' }, reasoning_effort: DEEPSEEK_EFFORT[effort] || 'high' }
  : { thinking: { type: 'disabled' } });

export const deepseekSpec = chatCompletionsSpec('deepseek', {
  maxTokensField: 'max_tokens',
  temperature: 0,
  effortBody: deepseekEffortBody
});
export default httpAdapter(deepseekSpec);
