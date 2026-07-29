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
          condition: "any",
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
  await page.route("**/api/search/motorland", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        method: "html",
        offers: [
          {
            sourceId: "motorland",
            externalId: "21361901",
            externalUrl:
              "https://motorland.by/auto-parts/bmw/3/f30/kapot/sku-21361901/",
            title: "Капот BMW 3 F30",
            brand: "BMW",
            rawPartNumber: "21361901",
            normalizedPartNumber: "21361901",
            oemNumbers: [],
            condition: "used",
            partKind: "unknown",
            priceAmount: "725",
            priceSource: "data_attribute",
            currency: "BYN",
            sellerName: "Motorland.by",
            matchStatus: "possible",
            fetchedAt: "2026-07-29T20:00:00.000Z",
            rawPayloadHash: "1".repeat(64),
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
  await page.getByRole("button", { name: "Найти по артикулу" }).click();
  await expect(queryInput).toHaveValue("Артикул: ");
  await queryInput.fill("7700274177");
  await page.getByRole("button", { name: "Отправить запрос" }).click();
  await expect(
    page.getByRole("heading", { name: "Масляный фильтр" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Искать", exact: true }).click();
  await expect(page.getByText("Нашёл 2 реальных предложения.")).toBeVisible();
  await expect(page.getByRole("link", { name: "На Zap.by" })).toHaveAttribute(
    "href",
    "https://zap.by/oem/7700274177",
  );
  await expect(
    page.getByRole("link", { name: "На Motorland.by" }),
  ).toHaveAttribute(
    "href",
    "https://motorland.by/auto-parts/bmw/3/f30/kapot/sku-21361901/",
  );
});

test("garage starts empty and persists a manually added vehicle", async ({
  page,
}) => {
  await page.goto("/garage");
  await expect(page.getByRole("heading", { name: "Мой гараж" })).toBeVisible();
  await expect(page.getByText("Гараж пока пуст")).toBeVisible();

  await page
    .getByRole("button", { name: "Добавить первый автомобиль" })
    .click();
  await page.getByLabel("Название в гараже").fill("Мой Peugeot");
  await page.getByLabel("VIN").fill("VF3LBBHZHES123456");
  await page.getByLabel("Марка *").fill("Peugeot");
  await page.getByLabel("Модель *").fill("308");
  await page.getByLabel("Год *").fill("2008");
  await page.getByLabel("Поколение / версия").fill("T7");
  await page.getByRole("button", { name: "Сохранить автомобиль" }).click();

  await expect(
    page.getByRole("heading", { name: "Мой Peugeot" }),
  ).toBeVisible();
  await expect(page.getByText("VF3••••••••••3456")).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Мой Peugeot" }),
  ).toBeVisible();
  await expect(page.getByText("VF3LBBHZHES123456")).toHaveCount(0);
});

test("VIN entered in chat is prepared for a confirmed garage save", async ({
  page,
}) => {
  await page.goto("/chat");
  const queryInput = page.getByRole("textbox", { name: "Что нужно найти?" });

  await queryInput.fill("Сохрани VIN VF3LBBHZHES123456");
  await page.getByRole("button", { name: "Отправить запрос" }).click();

  await expect(
    page.getByText(
      "VIN распознан и подготовлен к сохранению. Укажите марку, модель и год в гараже, чтобы подтвердить автомобиль.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Открыть гараж" }).click();
  await expect(page.getByLabel("VIN")).toHaveValue("VF3LBBHZHES123456");
});
