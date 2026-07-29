import {
  normalizePartNumber,
  PartRequestExtractionSchema,
  VehicleContextSchema,
} from "@autoradar/domain";
import { APICallError, generateText, Output } from "ai";
import { z } from "zod";

import {
  PART_REQUEST_PROMPT_VERSION,
  PART_REQUEST_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/part-request.v4";

export const maxDuration = 30;

const InputSchema = z.object({
  query: z.string().trim().min(2).max(1200),
  currentExtraction: PartRequestExtractionSchema.optional(),
  activeVehicle: VehicleContextSchema.optional(),
});

const vinPattern = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;

function redactVin(value: string): string {
  return value.replace(vinPattern, "[VIN скрыт]");
}

export async function POST(request: Request) {
  const payload: unknown = await request.json().catch(() => null);
  const parsedInput = InputSchema.safeParse(payload);

  if (!parsedInput.success) {
    return Response.json(
      { error: "Опишите деталь чуть подробнее." },
      { status: 400 },
    );
  }

  const model = process.env.AI_MODEL ?? "openai/gpt-5.4-nano";

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: PartRequestExtractionSchema }),
      system: PART_REQUEST_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        message: redactVin(parsedInput.data.query),
        currentRequest: parsedInput.data.currentExtraction ?? null,
        activeVehicle: parsedInput.data.activeVehicle ?? null,
      }),
      maxOutputTokens: 900,
      providerOptions: {
        gateway: {
          disallowPromptTraining: true,
          tags: [
            "app:autoradar",
            "feature:part-request",
            `prompt:${PART_REQUEST_PROMPT_VERSION}`,
          ],
        },
      },
    });

    return Response.json({
      extraction: {
        ...output,
        normalizedPartNumber: output.rawPartNumber
          ? normalizePartNumber(output.rawPartNumber)
          : null,
      },
      model,
      promptVersion: PART_REQUEST_PROMPT_VERSION,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      error.statusCode === 403
    ) {
      return Response.json(
        {
          error:
            "AI Gateway временно недоступен. Повторите запрос или заполните форму вручную.",
        },
        { status: 503 },
      );
    }

    if (APICallError.isInstance(error)) {
      if (error.statusCode === 402) {
        return Response.json(
          { error: "Лимит AI временно исчерпан. Попробуйте позже." },
          { status: 503 },
        );
      }

      if (error.statusCode === 429) {
        return Response.json(
          { error: "Слишком много запросов. Повторите через минуту." },
          { status: 429 },
        );
      }
    }

    return Response.json(
      {
        error:
          "Не удалось разобрать запрос. Можно заполнить параметры вручную.",
      },
      { status: 502 },
    );
  }
}
