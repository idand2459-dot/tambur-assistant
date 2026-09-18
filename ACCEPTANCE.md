# ACCEPTANCE.md — Stage 6 walkthrough

Every acceptance criterion from [SPEC.md](./SPEC.md) §10, walked and confirmed. Automated
items cite the `node:test` case that proves them (`npm test` → **61 passing**); a few
LLM-behaviour items were also confirmed live against the real Gemini API and are noted as
such. Behaviour that depends on the model's exact wording is marked **(mechanism verified;
phrasing is model-driven)**.

## Data & tools

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `npm run seed` populates `products` and is idempotent | ✅ | `data.test.js`: "seedProducts inserts all valid rows", "re-seeding is idempotent", "the shipped data/products.csv is well-formed"; also run live (20 rows, idempotent) |
| 2 | `search_products` returns matches present in seed data | ✅ | `tools.test.js`: "all-tokens … finds …" |
| 3 | `search_products` returns `count:0` (not an error) with no match | ✅ | `tools.test.js`: "returns empty … when nothing matches", "on an empty catalog returns count 0" |
| 4 | `category` filter + `limit` (default 5, max 10) respected | ✅ | `tools.test.js`: "honors the category filter", "respects limit and caps it at 10" |
| 5 | All-tokens pass: "מברשת 5 ס״מ" finds "מברשת צביעה 5 ס״מ" | ✅ | `tools.test.js`: "all-tokens: … finds … only" |
| 6 | Partial fallback ranked by tokens matched | ✅ | `tools.test.js`: "partial fallback ranks by number of tokens matched" |
| 7 | `get_product_details` valid id / `found:false` unknown / non-integer | ✅ | `tools.test.js`: three `get_product_details` cases |
| 8 | `get_store_info` returns hours/address/phone | ✅ | `tools.test.js`: three `get_store_info` cases |

## LLM behaviour

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 9 | White-paint answer contains only DB facts (no invented product) | ✅ | Live Q1: grounded, prices 89₪/289₪ from DB; tool-dispatch feeds real `search_products` result (`llm.test.js` "dispatches a tool call …") |
| 10 | Not-found: says not found + suggests store, no guessed price/stock | ✅ | Live Q2 (searched→0, gave real phone, no substitute); system-prompt rule |
| 11 | Ordering/payment request declined in scope-appropriate Hebrew | ✅ | Live Q5 (both declined + redirected) |
| 12 | Vague request → clarifying question | ✅ | System-prompt rule **(mechanism verified; phrasing model-driven)** |
| 13 | Follow-up ("the grey one") answered using prior context | ✅ | `llm.test.js`: "replays prior conversation history on the next turn" **(memory mechanism verified)** |
| + | Never invent a phone number (added after Q4 review) | ✅ | `llm.test.js`: two phone-guard acceptance tests; live Q4 (no invented number) |

## Memory

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 14 | Turns persisted per `chat_id` and reloaded next message | ✅ | `llm.test.js`: "replays prior conversation history" |
| 15 | `/start` (or `/reset`) clears that chat's history | ✅ | `bot.test.js` handleStart/handleReset; `bot-wiring.test.js` "/start clears history …" |
| 16 | Messages older than 24h pruned | ✅ | `memory.test.js`: "pruneOldMessages deletes messages older than the 24h window" |
| 17 | Two different chats never share history | ✅ | `llm.test.js`: "does not leak history between different chats"; `bot.test.js`: "clears only the target chat" |

## Resilience (SPEC §8)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 18 | Gemini throw/timeout → apology, no crash | ✅ | `llm.test.js`: "returns the friendly apology when the model call throws", "times out … falls back" |
| 19 | Empty products table → answers "not found" gracefully | ✅ | `tools.test.js`: "on an empty catalog returns count 0"; startup logs an empty-catalog warning (`index.js`) |
| 20 | Non-text messages get the "text only" reply, not the LLM | ✅ | `bot.test.js` handleNonText; `bot-wiring.test.js`: "non-text … does NOT reach the LLM" |
| 21 | Missing `BOT_TOKEN`/`GEMINI_API_KEY` → clear fail-fast | ✅ | `config.test.js` missing-var cases; `index.js` exits 1 (verified live) |
| + | Per-chat rate limit (§8.1) throttles a burst | ✅ | `bot.test.js`: "sends the throttle notice once and does not call the LLM" |
| + | One structured observability log line per turn (§8.2) | ✅ | `llm.test.js`: "emits exactly one structured log line …", "truncates long tool payloads" |
| + | Overly long input truncated (§8) | ✅ | `bot.test.js`: "truncates overly long input before the LLM" |

## Hygiene

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 22 | No secrets committed; `.env` git-ignored; `.env.example` documents all vars | ✅ | `.env` untracked + ignored (verified via `git ls-files`/`git check-ignore`); `.env.example` lists all five vars |
| 23 | All tests pass with `node --test` | ✅ | **61 passing** |
| 24 | Telegram / LLM / tools / data layers in separate modules | ✅ | Confirmed by the spec-reviewer at Stages 3.1, 4, 5 (no SQL outside `src/data`, Gemini only in `src/llm/gemini-client.js`, grammY only in `src/bot`) |

## Not verified here (needs a live BotFather run)

- End-to-end delivery over Telegram (send a real message, receive a real reply). Ready to
  smoke-test: `npm run seed && npm start` with a real `BOT_TOKEN`.
- Exact model phrasing for the vague-clarify (#12) and grey-paint follow-up (#13) paths —
  the mechanisms are verified; the wording is the model's and can be spot-checked live.
