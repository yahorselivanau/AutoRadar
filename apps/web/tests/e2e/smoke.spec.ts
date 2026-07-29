import { expect, test } from "@playwright/test";

test("guest can search real sources from the AI confirmation card", async ({
  page,
}) => {
  await page.route("**/api/ai/parse-part-request", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        extraction: {
          summary: "Распознан артикул 7700274177.",
          partName: "Масляный фильтр",
          rawPartNumber: "7700274177",
          normalizedPartNumber: "7700274177",
          vehicle: {
            make: null,
            model: null,
            year: null,
            generation: null,
            body: null,
            engine: null,
            transmission: null,
            doors: null,
          },
          side: "unknown",
          position: "unknown",
          condition: "new",
          constraints: [],
          needsClarification: false,
          clarificationQuestion: null,
        },
      }),
    });
  });
  await page.route("**/api/search/zap", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        method: "html",
        offers: [
          {
            sourceId: "zap",
            externalId: "renault/7700274177",
            externalUrl: "https://zap.by/oem/7700274177",
            title: "7700274177 - Масляный фильтр",
            brand: "RENAULT",
            rawPartNumber: "7700274177",
            normalizedPartNumber: "7700274177",
            oemNumbers: [],
            condition: "unknown",
            partKind: "unknown",
            currency: "BYN",
            sellerName: "Zap.by",
            fetchedAt: "2026-07-28T20:00:00.000Z",
            rawPayloadHash: "0".repeat(64),
          },
        ],
      }),
    });
  });

  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "Что нужно найти?" }),
  ).toBeVisible();

  const queryInput = page.getByRole("textbox", { name: "Что нужно найти?" });
  await page.getByRole("button", { name: "Найти по номеру детали" }).click();
  await expect(queryInput).toHaveValue("Найти по номеру детали");
  await queryInput.fill("7700274177");
  await page.getByRole("button", { name: "Отправить запрос" }).click();
  await expect(
    page.getByRole("heading", { name: "Масляный фильтр" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Искать на Zap.by" }).click();
  await expect(page.getByText("Нашёл 1 реальное предложение.")).toBeVisible();
  await expect(page.getByRole("link", { name: "На Zap.by" })).toHaveAttribute(
    "href",
    "https://zap.by/oem/7700274177",
  );
});

test("garage masks saved VIN values", async ({ page }) => {
  await page.goto("/garage");
  await expect(page.getByRole("heading", { name: "Мой гараж" })).toBeVisible();
  await expect(page.getByText("VF3••••••••4821")).toBeVisible();
});
