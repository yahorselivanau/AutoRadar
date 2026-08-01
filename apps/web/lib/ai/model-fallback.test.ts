import type { FallbackLanguageModel } from "./model-fallback";
import { describe, expect, it, vi } from "vitest";

import { createFallbackLanguageModel } from "./model-fallback";

function createModel(
  overrides: Partial<FallbackLanguageModel> = {},
): FallbackLanguageModel {
  return {
    specificationVersion: "v3",
    provider: "google.generative-ai",
    modelId: "test-model",
    supportedUrls: {},
    doGenerate: vi.fn().mockResolvedValue({}),
    doStream: vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
    }),
    ...overrides,
  } as FallbackLanguageModel;
}

const callOptions = {} as Parameters<FallbackLanguageModel["doGenerate"]>[0];

describe("createFallbackLanguageModel", () => {
  it("uses the fallback when generation fails on the primary model", async () => {
    const primary = createModel({
      doGenerate: vi.fn().mockRejectedValue(new Error("primary failed")),
    });
    const fallback = createModel({
      doGenerate: vi.fn().mockResolvedValue({ fallback: true }),
    });
    const model = createFallbackLanguageModel(primary, fallback);

    await expect(model.doGenerate(callOptions)).resolves.toEqual({
      fallback: true,
    });
    expect(primary.doGenerate).toHaveBeenCalledTimes(1);
    expect(fallback.doGenerate).toHaveBeenCalledTimes(1);
  });

  it("uses the fallback when the primary stream request fails", async () => {
    const primary = createModel({
      doStream: vi.fn().mockRejectedValue(new Error("primary failed")),
    });
    const fallbackResult = { stream: new ReadableStream() };
    const fallback = createModel({
      doStream: vi.fn().mockResolvedValue(fallbackResult),
    });
    const model = createFallbackLanguageModel(primary, fallback);

    await expect(model.doStream(callOptions)).resolves.toBe(fallbackResult);
    expect(primary.doStream).toHaveBeenCalledTimes(1);
    expect(fallback.doStream).toHaveBeenCalledTimes(1);
  });
});
