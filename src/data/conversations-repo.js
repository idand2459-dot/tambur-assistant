// Conversation-memory queries (SPEC §6). All conversation SQL lives in the data layer
// (AGENTS §1). Per SPEC §6: keep per-chat history, load the last N messages as context,
// and prune messages older than the retention window.

/**
 * Return the most recent `limit` messages for a chat, in chronological order (oldest first)
 * so they can be replayed as conversation context.
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ role: string, content: string }>}
 */
export function getRecentMessages(db, chatId, limit) {
  const rows = db
    .prepare(
      'SELECT role, content FROM conversations WHERE chat_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    )
    .all(chatId, limit);
  return rows.reverse();
}

/** Append one message to a chat's history. */
export function addMessage(db, chatId, role, content, createdAt = Date.now()) {
  db.prepare(
    'INSERT INTO conversations (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)',
  ).run(chatId, role, content, createdAt);
}

/** Delete messages for a chat older than `retentionMs` before `nowMs` (SPEC §6 pruning). */
export function pruneOldMessages(db, chatId, retentionMs, nowMs = Date.now()) {
  db.prepare('DELETE FROM conversations WHERE chat_id = ? AND created_at < ?').run(
    chatId,
    nowMs - retentionMs,
  );
}

/** Delete a chat's entire history (used by /start and /reset in the bot layer, SPEC §6). */
export function clearChat(db, chatId) {
  db.prepare('DELETE FROM conversations WHERE chat_id = ?').run(chatId);
}
