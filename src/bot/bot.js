// The Telegram layer (SPEC §11 Stage 5). Wires grammY to the handlers. This module knows
// nothing about SQL or Gemini internals — it dispatches to the LLM layer and the data layer
// through the injected dependencies.

import { Bot } from 'grammy';

import { createRateLimiter } from './rate-limiter.js';
import { handleStart, handleReset, handleText, handleNonText } from './handlers.js';

/**
 * Build (but do not start) the grammY bot.
 * @param {{ config: object, db: object, llmService: { handleUserMessage: Function } }} deps
 * @returns {import('grammy').Bot}
 */
export function createBot({ config, db, llmService }) {
  const bot = new Bot(config.botToken);
  const rateLimiter = createRateLimiter(config.rateLimitMs);
  const deps = { db, llmService, rateLimiter };

  // Defense in depth: log and swallow any handler error so one bad update can never crash
  // the bot (SPEC §8). bot.catch below is the final net for the polling runtime.
  const safe = (handler) => async (ctx) => {
    try {
      await handler(ctx);
    } catch (err) {
      console.error(`[bot] handler error for chat ${ctx.chat?.id}: ${err?.message ?? err}`);
    }
  };

  // Commands first so a "/start" text does not fall through to the text handler.
  bot.command('start', safe((ctx) => handleStart(ctx, deps)));
  bot.command('reset', safe((ctx) => handleReset(ctx, deps)));

  // Text messages → LLM layer. Registered before the catch-all so non-text falls through.
  bot.on('message:text', safe((ctx) => handleText(ctx, deps)));
  bot.on('message', safe((ctx) => handleNonText(ctx)));

  // Top-level safety net: never let a handler error crash the bot (SPEC §8).
  bot.catch((err) => {
    const reason = err?.error?.message ?? err?.message ?? String(err);
    console.error(`[bot] unhandled error for update ${err?.ctx?.update?.update_id}: ${reason}`);
  });

  return bot;
}
