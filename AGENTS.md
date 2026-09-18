# AGENTS.md — How any agent works in the Tambur Assistant repo

This file governs how **any** agent (or human) contributes to this repository. It sits
beside [SPEC.md](./SPEC.md), which is the source of truth for *what* we build. This file is
about *how* we build it.

---

## 0. The one hard rule

**No feature that isn't in SPEC.md.**

If something seems missing, wrong, or ambiguous in the spec, **stop and ask Idan** — do not
build it, do not "improve" it, do not add a nice-to-have. Raise the gap in plain language,
propose an option if you have one, and wait for a decision. When Idan agrees, the change
goes into SPEC.md **first**, then into code. The spec leads; the code follows.

---

## 1. Code standards

- **ES modules only.** `"type": "module"` in `package.json`; use `import`/`export`, never
  `require`.
- **Node 22 (LTS).** Target Node 22; `engines.node >=22`. We use the **current**
  `@google/genai` (no pinning to an old version).
- **Small files, one job each.** If a file does two unrelated things, split it. Prefer many
  short modules over a few long ones.
- **No secrets in code.** Ever. Secrets come from environment variables via `dotenv`. `.env`
  is git-ignored; `.env.example` documents every variable. No tokens, keys, phone numbers-
  as-secrets, or credentials in source or in commits.
- **Clear layer separation.** Each layer only talks to its neighbors through plain
  functions/values — no layer reaches around another:

  ```
  Telegram layer  (src/bot/)     grammY handlers, Telegram-specific glue only
        │  calls
  LLM layer       (src/llm/)     Gemini client, system prompt, tool-calling loop, memory use
        │  calls
  Tools layer     (src/tools/)   the 3 tools as pure functions + their functionDeclarations
        │  calls
  Data layer      (src/data/)    better-sqlite3 access; the ONLY place that runs SQL
  Config          (src/config/)  env loading/validation, store-info
  ```

  - The **Telegram layer** knows nothing about SQL or Gemini internals.
  - The **LLM layer** knows nothing about grammY; it takes text + chat id, returns text.
  - The **Tools layer** contains no Telegram or LLM code — just data in, structured data out.
  - The **Data layer** is the only place that touches the database / runs SQL.
- **Pure and testable where possible.** Tools and helpers take inputs and return values so
  they can be unit-tested without a network or a live bot.
- **Naming & style:** match the existing code in the repo (comment density, naming, idiom).
  Descriptive names; comments explain *why*, not *what*.
- **Error handling:** never let a customer message crash the process. Catch at the
  boundaries per SPEC §8 and reply gracefully in Hebrew.
- **Logging:** log server-side with enough context to debug; never log secrets or full API
  keys.

---

## 2. Definition of done for every stage

A stage is **not done** until all three are true:

1. **Tests pass** — `node --test` is green. New behaviour in the stage has tests.
2. **A git commit** — one focused commit for the stage, with a clear message referencing the
   stage (e.g. `Stage 3: tools layer (search/details/store-info)`). Do not commit `.env`,
   `node_modules`, or the SQLite db file.
3. **A short plain-language explanation to Idan** — a few sentences: what this stage does,
   what he can now see/try, anything he needs to decide, and confirmation that tests pass.
   No jargon dumps.

> Commit and push only when the work of the stage is complete and tests pass. Start each
> stage on the agreed branch; don't force-push or rewrite shared history.

---

## 3. Working rhythm per stage

1. Re-read the relevant SPEC.md section for the stage.
2. If anything is unclear or seems missing → **ask** (rule §0). Don't guess.
3. Implement the smallest thing that satisfies the spec for that stage.
4. Write/like update tests; run `node --test` until green.
5. Run the **review checklist** (§4) against the change.
6. Commit.
7. Write Idan the short explanation.

---

## 4. Reviewer checklist (run against SPEC.md after each stage)

A reviewer agent (or the author, self-reviewing) checks every item before the stage is
accepted. Answer each with yes / no / N/A and a one-line note.

**Scope & spec fidelity**
- [ ] Does the change implement **only** what SPEC.md describes for this stage — nothing extra?
- [ ] If anything deviates from the spec, was it raised with Idan and the spec updated first?
- [ ] Are the tool names, parameters, and return shapes exactly as in SPEC §4?
- [ ] Does the data model match SPEC §9 (columns, types, indexes)?

**Never-invent guarantee**
- [ ] Do all product/store facts flow from tools/DB only (no hard-coded product data in the
      LLM or bot layers)?
- [ ] Does a "not found" path clearly tell the customer and suggest the store, without a
      guessed price/stock?

**Architecture**
- [ ] Are the layers separated as in §1 (no SQL outside the data layer; no grammY in the LLM
      layer; no Gemini in the tools/data layers)?
- [ ] Are files small and single-purpose?
- [ ] ES modules throughout; Node 22 target; using the current `@google/genai`?

**Safety & hygiene**
- [ ] No secrets in code or in the commit; `.env` git-ignored; `.env.example` current?
- [ ] Startup validates required env vars (fail-fast)?
- [ ] Failure paths from SPEC §8 handled (API down/timeout, empty DB, bad input) without
      crashing?
- [ ] Per-chat **rate limit** (SPEC §8.1) enforced with the friendly Hebrew throttle reply?

**Observability**
- [ ] Every processed turn emits one structured log line (SPEC §8.2) with `chat_id`,
      `llm_ms`, the `tools` array (name/args/truncated result/ms), and `ok`/`error`?
- [ ] Log lines carry no secrets and truncate large payloads?

**Quality**
- [ ] `node --test` passes; new behaviour is covered by tests?
- [ ] Relevant acceptance criteria (SPEC §10) for this stage are satisfiable/checked?
- [ ] Commit message is clear and references the stage; Idan's explanation written?

If any box is "no", the stage goes back to the author before acceptance.

---

## 5. Language & communication with Idan
- Explanations to Idan are in plain language (he's a junior dev — clear over clever).
- Bot-facing text is Hebrew (SPEC §5); code, comments, commits, and docs are in English.
- When raising a spec gap, state: what you expected, what's missing/unclear, and 1–2 options.
