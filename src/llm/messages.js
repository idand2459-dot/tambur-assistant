// User-facing Hebrew text produced by the LLM layer on failure (SPEC §8). Bot-layer texts
// (rate-limit, non-text) live with the bot in Stage 5.

import { storeInfo } from '../config/store-info.js';

/** Friendly apology shown when the LLM call fails or times out (SPEC §8). */
export function apologyMessage() {
  return `מצטער, יש כרגע תקלה זמנית. נסו שוב עוד רגע או התקשרו לחנות ל${storeInfo.phone}.`;
}
