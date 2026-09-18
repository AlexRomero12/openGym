/* Google Gemini (Generative Language API). The key travels as a header, never as `?key=` —
 * a query string ends up in proxy logs, error messages and browser history.
 *
 * Thinking is a real cost here, exactly as on DeepSeek: the 2.5 and 3 series reason by default
 * (3.x defaults to `high`), thinking tokens count against `maxOutputTokens`, and a 16k budget
 * came back cut off. So an effort is sent whenever one was chosen — `thinkingLevel`, the
 * current control, with `low` as the profile default. `minimal` is deliberately not offered:
 * 3.1 Pro rejects it, and a 400 on a model picker is worse than one level of thinking.
 */
import { httpAdapter } from './http.js';
import { SYSTEM_PROMPT } from '../system-prompt.js';

export const geminiSpec = {
  id: 'gemini',
  path: model => `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
  modelsPath: '/v1beta/models?pageSize=200',
  headers: key => ({ 'x-goog-api-key': key }),
  // No responseSchema on purpose: Gemini's OpenAPI subset rejects the type unions our schemas
  // use for before/after, and json mime plus the validator already holds the line.
  body: ({ prompt, system, maxTokens, effort }) => ({
    systemInstruction: { parts: [{ text: system ? SYSTEM_PROMPT + '\n\n' + system : SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      maxOutputTokens: maxTokens,
      ...(effort ? { thinkingConfig: { thinkingLevel: effort } } : {})
    }
  }),
  errorMessage: data => data && data.error && data.error.message,
  readText: data => {
    const cand = (data.candidates || [])[0];
    if (!cand) {
      const block = data.promptFeedback && data.promptFeedback.blockReason;
      return { error: block ? `the request was blocked: ${block}` : 'the answer had no candidates' };
    }
    if (cand.finishReason === 'MAX_TOKENS') return { text: '', truncated: true };
    if (cand.finishReason && cand.finishReason !== 'STOP') return { error: `the model stopped early: ${cand.finishReason}` };
    // A reasoning part carries the model's own thoughts, never the answer: joining it into the
    // JSON the parser reads is how a good answer turns into "the app couldn't use it".
    const parts = ((cand.content && cand.content.parts) || []).filter(p => p && !p.thought);
    const text = parts.map(p => p.text || '').join('');
    if (!text.trim()) return { error: 'the model returned an empty answer' };
    return { text, truncated: false };
  },
  readModels: data => (data.models || [])
    .filter(m => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map(m => String(m.name || '').replace(/^models\//, ''))
};

export default httpAdapter(geminiSpec);
