// Thin wrapper around the Google Gen AI SDK (SPEC §2). This is the ONLY module that imports
// @google/genai and talks to the network. The conversation loop (service.js) receives this
// `generate` function so it can be stubbed in tests — nothing here is exercised by unit tests.

import { GoogleGenAI } from '@google/genai';

/**
 * Create a Gemini client bound to the configured model and API key.
 * @param {{ geminiApiKey: string, geminiModel: string }} config
 * @returns {{ model: string, generate: (req: object) => Promise<object> }}
 */
export function createGeminiClient({ geminiApiKey, geminiModel }) {
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  return {
    model: geminiModel,
    /**
     * One call to the model. Returns the raw SDK response (exposes `.functionCalls`
     * and `.text`). The loop handles tool dispatch and multi-turn contents.
     */
    async generate({ contents, systemInstruction, tools, toolConfig }) {
      return ai.models.generateContent({
        model: geminiModel,
        contents,
        config: { systemInstruction, tools, toolConfig },
      });
    },
  };
}
