# SPEC.md — Tambur Assistant

**Status:** Draft for approval. This document is the source of truth. No application code
is written until Idan approves this spec. If reality and this document disagree, this
document wins until it is edited.

---

## 1. Goal

A Telegram bot that answers free-text customer questions in Hebrew for **Technic Tambur**,
a neighborhood hardware and paint store in Petah Tikva. The bot uses a Large Language Model
(Google Gemini) that answers **only** by calling tools against a real product database. It
must never invent a product, a price, or a stock status.

Typical questions:
- "יש לכם צבע קיר לבן?" (do you have white wall paint?)
- "כמה עולה מברשת 5 ס״מ?" (how much is a 5cm brush?)
- "מתי אתם פתוחים?" (when are you open?)

### Non-goals (explicitly out of scope for this project)
- **Placing orders** of any kind.
- **Payments** or price quotes that function as a binding offer.
- **WhatsApp** or any channel other than Telegram.
- Inventory *management* (editing stock/prices from chat). The DB is read-only to the bot.
- Multi-store / multi-branch logic. One store, one dataset.
- Authentication, user accounts, or CRM.

---

## 2. Tech stack (decided)

| Concern            | Choice                                                                 |
|--------------------|------------------------------------------------------------------------|
| Runtime            | Node.js **22+** (LTS), ES modules (`"type": "module"`)                   |
| Telegram framework | **grammY**                                                             |
| Database           | **better-sqlite3** (synchronous, file-based)                           |
| LLM                | **Google Gemini** via the official **`@google/genai`** SDK             |
| Config             | **dotenv**                                                             |
| Tests              | **node:test** (`node --test`), no external test runner                 |

### SDK notes (verified against current official docs, Sep 2026)
- The official package is **`@google/genai`** (class `GoogleGenAI`). This is the unified
  *Google Gen AI SDK*. Do **not** use the older, deprecated `@google/generative-ai`
  (`GoogleGenerativeAI`) — most old tutorials show that one.
- **Node version:** this project targets Node **22 LTS**, so we install the **current**
  `@google/genai` (no pinning to an old release). `@google/genai` 3.0.0+ requires Node 22+,
  which we satisfy. `package.json` declares `engines.node >=22`.
- Core API shape we rely on:
  - `const ai = new GoogleGenAI({ apiKey })`
  - Single-shot: `ai.models.generateContent({ model, contents, config })`
  - Tools: `config.tools = [{ functionDeclarations: [...] }]`
  - Tool-call control: `config.toolConfig.functionCallingConfig.mode` = `AUTO` | `ANY` | `NONE`
  - Read tool calls from `response.functionCalls`; read text from `response.text`
  - Multi-turn + feeding tool results back: use the chat module
    (`ai.chats.create({ model, config, history })` → `chat.sendMessage(...)`).
- Model id is configurable via env (`GEMINI_MODEL`), default a current *flash* model
  (e.g. `gemini-2.5-flash`). Confirm the exact current flash id when wiring the LLM layer.

---

## 3. User stories & example conversations

All bot replies are in Hebrew. Examples below use `👤` for the customer and `🤖` for the bot.
(Product data shown is illustrative.)

### 3.1 Happy path — product exists
> 👤 יש לכם צבע קיר לבן?
> 🤖 כן. יש לנו **צבע קיר לבן מט 5 ליטר** במחיר 89 ₪, במלאי. רוצה שאבדוק גם גדלים אחרים?

*Bot behavior:* calls `search_products("צבע קיר לבן")`, answers only from the returned rows.

### 3.2 Price question
> 👤 כמה עולה מברשת 5 ס״מ?
> 🤖 **מברשת צביעה 5 ס״מ** עולה 12 ₪, במלאי.

### 3.3 Store hours (no product involved)
> 👤 מתי אתם פתוחים?
> 🤖 שעות הפעילות שלנו: א׳–ה׳ 08:00–19:00, ו׳ 08:00–14:00, שבת סגור. הכתובת: [כתובת]. טלפון: [טלפון].

*Bot behavior:* calls `get_store_info()`.

### 3.4 Product that does NOT exist (must not invent)
> 👤 יש לכם מקדחת בטון תעשייתית של בוש?
> 🤖 לא מצאתי פריט כזה אצלנו במאגר. יכול להיות שאנחנו מחזיקים משהו דומה — שווה להתקשר לחנות ל[טלפון] כדי לבדוק. רוצה שאחפש לפי מילה אחרת?

*Bot behavior:* `search_products` returns empty → bot explicitly says it wasn't found and
suggests calling the store. It never guesses a price or claims stock.

### 3.5 Vague question
> 👤 אני צריך משהו לצבוע את הסלון
> 🤖 בשמחה אעזור. תוכל לדייק? למשל: צבע קיר (איזה צבע/גימור), כמות (כמה ליטר), או אביזרים כמו מברשות ורולרים. מה מתוך אלה מעניין אותך?

*Bot behavior:* the question is too broad to search usefully → bot asks a clarifying
question instead of dumping the catalog or inventing an answer.

### 3.6 Out-of-scope / question the bot shouldn't answer
> 👤 אפשר להזמין ולשלם עכשיו בכרטיס אשראי?
> 🤖 אני יכול לעזור במידע על מוצרים, מחירים, זמינות ושעות פתיחה. הזמנות ותשלום לא מתבצעים דרך הצ׳אט — אפשר להתקשר לחנות ל[טלפון] או לבוא אלינו. אשמח לבדוק לך זמינות ומחיר של מוצר.

*Bot behavior:* recognizes ordering/payment is out of scope → politely redirects, offers
what it *can* do.

### 3.7 Follow-up that depends on the previous message (memory)
> 👤 יש לכם צבע קיר לבן?
> 🤖 כן, **צבע קיר לבן מט 5 ליטר**, 89 ₪, במלאי.
> 👤 וכמה עולה החמישה ליטר האפור?
> 🤖 **צבע קיר אפור מט 5 ליטר** עולה 89 ₪, במלאי.

*Bot behavior:* uses persisted conversation history so "the grey one" is understood in the
context of the paint discussion. May re-call `search_products` / `get_product_details`.

### 3.8 Nonsense / non-question input
> 👤 asdkjhaskjd
> 🤖 לא הבנתי את ההודעה. אפשר לשאול אותי על מוצרים, מחירים, זמינות או שעות פתיחה 🙂

---

## 4. Tools (the LLM's only way to get facts)

The model is instructed that **all product facts and store facts must come from tools**.
Three tools:

### 4.1 `search_products`
Find products by free-text query, optionally narrowed by category.

- **Parameters**
  - `query` (string, required) — free text, e.g. `"צבע קיר לבן"`, `"מברשת 5 ס״מ"`.
  - `category` (string, optional) — restrict to one category.
  - `limit` (integer, optional, default 5, max 10) — max rows to return.
- **Returns**
  ```json
  { "results": [
      { "id": 12, "name": "צבע קיר לבן מט 5 ליטר", "category": "צבעים",
        "price": 89, "in_stock": true }
  ], "count": 1 }
  ```
  Empty match → `{ "results": [], "count": 0 }`.
- **When the model calls it:** any question about whether a product exists, its price, or
  its availability, when the customer describes the product in words.
- **Matching algorithm (two-pass):** tokenize `query` on whitespace (drop empty tokens).
  1. **All-tokens pass:** return products whose `name`+`category` contains **every** token
     (case-insensitive substring per token). If any match, use these.
  2. **Partial fallback:** if the all-tokens pass is empty, match products that contain **at
     least one** token, and **rank** them by how many distinct tokens matched (descending),
     then by name. Return up to `limit`.

  This is why `"מברשת 5 ס״מ"` still finds `"מברשת צביעה 5 ס״מ"`: even if the exact phrase
  isn't a substring, the tokens `מברשת`, `5`, `ס״מ` are, so the all-tokens pass matches.
  The fallback covers noisier queries where not all tokens are present.

### 4.2 `get_product_details`
Fetch one specific product by id (used mainly for follow-ups referencing an item already
mentioned).

- **Parameters**
  - `product_id` (integer, required).
- **Returns**
  ```json
  { "found": true,
    "product": { "id": 12, "name": "צבע קיר לבן מט 5 ליטר",
                 "category": "צבעים", "price": 89, "in_stock": true } }
  ```
  Unknown id → `{ "found": false }`.
- **When the model calls it:** a follow-up that refers to a specific product from earlier in
  the conversation, when the id is known from a prior `search_products` result.

### 4.3 `get_store_info`
Return static store facts (hours, address, phone, and general info).

- **Parameters**
  - `topic` (string, optional) — one of `hours` | `address` | `phone` | `general`.
    Omitted → return all.
- **Returns**
  ```json
  { "hours": "א׳–ה׳ 08:00–19:00, ו׳ 08:00–14:00, שבת סגור",
    "address": "[כתובת מלאה, פתח תקווה]",
    "phone": "[טלפון]",
    "general": "חנות חומרי בניין וצבע שכונתית" }
  ```
- **When the model calls it:** questions about opening hours, location, phone, or how to
  reach the store.

> Store-info values are static configuration (see §7), not product data. Idan fills in the
> real address/phone/hours before launch.

---

## 5. System-prompt principles

The system prompt (Hebrew) instructs the model to:

1. **Language & tone:** answer in Hebrew, friendly and concise, like a helpful shop
   assistant. No emojis-spam; at most light, natural use.
2. **Never invent data:** product names, prices, categories, and stock status come **only**
   from tool results. If a fact wasn't returned by a tool, the bot does not state it.
3. **Say when something isn't found:** if `search_products` returns nothing, tell the
   customer plainly that the item wasn't found in our catalog — do not guess a substitute's
   price or stock.
4. **Suggest calling the store** when: the item isn't found, the customer asks something the
   tools can't answer, or they want to order/pay (out of scope). Provide the store phone
   (from `get_store_info`).
5. **Stay in scope:** the bot answers about products (existence, price, availability) and
   store info (hours/address/phone). It does not take orders, process payments, give
   professional trade advice it can't ground, or discuss unrelated topics.
6. **Ask to clarify** vague requests instead of guessing.
7. **Prices** are stated in shekels (₪) exactly as stored; the bot does not compute totals,
   discounts, or taxes.
8. **Don't expose internals:** no tool names, ids, SQL, or "as an AI" talk to the customer.

The exact prompt text lives in one module (`src/llm/system-prompt.js`) so it is reviewable
and version-controlled. **Ownership:** Stage 4 ships a *first draft* of this prompt; the
wording is **Idan's to edit**. We keep the prompt isolated in this one module precisely so
Idan can rewrite it in his own words and we can compare bot behaviour before/after (the
per-turn logs in §8.2 make that comparison observable).

---

## 6. Conversation memory

- **Persisted in SQLite** (survives restarts), scoped **per Telegram chat** (`chat_id`).
- **What is kept:** the role (`user` / `model`) and text of each turn, plus a timestamp.
  Tool calls/results are **not** persisted as history — only the user messages and the
  bot's final text replies. (Tool round-trips happen fresh each turn.)
- **How much:** on each turn, load the **last 10 messages** for that chat as context.
- **Retention / cleanup:** messages older than **24 hours** are pruned (a customer chat is
  a short session). Pruning runs opportunistically on each incoming message for that chat.
- **Reset:** a `/start` (or `/reset`) command clears that chat's stored history.
- **Isolation:** one chat never sees another chat's history.

---

## 7. Configuration & secrets

- All secrets via environment variables loaded by `dotenv`. **No secrets in code or git.**
- `.env.example` (committed) documents required vars; `.env` (git-ignored) holds real values.

| Var              | Purpose                                | Example                 |
|------------------|----------------------------------------|-------------------------|
| `BOT_TOKEN`      | Telegram bot token (from BotFather)    | `123456:ABC...`         |
| `GEMINI_API_KEY` | Google Gemini API key                  | `AIza...`               |
| `GEMINI_MODEL`   | Model id (optional, has default)       | `gemini-2.5-flash`      |
| `DB_PATH`        | SQLite file path (optional, default)   | `./data/tambur.db`      |
| `RATE_LIMIT_MS`  | Per-chat throttle window (optional)    | `2000`                  |

- **Store info** (hours/address/phone) lives in a committed config file
  `src/config/store-info.js` (or `data/store-info.json`) with placeholder values Idan
  replaces. It is not a secret.
- On startup, the app validates that required env vars are present and exits with a clear
  Hebrew/English error if not.

---

## 8. Failure behaviour

| Situation                     | Behaviour                                                                                   |
|-------------------------------|--------------------------------------------------------------------------------------------|
| **LLM API down / error**      | Catch, log server-side, reply in Hebrew: "מצטער, יש כרגע תקלה זמנית. נסו שוב עוד רגע או התקשרו לחנות ל[טלפון]." Never crash the bot. |
| **LLM timeout**               | Apply a request timeout (e.g. 20s). On timeout, same friendly message as above.            |
| **Tool/DB error**             | Tool returns a structured error to the model; if unrecoverable, bot gives the generic apology + phone. |
| **Empty DB / no products**    | `search_products` returns `count: 0`; bot says the item wasn't found and suggests calling. Startup logs a warning if the products table is empty. |
| **Bad user input** (empty, emoji-only, gibberish, non-Hebrew) | Bot asks the customer to rephrase; never errors out. Non-text messages (photos, stickers, voice) get a short "אני יכול לקרוא רק טקסט" reply. |
| **Message too long**          | Truncate overly long inputs defensively; rely on grammY defaults otherwise.                |
| **Burst / rate limit**        | Per-chat throttle (§8.1). Extra messages inside the window get a friendly Hebrew reply and are not sent to Gemini. |
| **Missing env var at startup**| Fail fast with a clear message before the bot starts polling.                              |

All failures are **logged** (server-side) with enough context to debug, without leaking
secrets.

### 8.1 Rate limiting (per chat)

To protect the Gemini free-tier quota from bursts, each Telegram chat is limited to **one
processed message every 2 seconds** (configurable). Implementation: keep the last-processed
timestamp per `chat_id` (in-memory Map is fine — this is soft protection, not billing).

- If a message arrives within the window, the bot does **not** call Gemini. It replies once
  with a short friendly Hebrew message, e.g.:
  > רגע אחד 🙂 אני עדיין מטפל בהודעה הקודמת. נסה שוב עוד רגע.
- To avoid spamming a rapid-fire sender, send the throttle notice at most once per window
  per chat (drop further messages silently until the window clears).
- The window length is a constant/config value (`RATE_LIMIT_MS`, default 2000).

### 8.2 Observability — per-turn structured log

For **every** turn the bot processes, emit **one structured log line** (e.g. a JSON object
via `console.log`) capturing what happened. No secrets, no full message bodies of the user
if that risks PII — keep it operational. Fields:

| Field          | Meaning                                                              |
|----------------|---------------------------------------------------------------------|
| `chat_id`      | Telegram chat id                                                     |
| `llm_ms`       | Total latency of the LLM call(s) for the turn, in ms                 |
| `tools`        | Array, one entry per tool call the model made, each with:            |
| → `name`       | tool name (`search_products` / `get_product_details` / `get_store_info`) |
| → `args`       | the arguments the model passed (truncated if long)                   |
| → `result`     | the tool's return, **truncated** (e.g. first ~200 chars / row count) |
| → `ms`         | that tool's execution latency in ms                                  |
| `ok`           | `true` if the turn produced a reply, `false` on error/fallback       |
| `error`        | short error reason when `ok` is false (no stack, no secrets)         |

- If the model called no tools, `tools` is an empty array.
- Truncation keeps lines readable and avoids logging large payloads or secrets.
- One line per turn makes it greppable and easy to eyeball during the before/after
  system-prompt comparison.

---

## 9. Data model

### 9.1 `products` table (simpler schema — decided)

| Column     | Type    | Notes                                             |
|------------|---------|---------------------------------------------------|
| `id`       | INTEGER | PRIMARY KEY                                       |
| `name`     | TEXT    | NOT NULL. Hebrew, descriptive (size/color in name, e.g. "מברשת צביעה 5 ס״מ") |
| `category` | TEXT    | NOT NULL. e.g. "צבעים", "מברשות", "כלי עבודה"       |
| `price`    | REAL    | NOT NULL. Shekels (₪).                            |
| `in_stock` | INTEGER | NOT NULL. 0 or 1 (SQLite boolean).                |

- Because color/size live inside `name`, `search_products` matches on `name` (and
  `category`) using case-insensitive substring / `LIKE`, with the **two-pass tokenized**
  matching described in §4.1 (all-tokens first, then partial-match ranked by token count).
  Keep it simple; no FTS required for this phase (may note FTS5 as a future option, not
  built now).

### 9.2 `conversations` table (memory)

| Column     | Type    | Notes                                    |
|------------|---------|------------------------------------------|
| `id`       | INTEGER | PRIMARY KEY AUTOINCREMENT                 |
| `chat_id`  | INTEGER | NOT NULL, indexed                        |
| `role`     | TEXT    | `'user'` or `'model'`                     |
| `content`  | TEXT    | NOT NULL                                 |
| `created_at`| INTEGER| Unix ms, NOT NULL                        |

Index on `(chat_id, created_at)` for fast recent-history lookups and pruning.

### 9.3 Seeding from CSV

- A committed `data/products.csv` with header `name,category,price,in_stock` and a handful
  of realistic sample rows (paints, brushes, rollers, tape, etc.) covering the example
  conversations.
- A seed script (`npm run seed` → `scripts/seed.js`) reads the CSV, validates each row
  (name/category non-empty, price is a number, `in_stock` is 0/1), and inserts into
  `products`. `id` is assigned by the DB (auto). Seeding is **idempotent**: it clears and
  re-inserts products, so re-running gives a clean known state (documented behaviour).
- Malformed CSV rows are skipped with a logged warning; the script reports how many rows
  were inserted vs skipped.

---

## 10. Acceptance criteria (testable checklist)

Verifiable at the end of the project. Each is phrased so it can be checked (many by
automated `node:test`, some by a short manual chat).

**Data & tools**
- [ ] `npm run seed` populates `products` from `data/products.csv` and is idempotent
      (running twice yields the same row count).
- [ ] `search_products` returns matching rows for a query present in the seed data.
- [ ] `search_products` returns `count: 0` (not an error) for a query with no match.
- [ ] `search_products` respects the `category` filter and the `limit` (default 5, max 10).
- [ ] `search_products` **all-tokens pass**: `"מברשת 5 ס״מ"` finds `"מברשת צביעה 5 ס״מ"`.
- [ ] `search_products` **partial fallback**: a query where not all tokens match still
      returns partial matches, ranked by number of tokens matched.
- [ ] `get_product_details` returns the product for a valid id and `{ found: false }` for
      an unknown id.
- [ ] `get_store_info` returns hours/address/phone from config.

**LLM behaviour**
- [ ] For "יש לכם צבע קיר לבן?", the bot's answer contains only a name/price/stock that
      exists in the DB (no invented product).
- [ ] For a product not in the DB, the bot explicitly says it wasn't found and suggests
      calling the store — and states no price/stock.
- [ ] For an ordering/payment request, the bot declines in scope-appropriate Hebrew and
      redirects to the store.
- [ ] For a vague request, the bot asks a clarifying question rather than guessing.
- [ ] A follow-up referencing "the grey one" is answered using prior conversation context.

**Memory**
- [ ] Conversation turns are persisted per `chat_id` and reloaded on the next message.
- [ ] `/start` (or `/reset`) clears that chat's history.
- [ ] Messages older than 24h are pruned.
- [ ] Two different chats never share history.

**Resilience**
- [ ] When the Gemini call throws/times out, the bot replies with the friendly apology and
      does not crash.
- [ ] With an empty products table, the bot answers "not found" gracefully.
- [ ] Non-text messages get the "text only" reply.
- [ ] Missing `BOT_TOKEN` or `GEMINI_API_KEY` causes a clear fail-fast at startup.
- [ ] A second message within `RATE_LIMIT_MS` from the same chat is throttled (friendly
      Hebrew reply, no Gemini call).

**Observability**
- [ ] Every processed turn emits exactly one structured log line with `chat_id`, `llm_ms`,
      the `tools` array (name/args/truncated result/ms per call), and `ok`/`error`.
- [ ] Log lines contain no secrets and truncate large payloads.

**Hygiene**
- [ ] No secrets committed; `.env` is git-ignored; `.env.example` documents all vars.
- [ ] All tests pass with `node --test`.
- [ ] Telegram, LLM, tools, and data layers are in separate modules (see AGENTS.md).

---

## 11. Build stages

Each stage is small (target < 1 hour) and ends with: **tests passing, a git commit, and a
short plain-language explanation to Idan** (per AGENTS.md). No feature outside this spec.

### Stage 1 — Skeleton & config
- `git init`; `package.json` (`"type": "module"`, `engines.node >=22`, scripts:
  `test`, `seed`, `start`); folder structure; `.gitignore`; `.env.example`.
- Install deps, using the **current `@google/genai`** (Node 22 target — no pinning).
- `src/config/` — load & validate env via dotenv; `store-info.js` with placeholders.
- **Tests:** config loads defaults; throws/fails clearly when a required var is missing.

### Stage 2 — Data layer
- `src/data/db.js` — open better-sqlite3, create `products` + `conversations` tables and
  indexes (idempotent migration).
- `data/products.csv` sample data + `scripts/seed.js` (`npm run seed`), idempotent, with
  row validation and a summary log.
- **Tests:** tables created; seeding inserts expected rows; re-seed is idempotent; bad rows
  skipped.

### Stage 3 — Tools layer
- `src/tools/` — pure functions `searchProducts`, `getProductDetails`, `getStoreInfo`
  against the DB/config, plus their Gemini `functionDeclarations` (name, description,
  parameters) in one place.
- **Tests:** each tool's happy path, empty/`found:false` path, `limit`/`category` behaviour,
  and **both `search_products` passes** (all-tokens match + partial-match fallback ranking).

### Stage 4 — LLM layer
- `src/llm/` — `GoogleGenAI` client wrapper (pinned SDK), `system-prompt.js`, and the
  chat/tool-calling loop: send user message + last-10 history, dispatch any
  `functionCalls` to the tools layer, feed results back, return final Hebrew text.
  Request timeout + error handling per §8. Read/write memory via the data layer.
  Emit the **per-turn observability log line** (§8.2): tools called + args + truncated
  results + per-tool latency + `llm_ms` + `ok`/`error`.
- **Tests:** with the Gemini client **stubbed**, verify tool dispatch routes to the right
  tool, that a "not found" tool result yields a not-found answer path, and that an
  API error/timeout produces the friendly fallback (no throw).

### Stage 5 — Telegram layer
- `src/bot/` — grammY bot: on text message → LLM layer → reply; `/start` & `/reset` clear
  memory; non-text handler; per-chat memory wiring; **per-chat rate limit** (§8.1) with the
  friendly Hebrew throttle reply; top-level error handler.
- `src/index.js` — startup: validate env, init DB, warn if products empty, start (long
  polling for dev).
- **Tests:** message handler unit-tested with a fake grammY context (stubbed LLM layer).
- **Manual:** run against a real test bot and try §3 conversations.

### Stage 6 — Hardening & acceptance
- Walk the §10 acceptance checklist; add any missing edge-case tests (empty DB, bad input,
  API down). Short `README.md` (setup, env, seed, run). Final pass that no out-of-spec
  feature crept in.
- **Deliverable:** all acceptance criteria checked or explicitly noted.

---

## 12. Open questions / to confirm before/at build time
- Exact current Gemini *flash* model id to default `GEMINI_MODEL` to (confirm when wiring
  Stage 4).
- Real store hours, address, and phone for `store-info` (Idan provides before launch).
- Real product data / CSV (sample data used until then).
