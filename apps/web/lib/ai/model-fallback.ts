import { type LanguageModelMiddleware, wrapLanguageModel } from "ai";

type LanguageModelV3 = Parameters<typeof wrapLanguageModel>[0]["model"];
export type FallbackLanguageModel = LanguageModelV3;

export function createFallbackLanguageModel(
  primary: LanguageModelV3,
  fallback: LanguageModelV3,
): LanguageModelV3 {
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch {
        if (params.abortSignal?.aborted) throw new Error("AI request aborted.");
        return fallback.doGenerate(params);
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch {
        if (params.abortSignal?.aborted) throw new Error("AI request aborted.");
        return fallback.doStream(params);
      }
    },
  };

  return wrapLanguageModel({ model: primary, middleware });
}
