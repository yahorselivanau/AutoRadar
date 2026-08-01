import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { createFallbackLanguageModel } from "@/lib/ai/model-fallback";

export const GEMINI_PRIMARY_MODEL = "gemini-3.5-flash-lite" as const;
export const GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite" as const;
export const GEMINI_MODEL = GEMINI_PRIMARY_MODEL;

export function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const google = createGoogleGenerativeAI({ apiKey });

  return createFallbackLanguageModel(
    google(GEMINI_PRIMARY_MODEL),
    google(GEMINI_FALLBACK_MODEL),
  );
}
