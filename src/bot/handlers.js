// Telegram message handlers (SPEC §3, §6, §8.1). Kept separate from bot.js and free of
// grammY construction so they can be unit-tested with a fake context. Each handler takes
// the grammY context plus injected dependencies.

import { clearChat } from '../data/conversations-repo.js';
import { botMessages } from './messages.js';

// Defensive cap on customer input length (SPEC §8 "truncate overly long inputs").
const MAX_INPUT_CHARS = 1000;

/** /start — greet and clear this chat's memory (SPEC §6). */
export async function handleStart(ctx, { db }) {
  clearChat(db, ctx.chat.id);
  await ctx.reply(botMessages.welcome);
}

/** /reset — clear this chat's memory and confirm (SPEC §6). */
export async function handleReset(ctx, { db }) {
  clearChat(db, ctx.chat.id);
  await ctx.reply(botMessages.reset);
}

/** A text message — rate-limit, then hand to the LLM layer and reply (SPEC §8.1). */
export async function handleText(ctx, { llmService, rateLimiter, now = () => Date.now() }) {
  const chatId = ctx.chat.id;
  const { allowed, notify } = rateLimiter.check(chatId, now());
  if (!allowed) {
    if (notify) await ctx.reply(botMessages.throttle);
    return;
  }
  const text = ctx.message.text.slice(0, MAX_INPUT_CHARS);
  const reply = await llmService.handleUserMessage(chatId, text);
  await ctx.reply(reply);
}

/** A non-text message (photo, sticker, voice, …) — we only read text (SPEC §8). */
export async function handleNonText(ctx) {
  await ctx.reply(botMessages.nonText);
}
