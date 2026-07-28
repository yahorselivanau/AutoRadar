import { SearchRequestSchema } from "@autoradar/domain";
import { RemzonaPartsAdapter } from "@autoradar/search-actor/remzona";
import { AdapterError } from "@autoradar/search-actor/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
  if (process.env.SOURCE_REMZONA_ENABLED === "false") {
    return NextResponse.json(
      { error: "Источник Remzona временно отключён." },
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

  try {
    return NextResponse.json(
      await new RemzonaPartsAdapter().search(parsed.data),
    );
  } catch (error) {
    if (error instanceof AdapterError) {
      const status =
        error.code === "unsupported-query"
          ? 422
          : error.code === "rate-limited"
            ? 429
            : error.code === "timeout"
              ? 504
              : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json(
      { error: "Не удалось выполнить поиск Remzona." },
      { status: 500 },
    );
  }
}
