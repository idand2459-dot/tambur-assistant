import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBot } from '../src/bot/bot.js';
import { openDatabase } from '../src/data/db.js';
import { addMessage } from '../src/data/conversations-repo.js';
import { botMessages } from '../src/bot/messages.js';

// Build a real grammY bot from createBot, but capture outgoing sendMessage calls via an
// API transformer (no network) and skip getMe by setting botInfo manually.
function testBot(llmService) {
  const db = openDatabase(':memory:');
  const bot = createBot({ config: { botToken: '123:TEST', rateLimitMs: 2000 }, db, llmService });
  bot.botInfo = {
    id: 1, is_bot: true, first_name: 'test', username: 'testbot',
    can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
  };
  const sent = [];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === 'sendMessage') {
      sent.push(payload.text);
      return { ok: true, result: { message_id: 1, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text } };
    }
    return { ok: true, result: {} };
  });
  return { bot, db, sent };
}

const base = (chatId, id) => ({
  update_id: id,
  message: {
    message_id: id,
    date: 0,
    chat: { id: chatId, type: 'private' },
    from: { id: chatId, is_bot: false, first_name: 'u' },
  },
});

function textUpdate(chatId, text, id = 1) {
  const u = base(chatId, id);
  u.message.text = text;
  return u;
}
function commandUpdate(chatId, cmd, id = 1) {
  const u = base(chatId, id);
  u.message.text = cmd;
  u.message.entities = [{ type: 'bot_command', offset: 0, length: cmd.length }];
  return u;
}
function photoUpdate(chatId, id = 1) {
  const u = base(chatId, id);
  u.message.photo = [{ file_id: 'x', file_unique_id: 'y', width: 1, height: 1 }];
  return u;
}

const okLlm = () => {
  const calls = [];
  return { calls, handleUserMessage: async (chatId, text) => { calls.push({ chatId, text }); return 'תשובת LLM'; } };
};

test('a text message is routed to the LLM and its answer is sent', async () => {
  const llm = okLlm();
  const { bot, db, sent } = testBot(llm);
  await bot.handleUpdate(textUpdate(100, 'יש צבע?'));
  assert.deepEqual(llm.calls, [{ chatId: 100, text: 'יש צבע?' }]);
  assert.deepEqual(sent, ['תשובת LLM']);
  db.close();
});

test('/start clears history, greets, and does NOT reach the LLM', async () => {
  const llm = okLlm();
  const { bot, db, sent } = testBot(llm);
  addMessage(db, 100, 'user', 'ישן', Date.now());
  await bot.handleUpdate(commandUpdate(100, '/start'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE chat_id = ?').get(100).n, 0);
  assert.deepEqual(sent, [botMessages.welcome]);
  assert.equal(llm.calls.length, 0); // command did not fall through to the text handler
  db.close();
});

test('a non-text message gets the text-only reply and does NOT reach the LLM', async () => {
  const llm = okLlm();
  const { bot, db, sent } = testBot(llm);
  await bot.handleUpdate(photoUpdate(100));
  assert.deepEqual(sent, [botMessages.nonText]);
  assert.equal(llm.calls.length, 0);
  db.close();
});

test('a throwing handler is swallowed — handleUpdate does not reject (SPEC §8)', async () => {
  const llm = { handleUserMessage: async () => { throw new Error('LLM exploded'); } };
  const { bot, db } = testBot(llm);
  await assert.doesNotReject(bot.handleUpdate(textUpdate(100, 'תפוצץ')));
  db.close();
});
