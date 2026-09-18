import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../src/data/db.js';
import { addMessage } from '../src/data/conversations-repo.js';
import { createRateLimiter } from '../src/bot/rate-limiter.js';
import { handleStart, handleReset, handleText, handleNonText } from '../src/bot/handlers.js';
import { botMessages } from '../src/bot/messages.js';

// A fake grammY context that records replies.
function fakeCtx(chatId, text) {
  const replies = [];
  return {
    chat: { id: chatId },
    message: text === undefined ? {} : { text },
    reply: async (t) => { replies.push(t); },
    replies,
  };
}

const stubLlm = () => {
  const calls = [];
  return {
    calls,
    handleUserMessage: async (chatId, text) => {
      calls.push({ chatId, text });
      return `תשובה ל: ${text}`;
    },
  };
};

// --- rate limiter (SPEC §8.1) ---------------------------------------------

test('rate limiter allows one message then throttles within the window', () => {
  const rl = createRateLimiter(2000);
  assert.deepEqual(rl.check(1, 0), { allowed: true, notify: false });
  assert.deepEqual(rl.check(1, 500), { allowed: false, notify: true }); // first block notifies
  assert.deepEqual(rl.check(1, 800), { allowed: false, notify: false }); // further blocks silent
  assert.deepEqual(rl.check(1, 2000), { allowed: true, notify: false }); // window elapsed
});

test('rate limiter is per chat', () => {
  const rl = createRateLimiter(2000);
  assert.equal(rl.check(1, 0).allowed, true);
  assert.equal(rl.check(2, 100).allowed, true); // different chat, not throttled
});

// --- text handler ---------------------------------------------------------

test('handleText passes an allowed message to the LLM and replies with its answer', async () => {
  const llmService = stubLlm();
  const rateLimiter = createRateLimiter(2000);
  const ctx = fakeCtx(7, 'יש לכם צבע?');
  await handleText(ctx, { llmService, rateLimiter, now: () => 0 });
  assert.deepEqual(llmService.calls, [{ chatId: 7, text: 'יש לכם צבע?' }]);
  assert.deepEqual(ctx.replies, ['תשובה ל: יש לכם צבע?']);
});

test('handleText sends the throttle notice once and does not call the LLM', async () => {
  const llmService = stubLlm();
  const rateLimiter = createRateLimiter(2000);
  let t = 0;
  const now = () => t;

  await handleText(fakeCtx(7, 'a'), { llmService, rateLimiter, now }); // allowed
  t = 500;
  const blocked = fakeCtx(7, 'b');
  await handleText(blocked, { llmService, rateLimiter, now }); // throttled + notify
  t = 800;
  const silent = fakeCtx(7, 'c');
  await handleText(silent, { llmService, rateLimiter, now }); // throttled, silent

  assert.equal(llmService.calls.length, 1); // only the first reached the LLM
  assert.deepEqual(blocked.replies, [botMessages.throttle]);
  assert.deepEqual(silent.replies, []);
});

// --- non-text + commands --------------------------------------------------

test('handleNonText replies with the text-only message', async () => {
  const ctx = fakeCtx(9);
  await handleNonText(ctx);
  assert.deepEqual(ctx.replies, [botMessages.nonText]);
});

test('handleStart clears the chat history and greets', async () => {
  const db = openDatabase(':memory:');
  addMessage(db, 5, 'user', 'ישן', Date.now());
  const ctx = fakeCtx(5, '/start');
  await handleStart(ctx, { db });
  const remaining = db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE chat_id = ?').get(5).n;
  assert.equal(remaining, 0);
  assert.deepEqual(ctx.replies, [botMessages.welcome]);
  db.close();
});

test('handleReset clears history and confirms', async () => {
  const db = openDatabase(':memory:');
  addMessage(db, 5, 'user', 'ישן', Date.now());
  const ctx = fakeCtx(5, '/reset');
  await handleReset(ctx, { db });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE chat_id = ?').get(5).n, 0);
  assert.deepEqual(ctx.replies, [botMessages.reset]);
  db.close();
});
