// Tools layer entry point. Bundles the three tools behind a name→function registry so the
// LLM layer (Stage 4) can dispatch a model function-call by name without knowing how each
// tool is implemented. Also re-exports the Gemini declarations.

import { searchProducts, getProductDetails } from './products.js';
import { getStoreInfo } from './store.js';
import { toolDeclarations } from './declarations.js';

/**
 * Build a registry of callable tools bound to a database handle. Each entry takes the
 * arguments object the model produced and returns the tool's structured result.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Record<string, (args: object) => object>}
 */
export function createToolRegistry(db) {
  return {
    search_products: (args = {}) => searchProducts(db, args),
    get_product_details: (args = {}) => getProductDetails(db, args),
    get_store_info: (args = {}) => getStoreInfo(args),
  };
}

export { toolDeclarations };
