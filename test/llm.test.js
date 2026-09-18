import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../src/data/db.js';
import { createLlmService } from '../src/llm/service.js';
import { apologyMessage } from '../src/llm/messages.js';

// --- helpers --------------------------------------------------------------

function seededDb() {
  const db = openDatabase(':memory:');
  db.prepare('INSERT INTO products (name, category, price, in_stock) VALUES (?, ?, ?, ?)').run(
    'צבע קיר לבן מט 5 ליטר',
    'צבעים',
    89,
    1,
  );
  return db;
}

// A stub Gemini `generate`: returns queued responses in order and records the `contents`
// it was called with. Each response object mimics the SDK's `.functionCalls` / `.text`.
function stubGenerate(responses) {
  const seenContents = [];
  const fn = async ({ contents }) => {
    seenContents.push(structuredClone(contents));
    const next = responses.shift();
    if (typeof next === 'function') return next(contents);
    return next;
  };
  fn.seenContents = seenContents;
  return fn;
}

// Collects the per-turn log entries.
function captureLog() {
  const entries = [];
  const log = (entry) => entries.push(entry);
  log.entries = entries;
  return log;
}

function countMessages(db, chatId) {
  return db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE chat_id = ?').get(chatId).n;
}

// --- direct text answer (no tools) ----------------------------------------

test('returns a direct text answer when the model calls no tools', async () => {
  const db = seededDb();
  const log = captureLog();
  const svc = createLlmService({
    db,
    generate: stubGenerate([{ text: 'שלום! איך אפשר לעזור?', functionCalls: [] }]),
    log,
  });

  const reply = await svc.handleUserMessage(100, 'שלום');
  assert.equal(reply, 'שלום! איך אפשר לעזור?');
  assert.equal(log.entries.length, 1);
  assert.equal(log.entries[0].ok, true);
  assert.deepEqual(log.entries[0].tools, []);
  assert.equal(typeof log.entries[0].llm_ms, 'number');
  assert.equal(countMessages(db, 100), 2); // user + model persisted
  db.close();
});

// --- one tool round then an answer ----------------------------------------

test('dispatches a tool call to the real registry and feeds the result back', async () => {
  const db = seededDb();
  const log = captureLog();
  const generate = stubGenerate([
    { functionCalls: [{ name: 'search_products', args: { query: 'צבע קיר לבן' } }], text: undefined },
    { functionCalls: [], text: 'יש לנו צבע קיר לבן מט 5 ליטר ב-89 ₪, במלאי.' },
  ]);
  const svc = createLlmService({ db, generate, log });

  const reply = await svc.handleUserMessage(1, 'יש לכם צבע קיר לבן?');
  assert.match(reply, /89/);

  // The log recorded the tool call with a real result.
  const entry = log.entries[0];
  assert.equal(entry.tools.length, 1);
  assert.equal(entry.tools[0].name, 'search_products');
  assert.match(entry.tools[0].result, /צבע קיר לבן מט 5 ליטר/);
  assert.equal(typeof entry.tools[0].ms, 'number');
  assert.equal(entry.ok, true);

  // The 2nd model call actually received a functionResponse carrying the real search result.
  const secondCallContents = generate.seenContents[1];
  const fnResponsePart = secondCallContents
    .flatMap((c) => c.parts ?? [])
    .find((p) => p.functionResponse);
  assert.ok(fnResponsePart, 'expected a functionResponse part in the 2nd call');
  assert.equal(fnResponsePart.functionResponse.response.count, 1);
  db.close();
});

// --- unknown tool ---------------------------------------------------------

test('handles an unknown tool name with a structured error, without crashing', async () => {
  const db = seededDb();
  const log = captureLog();
  const generate = stubGenerate([
    { functionCalls: [{ name: 'do_magic', args: {} }], text: undefined },
    { functionCalls: [], text: 'סליחה, אפשר לעזור במידע על מוצרים ושעות פתיחה.' },
  ]);
  const svc = createLlmService({ db, generate, log });

  const reply = await svc.handleUserMessage(2, '???');
  assert.match(reply, /מוצרים/);
  assert.match(log.entries[0].tools[0].result, /unknown tool/);
  assert.equal(log.entries[0].ok, true); // the turn still completed
  db.close();
});

// --- failure fallbacks (SPEC §8) ------------------------------------------

test('returns the friendly apology when the model call throws', async () => {
  const db = seededDb();
  const log = captureLog();
  const generate = async () => {
    throw new Error('503 Service Unavailable');
  };
  const svc = createLlmService({ db, generate, log });

  const reply = await svc.handleUserMessage(3, 'שלום');
  assert.equal(reply, apologyMessage());
  assert.equal(log.entries[0].ok, false);
  assert.match(log.entries[0].error, /503/);
  assert.equal(countMessages(db, 3), 2); // still persisted user + apology
  db.close();
});

test('times out a slow model call and falls back to the apology', async () => {
  const db = seededDb();
  const log = captureLog();
  const generate = () => new Promise(() => {}); // never resolves
  const svc = createLlmService({ db, generate, log, timeoutMs: 20 });

  const reply = await svc.handleUserMessage(4, 'שלום');
  assert.equal(reply, apologyMessage());
  assert.equal(log.entries[0].ok, false);
  assert.equal(log.entries[0].error, 'timeout');
  assert.ok(log.entries[0].llm_ms > 0, 'llm_ms must count the latency of a timed-out call');
  db.close();
});

test('a tool that throws mid-turn yields a structured error; the turn still completes', async () => {
  const realDb = openDatabase(':memory:');
  // Proxy that makes any products query throw, while conversation-memory queries still work.
  const db = new Proxy(realDb, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql) =>
          sql.includes('FROM products')
            ? { all: () => { throw new Error('db boom'); }, get: () => { throw new Error('db boom'); } }
            : target.prepare(sql);
      }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  const log = captureLog();
  const generate = stubGenerate([
    { functionCalls: [{ name: 'search_products', args: { query: 'צבע' } }], text: undefined },
    { functionCalls: [], text: 'סליחה, לא הצלחתי לבדוק כרגע.' },
  ]);
  const svc = createLlmService({ db, generate, log });

  const reply = await svc.handleUserMessage(50, 'יש צבע?');
  assert.match(reply, /סליחה/);
  assert.match(log.entries[0].tools[0].result, /tool_failed/); // structured error to the model
  assert.equal(log.entries[0].ok, true); // the turn still completed
  realDb.close();
});

test('exceeding the tool-round cap falls back to the apology', async () => {
  const db = seededDb();
  const log = captureLog();
  // Always requests another tool call — never returns text.
  const generate = async () => ({
    functionCalls: [{ name: 'search_products', args: { query: 'צבע' } }],
    text: undefined,
  });
  const svc = createLlmService({ db, generate, log });

  const reply = await svc.handleUserMessage(60, 'לולאה אינסופית');
  assert.equal(reply, apologyMessage());
  assert.equal(log.entries[0].ok, false);
  assert.equal(log.entries[0].error, 'tool_loop_exceeded');
  assert.equal(log.entries[0].tools.length, 5); // capped at MAX_TOOL_ROUNDS
  db.close();
});

// --- memory across turns --------------------------------------------------

test('replays prior conversation history on the next turn', async () => {
  const db = seededDb();
  const log = captureLog();

  const gen1 = stubGenerate([{ functionCalls: [], text: 'תשובה ראשונה' }]);
  await createLlmService({ db, generate: gen1, log }).handleUserMessage(7, 'הודעה ראשונה');

  const gen2 = stubGenerate([{ functionCalls: [], text: 'תשובה שנייה' }]);
  await createLlmService({ db, generate: gen2, log }).handleUserMessage(7, 'הודעה שנייה');

  // The 2nd turn's contents should include the first user message and the first reply,
  // then the second user message.
  const texts = gen2.seenContents[0].flatMap((c) => (c.parts ?? []).map((p) => p.text));
  assert.deepEqual(texts, ['הודעה ראשונה', 'תשובה ראשונה', 'הודעה שנייה']);
  db.close();
});

test('does not leak history between different chats', async () => {
  const db = seededDb();
  const log = captureLog();

  await createLlmService({
    db,
    generate: stubGenerate([{ functionCalls: [], text: 'a' }]),
    log,
  }).handleUserMessage(10, 'chat-ten message');

  const genOther = stubGenerate([{ functionCalls: [], text: 'b' }]);
  await createLlmService({ db, generate: genOther, log }).handleUserMessage(20, 'chat-twenty message');

  const texts = genOther.seenContents[0].flatMap((c) => (c.parts ?? []).map((p) => p.text));
  assert.deepEqual(texts, ['chat-twenty message']); // no chat-10 content
  db.close();
});

// --- observability log shape (SPEC §8.2) ----------------------------------

test('emits exactly one structured log line per turn with the required fields', async () => {
  const db = seededDb();
  const log = captureLog();
  const generate = stubGenerate([
    { functionCalls: [{ name: 'get_store_info', args: { topic: 'hours' } }], text: undefined },
    { functionCalls: [], text: 'אנחנו פתוחים א׳-ה׳ 08:00-19:00.' },
  ]);
  const svc = createLlmService({ db, generate, log });

  await svc.handleUserMessage(42, 'מתי אתם פתוחים?');
  assert.equal(log.entries.length, 1);
  const entry = log.entries[0];
  assert.equal(entry.chat_id, 42);
  assert.equal(typeof entry.llm_ms, 'number');
  assert.equal(typeof entry.ok, 'boolean');
  assert.equal(entry.tools.length, 1);
  // args and result are truncated strings, never raw objects.
  assert.equal(typeof entry.tools[0].args, 'string');
  assert.equal(typeof entry.tools[0].result, 'string');
  db.close();
});

test('truncates long tool payloads in the log', async () => {
  const db = seededDb();
  const log = captureLog();
  const bigQuery = 'x'.repeat(500);
  const generate = stubGenerate([
    { functionCalls: [{ name: 'search_products', args: { query: bigQuery } }], text: undefined },
    { functionCalls: [], text: 'לא נמצא.' },
  ]);
  const svc = createLlmService({ db, generate, log });

  await svc.handleUserMessage(99, bigQuery);
  assert.ok(log.entries[0].tools[0].args.length <= 201); // 200 + ellipsis
  db.close();
});
