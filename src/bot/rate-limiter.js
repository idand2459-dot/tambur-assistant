// Per-chat rate limiter (SPEC §8.1). Soft protection for the Gemini quota: at most one
// processed message per window per chat. In-memory (a restart resets it) — this guards
// bursts, it is not billing. Pure and testable via an injectable clock.

/**
 * @param {number} windowMs  minimum gap between processed messages for one chat
 */
export function createRateLimiter(windowMs) {
  const state = new Map(); // chatId -> { last: number, notified: boolean }

  return {
    /**
     * @returns {{ allowed: boolean, notify: boolean }}
     *   allowed: process this message. notify: send the throttle notice (only for the
     *   first blocked message in a window; further blocked messages are dropped silently).
     */
    check(chatId, now = Date.now()) {
      const entry = state.get(chatId);
      if (!entry || now - entry.last >= windowMs) {
        state.set(chatId, { last: now, notified: false });
        return { allowed: true, notify: false };
      }
      if (!entry.notified) {
        entry.notified = true;
        return { allowed: false, notify: true };
      }
      return { allowed: false, notify: false };
    },
  };
}
