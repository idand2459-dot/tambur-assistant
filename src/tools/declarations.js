// Gemini function declarations for the three tools (SPEC §4). These are what the model
// reads to decide when and how to call a tool. The descriptions matter — they are the
// model's only guidance — so keep them accurate and aligned with SPEC §4 and §5.

import { Type } from '@google/genai';

export const toolDeclarations = [
  {
    name: 'search_products',
    description:
      "Search the store's product catalog by free-text query (usually Hebrew: a product " +
      'name, type, color, or size). Call this whenever the customer asks whether a product ' +
      'exists, how much it costs, or if it is in stock. Returns matching products with ' +
      'name, category, price (ILS) and stock status. Returns an empty list when nothing ' +
      'matches — never invent a product, price, or stock status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            "The product the customer is describing, in their own words (usually Hebrew). " +
            "Examples: 'צבע קיר לבן', 'מברשת 5 ס״מ'.",
        },
        category: {
          type: Type.STRING,
          description:
            "Optional. Restrict results to one category if known, e.g. 'צבעים', 'מברשות'.",
        },
        limit: {
          type: Type.INTEGER,
          description: 'Optional. Max products to return (default 5, max 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description:
      'Fetch full details for one specific product by its numeric id. Use this for a ' +
      'follow-up that refers to a product already shown earlier in the conversation, when ' +
      'you know its id from a previous search_products result. Returns { found: false } ' +
      'if the id is unknown.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_id: {
          type: Type.INTEGER,
          description: 'The numeric id of the product, from a previous search_products result.',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'get_store_info',
    description:
      "Return the store's general information: opening hours, address, and phone number. " +
      'Call this when the customer asks when the store is open, where it is located, or ' +
      'how to contact it.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: {
          type: Type.STRING,
          description:
            "Optional. One of 'hours', 'address', 'phone', 'general'. Omit to return all.",
        },
      },
      required: [],
    },
  },
];
