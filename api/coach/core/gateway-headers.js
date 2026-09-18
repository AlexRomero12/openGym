/* The few headers the OpenCode gateways want beyond the credential.
 *
 * Go is explicit about it (https://opencode.ai/docs/go → "Where can I use it"): the client has
 * to identify itself with its own user agent rather than a generic HTTP library, and has to send
 * a stable session id per conversation so requests can be routed and cached well. Without the
 * session header every call comes back 400 "Request is missing x-opencode-session", which reads
 * to a user as "my key doesn't work".
 *
 * The session id is the profile's payload pseudonym — stable for that person across jobs, never
 * the user id, and already the only identifier the provider ever sees of them. The phone's local
 * mode passes its own device handle, which is minted the same way.
 */
const OPENCODE_GATEWAYS = new Set(['opencode', 'opencode-go']);

export function gatewayHeaders(provider, session) {
  if (!OPENCODE_GATEWAYS.has(provider)) return null;
  return {
    'user-agent': 'openGym-coach/1.0',
    ...(session ? { 'x-opencode-session': String(session).slice(0, 64) } : {})
  };
}
