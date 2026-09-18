// Store-info tool (SPEC §4.3). Reads static facts from config — no DB, no network.

import { storeInfo } from '../config/store-info.js';

const TOPICS = ['hours', 'address', 'phone', 'general'];

/**
 * get_store_info (SPEC §4.3). Returns store facts. With a known `topic`, returns just that
 * field; otherwise (omitted or unrecognized) returns all facts.
 *
 * @param {{ topic?: string }} [args]
 * @returns {Record<string, string>}
 */
export function getStoreInfo({ topic } = {}) {
  const key = topic ? String(topic).trim().toLowerCase() : '';
  if (key && TOPICS.includes(key)) {
    return { [key]: storeInfo[key] };
  }
  return { ...storeInfo };
}
