# Tambur Assistant

A Telegram customer-service bot (in Hebrew) for **Technic Tambur**, a neighborhood hardware
and paint store in Petah Tikva. Customers ask free-text questions ("do you have white wall
paint?", "how much is a 5cm brush?", "when are you open?") and an LLM (Google Gemini) answers
**only** by calling tools against a real product database — it never invents a product, a
price, or a stock status.

- **What it does / does not do, the tools, memory, failure behaviour, acceptance criteria:**
  see [SPEC.md](./SPEC.md) — the source of truth.
- **How to contribute (code standards, layer separation, the review checklist):** see
  [AGENTS.md](./AGENTS.md).

## Requirements

- **Node.js 22+** (developed on Node 24).
- A **Telegram bot token** from [BotFather](https://t.me/BotFather).
- A **Google Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey).

## Setup

```bash
npm install
cp .env.example .env      # then fill in BOT_TOKEN and GEMINI_API_KEY
npm run seed              # load sample products from data/products.csv into the SQLite DB
npm start                 # start the bot (long polling)
```

Run the tests with:

```bash
npm test
```

## Configuration

Configuration is via environment variables (loaded from `.env`, which is git-ignored). See
[.env.example](./.env.example) for the full list. Required: `BOT_TOKEN`, `GEMINI_API_KEY`.
Optional: `GEMINI_MODEL`, `DB_PATH`, `RATE_LIMIT_MS`.

## Model & quota

- **Default model: `gemini-3.5-flash-lite`** (override with `GEMINI_MODEL`).
- **Free-tier limit: 15 requests/minute** — verified directly from the API's quota metadata
  (`GenerateRequestsPerMinutePerProjectPerModel-FreeTier`, value 15). The per-day cap was not
  the binding constraint in testing, so the free tier is workable for a small store. The
  per-chat rate limit (`RATE_LIMIT_MS`, default 2s) further protects the quota from bursts.
- **Why not others:** `gemini-2.5-flash` and `gemini-2.5-flash-lite` are **retired for new
  keys** (404). `gemini-3.5-flash` works but its free tier is only **20 requests/day** — too
  low for a live bot. For higher throughput, raise the model or enable billing and set
  `GEMINI_MODEL` accordingly.

## Notes / known behaviour

- **Grounding works (evidence, not a bug).** When asked opening hours, the model returned
  only what `get_store_info` provided and **ignored** the fuller hours written in the system
  prompt's own example. This is the "never invent — facts come only from tools" rule (SPEC
  §5) working as intended: the tool is the single source of truth, and the store's hours are
  therefore edited in [src/config/store-info.js](./src/config/store-info.js), not in the
  prompt.
- Store details (hours, address, phone) live in `src/config/store-info.js` — update them
  there.

## Project layout

```
src/
  config/   env loading & validation, static store info
  data/     SQLite access — the only place that runs SQL (db, repos, CSV seeding)
  tools/    the 3 tools + their Gemini function declarations
  llm/      Gemini client, system prompt, the tool-calling loop, memory use
  bot/      grammY Telegram layer (handlers, rate limiter, messages)
  index.js  entry point
test/       node:test suites
data/       products.csv (sample data) and the generated SQLite DB (git-ignored)
scripts/    seed.js
```
