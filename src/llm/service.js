// The LLM layer's conversation loop (SPEC §4 tool calling, §6 memory, §8 failures,
// §8.2 observability). It takes text in and returns the bot's Hebrew reply text out — it
// knows nothing about grammY. The Gemini `generate` function is injected so this whole
// module is unit-testable without touching the network.

import { createToolRegistry, toolDeclarations } from '../tools/index.js';
import {
  getRecentMessages,
  addMessage,
  pruneOldMessages,
} from '../data/conversations-repo.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { apologyMessage } from './messages.js';

const HISTORY_LIMIT = 10; // messages of context to load (SPEC §6)
const RETENTION_MS = 24 * 60 * 60 * 1000; // prune messages older than 24h (SPEC §6)
const LLM_TIMEOUT_MS = 20000; // per-call request timeout (SPEC §8)
const MAX_TOOL_ROUNDS = 5; // safety cap on tool round-trips per turn (prevents loops/cost)
const LOG_TRUNCATE = 200; // max chars per logged args/result (SPEC §8.2)

/**
 * Create the LLM service.
 * @param {{
 *   db: import('better-sqlite3').Database,
 *   generate: (req: object) => Promise<object>,
 *   systemPrompt?: string,
 *   timeoutMs?: number,
 *   now?: () => number,
 *   log?: (entry: object) => void,
 * }} deps
 */
export function createLlmService({
  db,
  generate,
  systemPrompt = SYSTEM_PROMPT,
  timeoutMs = LLM_TIMEOUT_MS,
  now = () => Date.now(),
  log = (entry) => console.log(JSON.stringify(entry)),
} = {}) {
  const tools = createToolRegistry(db);
  const geminiTools = [{ functionDeclarations: toolDeclarations }];
  const toolConfig = { functionCallingConfig: { mode: 'AUTO' } };

  /**
   * Handle one incoming customer message: load context, run the tool-calling loop, persist
   * memory, emit the per-turn log, and return the Hebrew reply.
   * @returns {Promise<string>}
   */
  async function handleUserMessage(chatId, userText) {
    const turnLog = { chat_id: chatId, llm_ms: 0, tools: [], ok: false };

    // --- memory: prune, then load recent history as context (SPEC §6) ---
    pruneOldMessages(db, chatId, RETENTION_MS, now());
    const contents = getRecentMessages(db, chatId, HISTORY_LIMIT).map(toContent);
    contents.push({ role: 'user', parts: [{ text: userText }] });

    let reply;
    try {
      reply = await runToolLoop(contents, turnLog);
      turnLog.ok = true;
    } catch (err) {
      turnLog.ok = false;
      turnLog.error = shortError(err);
      reply = apologyMessage(); // SPEC §8: friendly fallback, never crash
    }

    // --- memory: persist this turn (user message + the reply we actually sent) ---
    const t = now();
    addMessage(db, chatId, 'user', userText, t);
    addMessage(db, chatId, 'model', reply, t + 1);

    log(turnLog); // SPEC §8.2: exactly one structured line per turn
    return reply;
  }

  /** Run the model, dispatch any tool calls, feed results back, until a text answer. */
  async function runToolLoop(contents, turnLog) {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const startedAt = now();
      const response = await withTimeout(
        generate({ contents, systemInstruction: systemPrompt, tools: geminiTools, toolConfig }),
        timeoutMs,
      );
      turnLog.llm_ms += now() - startedAt;

      const calls = response.functionCalls ?? [];
      if (calls.length === 0) {
        return response.text ?? '';
      }

      // Echo back the model's ACTUAL content (preserves fields Gemini 3.x requires on the
      // functionCall parts, notably thought_signature), falling back to a reconstruction
      // when the response carries no candidate content (e.g. in stubbed unit tests).
      const modelContent = response.candidates?.[0]?.content ?? {
        role: 'model',
        parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args ?? {} } })),
      };
      contents.push(modelContent);

      const responseParts = [];
      for (const call of calls) {
        const toolStartedAt = now();
        const result = runTool(call);
        turnLog.tools.push({
          name: call.name,
          args: truncate(call.args ?? {}),
          result: truncate(result),
          ms: now() - toolStartedAt,
        });
        responseParts.push({ functionResponse: { name: call.name, response: result } });
      }
      contents.push({ role: 'user', parts: responseParts });
    }
    throw new Error('tool_loop_exceeded');
  }

  /** Dispatch one tool call, returning a structured result — or a structured error (SPEC §8). */
  function runTool(call) {
    const fn = tools[call.name];
    if (!fn) return { error: `unknown tool: ${call.name}` };
    try {
      return fn(call.args ?? {});
    } catch {
      return { error: 'tool_failed' };
    }
  }

  return { handleUserMessage };
}

// --- helpers --------------------------------------------------------------

function toContent(message) {
  return { role: message.role, parts: [{ text: message.content }] };
}

/** Reject if `promise` does not settle within `ms` (SPEC §8 timeout). */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Stringify + truncate for logs; keeps lines readable and avoids logging large payloads. */
function truncate(value, max = LOG_TRUNCATE) {
  let s;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s === undefined) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Short, secret-free error reason for the log. */
function shortError(err) {
  const msg = err && err.message ? err.message : String(err);
  return String(msg).slice(0, 120);
}
