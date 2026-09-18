import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config/env.js';

const BASE = { BOT_TOKEN: 'token-x', GEMINI_API_KEY: 'key-y' };

test('loadConfig returns required values and applies defaults', () => {
  const cfg = loadConfig({ ...BASE });
  assert.equal(cfg.botToken, 'token-x');
  assert.equal(cfg.geminiApiKey, 'key-y');
  assert.equal(cfg.geminiModel, 'gemini-3.5-flash');
  assert.equal(cfg.dbPath, './data/tambur.db');
  assert.equal(cfg.rateLimitMs, 2000);
});

test('loadConfig honors overrides for optional vars', () => {
  const cfg = loadConfig({
    ...BASE,
    GEMINI_MODEL: 'gemini-custom',
    DB_PATH: '/tmp/db.sqlite',
    RATE_LIMIT_MS: '500',
  });
  assert.equal(cfg.geminiModel, 'gemini-custom');
  assert.equal(cfg.dbPath, '/tmp/db.sqlite');
  assert.equal(cfg.rateLimitMs, 500);
});

test('loadConfig throws when BOT_TOKEN is missing', () => {
  assert.throws(() => loadConfig({ GEMINI_API_KEY: 'key-y' }), /BOT_TOKEN/);
});

test('loadConfig throws when GEMINI_API_KEY is missing', () => {
  assert.throws(() => loadConfig({ BOT_TOKEN: 'token-x' }), /GEMINI_API_KEY/);
});

test('loadConfig treats blank/whitespace required vars as missing', () => {
  assert.throws(() => loadConfig({ BOT_TOKEN: '   ', GEMINI_API_KEY: '' }), /BOT_TOKEN, GEMINI_API_KEY/);
});

test('loadConfig rejects a non-numeric RATE_LIMIT_MS', () => {
  assert.throws(() => loadConfig({ ...BASE, RATE_LIMIT_MS: 'abc' }), /RATE_LIMIT_MS/);
});
