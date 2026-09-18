/* DeepSeek — its own API, Chat Completions shaped.
 *
 * `max_tokens` rather than `max_completion_tokens`: that is the field DeepSeek documents, and
 * the same one the compatible adapter uses. Temperature 0 keeps a plan diff deterministic.
 * JSON output is supported (`response_format: { type: 'json_object' }`); the spec asks for a
 * schema first and the transport falls back through plain JSON mode when the API refuses it.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';

export const deepseekSpec = chatCompletionsSpec('deepseek', { maxTokensField: 'max_tokens', temperature: 0 });
export default httpAdapter(deepseekSpec);
