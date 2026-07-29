import { SearchRequestSchema } from "@autoradar/domain";
import {
  getZapDiagnosticReason,
  ZapPartsAdapter,
} from "@autoradar/search-actor/zap";
import { AdapterError } from "@autoradar/search-actor/types";
import { NextResponse } from "next/server";

import { safeSearchLogContext } from "@/lib/search-observability";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (process.env.SOURCE_ZAP_ENABLED === "false") {
    return NextResponse.json(
      { error: "Источник Zap.by временно отключён." },
      { status: 503 },
    );
  }

  const payload: unknown = await request.json().catch(() => undefined);
  const parsed = SearchRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные параметры поиска." },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const context = safeSearchLogContext(parsed.data);
  try {
    const result = await new ZapPartsAdapter().search(parsed.data);
    console.info("[search:zap] completed", {
      ...context,
      durationMs: Date.now() - startedAt,
      offers: result.offers.length,
      clarification: result.clarification?.field,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdapterError) {
      console.warn("[search:zap] adapter error", {
        ...context,
        durationMs: Date.now() - startedAt,
        code: error.code,
        diagnosticReason: getZapDiagnosticReason(error),
        message: error.message,
      });
      const status =
        error.code === "unsupported-query"
          ? 422
          : error.code === "rate-limited"
            ? 429
            : error.code === "timeout"
              ? 504
              : 502;
      return NextResponse.json(
        {
          error: error.message,
          diagnosticReason: getZapDiagnosticReason(error),
        },
        { status },
      );
    }
    console.error("[search:zap] unexpected error", {
      ...context,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Не удалось выполнить поиск Zap.by." },
      { status: 500 },
    );
  }
}
