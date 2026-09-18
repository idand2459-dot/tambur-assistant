// Entry point.
//
// Stage 1: load environment (via dotenv) and validate configuration, failing fast with a
// clear message if anything required is missing. Later stages wire the database, the LLM
// layer, and the grammY Telegram bot here.

import 'dotenv/config';
import { loadConfig } from './config/env.js';

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[startup] ${err.message}`);
    process.exit(1);
  }

  console.log(
    `[startup] Config OK. model=${config.geminiModel} db=${config.dbPath} ` +
      `rateLimitMs=${config.rateLimitMs}. (Bot not started yet — Stage 1 skeleton.)`,
  );
}

main();
