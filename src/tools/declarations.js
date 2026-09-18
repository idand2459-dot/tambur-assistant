// Gemini function declarations for the three tools (SPEC §4). These are what the model
// reads to decide when and how to call a tool. The descriptions matter — they are the
// model's only guidance — so keep them accurate and aligned with SPEC §4 and §5.
//
// Types are the plain Gemini Schema type strings ('OBJECT'/'STRING'/'INTEGER'), which are
// exactly the values of the SDK's `Type` enum. Using the literals keeps the tools layer
// free of a Gemini SDK import (AGENTS §1: no Gemini in the tools/data layers).

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
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description:
            "The product the customer is describing, in their own words (usually Hebrew). " +
            "Examples: 'צבע קיר לבן', 'מברשת 5 ס״מ'.",
        },
        category: {
          type: 'STRING',
          description:
            "Optional. Restrict results to one category if known, e.g. 'צבעים', 'מברשות'.",
        },
        limit: {
          type: 'INTEGER',
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
      type: 'OBJECT',
      properties: {
        product_id: {
          type: 'INTEGER',
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
      type: 'OBJECT',
      properties: {
        topic: {
          type: 'STRING',
          description:
            "Optional. One of 'hours', 'address', 'phone', 'general'. Omit to return all.",
        },
      },
      required: [],
    },
  },
];
