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
import { GEMINI_MODEL, getGeminiModel } from "@/lib/ai/gemini";

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

  try {
    const { output } = await generateText({
      model: getGeminiModel(),
      output: Output.object({ schema: PartRequestExtractionSchema }),
      system: PART_REQUEST_SYSTEM_PROMPT,
      prompt: JSON.stringify({
        message: redactVin(parsedInput.data.query),
        currentRequest: parsedInput.data.currentExtraction ?? null,
        activeVehicle: parsedInput.data.activeVehicle ?? null,
      }),
      maxOutputTokens: 900,
    });

    return Response.json({
      extraction: {
        ...output,
        normalizedPartNumber: output.rawPartNumber
          ? normalizePartNumber(output.rawPartNumber)
          : null,
      },
      model: GEMINI_MODEL,
      promptVersion: PART_REQUEST_PROMPT_VERSION,
    });
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        return Response.json(
          {
            error:
              "Gemini API недоступен. Проверьте API-ключ или заполните форму вручную.",
          },
          { status: 503 },
        );
      }

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
