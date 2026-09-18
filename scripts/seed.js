// CLI: `npm run seed`. Reads data/products.csv and (re)seeds the products table.
// Thin wrapper — the real work lives in src/data/seed.js so it can be unit-tested.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadConfig } from '../src/config/env.js';
import { openDatabase } from '../src/data/db.js';
import { seedProducts } from '../src/data/seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(here, '..', 'data', 'products.csv');

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[seed] ${err.message}`);
    process.exit(1);
  }

  let csvText;
  try {
    csvText = readFileSync(CSV_PATH, 'utf8');
  } catch (err) {
    console.error(`[seed] could not read ${CSV_PATH}: ${err.message}`);
    process.exit(1);
  }

  const db = openDatabase(config.dbPath);
  const { inserted, skipped, total } = seedProducts(db, csvText, {
    log: (msg) => console.warn(`[seed] ${msg}`),
  });
  db.close();

  console.log(`[seed] ${total} data rows → inserted ${inserted}, skipped ${skipped}.`);
  console.log(`[seed] database: ${config.dbPath}`);
  if (inserted === 0) {
    console.warn('[seed] WARNING: no products inserted — the bot will find nothing.');
  }
}

main();
