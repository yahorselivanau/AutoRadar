import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";
const LEGACY_GEMINI_MODELS = new Set(["gemini-2.5-flash-lite"]);

export function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const configuredModel = process.env.AI_MODEL?.trim() || GEMINI_MODEL;
  const model = LEGACY_GEMINI_MODELS.has(configuredModel)
    ? GEMINI_MODEL
    : configuredModel;
  if (model !== GEMINI_MODEL) {
    throw new Error(
      `AI_MODEL должен оставаться ${GEMINI_MODEL} для текущего релиза.`,
    );
  }

  return createGoogleGenerativeAI({ apiKey })(model);
}
