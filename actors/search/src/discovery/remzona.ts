import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { chromium, type Request, type Response } from "playwright";

const MAX_BODY_BYTES = 100 * 1024;
const startedAt = new Date().toISOString().replaceAll(/[:.]/g, "-");
const outputDir = resolve(
  import.meta.dirname,
  "../../../../output/playwright/remzona",
  startedAt,
);
const records: Array<Record<string, unknown>> = [];
const requests = new WeakMap<Request, Record<string, unknown>>();

await mkdir(outputDir, { recursive: true });

const automaticQuery = process.env.REMZONA_DISCOVERY_AUTO_QUERY?.trim();
const automaticExit = process.env.REMZONA_DISCOVERY_AUTO_EXIT === "true";
const browser = await chromium.launch({
  headless: process.env.REMZONA_DISCOVERY_HEADLESS === "true",
});
const context = await browser.newContext();
const page = await context.newPage();

await context.tracing.start({
  screenshots: true,
  snapshots: true,
  sources: true,
});

let discoveryError: unknown;

page.on("request", (request) => {
  if (!["fetch", "xhr"].includes(request.resourceType())) return;
  const record = {
    url: request.url(),
    method: request.method(),
    requestHeaders: request.headers(),
    postBody: request.postData(),
  };
  requests.set(request, record);
  records.push(record);
});

page.on("response", async (response: Response) => {
  const request = response.request();
  const record = requests.get(request);
  if (!record) return;

  const contentType = response.headers()["content-type"] ?? "";
  Object.assign(record, {
    status: response.status(),
    responseContentType: contentType,
  });

  try {
    const body = await response.body();
    record.responseBody = body.subarray(0, MAX_BODY_BYTES).toString("utf8");
  } catch (error) {
    record.responseBodyError =
      error instanceof Error ? error.message : "Unable to read response body";
  }
});

try {
  await page.goto("https://remzona.by/", {
    waitUntil: "domcontentloaded",
    timeout: automaticQuery ? 15_000 : 30_000,
  });

  if (automaticQuery) {
    const categoryPath = await page.evaluate(async (query) => {
      const response = await fetch("/", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "x-requested-with": "XMLHttpRequest",
        },
        body: new URLSearchParams({
          typerequest: "search",
          q: query,
        }),
      });
      if (!response.ok) {
        throw new Error(`Search XHR returned HTTP ${response.status}`);
      }
      const html = await response.text();
      const document = new DOMParser().parseFromString(html, "text/html");
      return (
        document
          .querySelector('.part-result[data-part="group"] a.part-content[href]')
          ?.getAttribute("href") ?? null
      );
    }, automaticQuery);

    if (!categoryPath) {
      throw new Error(
        `Remzona did not return a category for "${automaticQuery}"`,
      );
    }
    await page.goto(new URL(categoryPath, page.url()).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".box-articleitems .item-list").first().waitFor({
      state: "attached",
      timeout: 20_000,
    });
  }

  stdout.write(
    `Remzona discovery запущен.\n` +
      (automaticQuery
        ? `Автоматический запрос завершён: ${automaticQuery}\n`
        : "Пройдите поиск вручную, затем вернитесь в терминал и нажмите Enter.\n") +
      `Artifacts: ${outputDir}\n`,
  );

  if (!automaticExit) {
    const terminal = createInterface({ input: stdin, output: stdout });
    await terminal.question("");
    terminal.close();
  }
} catch (error) {
  discoveryError = error;
  await page.evaluate(() => window.stop()).catch(() => undefined);
  records.push({
    discoveryError: error instanceof Error ? error.message : String(error),
  });
}

await writeFile(
  join(outputDir, "network.json"),
  `${JSON.stringify(records, null, 2)}\n`,
);
await context.storageState({
  indexedDB: true,
  path: join(outputDir, "storage-state.json"),
});
try {
  await writeFile(join(outputDir, "final.html"), await page.content());
} catch (error) {
  await writeFile(
    join(outputDir, "final-html-error.txt"),
    error instanceof Error ? error.message : String(error),
  );
}
try {
  await page.screenshot({
    fullPage: true,
    path: join(outputDir, "final.png"),
    timeout: 5_000,
  });
} catch (error) {
  await writeFile(
    join(outputDir, "final-screenshot-error.txt"),
    error instanceof Error ? error.message : String(error),
  );
}
await context.tracing.stop({ path: join(outputDir, "trace.zip") });
await browser.close();

stdout.write(`Discovery завершён: ${outputDir}\n`);

if (discoveryError) {
  throw discoveryError;
}
