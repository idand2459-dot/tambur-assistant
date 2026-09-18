import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase } from '../src/data/db.js';
import { addMessage, getRecentMessages, pruneOldMessages } from '../src/data/conversations-repo.js';

test('getRecentMessages returns the last N messages in chronological order (SPEC §6)', () => {
  const db = openDatabase(':memory:');
  for (let i = 1; i <= 15; i++) addMessage(db, 1, i % 2 ? 'user' : 'model', `m${i}`, 1000 + i);
  const recent = getRecentMessages(db, 1, 10);
  assert.equal(recent.length, 10);
  assert.equal(recent[0].content, 'm6'); // oldest of the last 10
  assert.equal(recent[9].content, 'm15'); // newest
  db.close();
});

test('pruneOldMessages deletes messages older than the 24h window (SPEC §6)', () => {
  const db = openDatabase(':memory:');
  const now = 1_000_000_000;
  const DAY = 24 * 60 * 60 * 1000;
  addMessage(db, 1, 'user', 'old', now - DAY - 1); // older than 24h
  addMessage(db, 1, 'user', 'fresh', now - 1000); // recent
  pruneOldMessages(db, 1, DAY, now);
  const rows = db.prepare('SELECT content FROM conversations WHERE chat_id = 1').all().map((r) => r.content);
  assert.deepEqual(rows, ['fresh']);
  db.close();
});
