// Entry point (SPEC §11 Stage 5). Validate config (fail fast), open and check the DB,
// wire the LLM and Telegram layers, and start long polling.

import 'dotenv/config';

import { loadConfig } from './config/env.js';
import { openDatabase } from './data/db.js';
import { countProducts } from './data/products-repo.js';
import { createGeminiClient } from './llm/gemini-client.js';
import { createLlmService } from './llm/service.js';
import { createBot } from './bot/bot.js';

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[startup] ${err.message}`);
    process.exit(1);
  }

  let bot;
  try {
    const db = openDatabase(config.dbPath);
    const products = countProducts(db);
    if (products === 0) {
      console.warn('[startup] WARNING: the products table is empty — run `npm run seed`. The bot will find no products.');
    }
    const gemini = createGeminiClient(config);
    const llmService = createLlmService({ db, generate: gemini.generate });
    bot = createBot({ config, db, llmService });
    console.log(`[startup] Tambur Assistant starting. model=${config.geminiModel} products=${products}`);
  } catch (err) {
    console.error(`[startup] initialization failed: ${err?.message ?? err}`);
    process.exit(1);
  }

  bot.start({ onStart: (me) => console.log(`[startup] connected as @${me.username}`) }).catch((err) => {
    console.error(`[startup] failed to start bot: ${err?.message ?? err}`);
    process.exit(1);
  });
}

main();
