// Pure configuration loading & validation (SPEC §7).
//
// This module has NO side effects (it does not read files or load dotenv) so it stays
// easy to unit-test: callers pass an env object, defaulting to process.env. The real
// entry point (src/index.js) loads dotenv first, then calls loadConfig().

const REQUIRED_VARS = ['BOT_TOKEN', 'GEMINI_API_KEY'];

const DEFAULTS = {
  GEMINI_MODEL: 'gemini-3.5-flash',
  DB_PATH: './data/tambur.db',
  RATE_LIMIT_MS: '2000',
};

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Build and validate the app config from an environment object.
 * Throws a clear Error listing any missing required variables (fail-fast, SPEC §8).
 *
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {{ botToken: string, geminiApiKey: string, geminiModel: string,
 *             dbPath: string, rateLimitMs: number }}
 */
export function loadConfig(env = process.env) {
  const missing = REQUIRED_VARS.filter((key) => isBlank(env[key]));
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill them in.',
    );
  }

  const rawRateLimit = isBlank(env.RATE_LIMIT_MS) ? DEFAULTS.RATE_LIMIT_MS : env.RATE_LIMIT_MS;
  const rateLimitMs = Number(rawRateLimit);
  if (!Number.isFinite(rateLimitMs) || rateLimitMs < 0) {
    throw new Error(`RATE_LIMIT_MS must be a non-negative number, got: ${env.RATE_LIMIT_MS}`);
  }

  return {
    botToken: env.BOT_TOKEN,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: isBlank(env.GEMINI_MODEL) ? DEFAULTS.GEMINI_MODEL : env.GEMINI_MODEL,
    dbPath: isBlank(env.DB_PATH) ? DEFAULTS.DB_PATH : env.DB_PATH,
    rateLimitMs,
  };
}
