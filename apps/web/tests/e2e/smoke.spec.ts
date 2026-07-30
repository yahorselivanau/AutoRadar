import { expect, type Page, test } from "@playwright/test";

const conversationId = "29c8c193-e65c-4a87-bbc3-69bff51cfe69";

function sse(chunks: object[]): string {
  return [
    ...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
}

async function mockConversation(page: Page, searchesUsed = 0) {
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          id: conversationId,
          messages: [],
          state: {},
          guestUsage: {
            requestsUsed: 1,
            requestsLimit: 5,
            searchesUsed,
            searchesLimit: 5,
            resetsAt: "2026-07-30T12:00:00.000Z",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ conversations: [] }),
    });
  });
  await page.route(`**/api/conversations/${conversationId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: conversationId,
        title: "Новый поиск",
        messages: [],
        state: {},
        guestUsage: {
          requestsUsed: 1,
          requestsLimit: 5,
          searchesUsed,
          searchesLimit: 5,
          resetsAt: "2026-07-30T12:00:00.000Z",
        },
      }),
    });
  });
}

test("agent keeps the draft, searches explicitly and answers a follow-up without another search", async ({
  page,
}) => {
  await mockConversation(page);
  let chatCalls = 0;
  await page.route("**/api/chat", async (route) => {
    chatCalls += 1;
    if (chatCalls === 1) {
      const request = {
        query: "7700274177",
        locale: "ru-BY",
        currency: "BYN",
        part: {
          name: "Масляный фильтр",
          side: "unknown",
          position: "unknown",
          condition: "any",
          rawPartNumber: "7700274177",
          normalizedPartNumber: "7700274177",
          constraints: [],
        },
      };
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: sse([
          { type: "start", messageId: "assistant-1" },
          { type: "start-step" },
          {
            type: "tool-input-available",
            toolCallId: "draft-1",
            toolName: "update_search_draft",
            input: request,
          },
          {
            type: "tool-output-available",
            toolCallId: "draft-1",
            output: { kind: "search_draft", request },
          },
          { type: "finish-step" },
          { type: "text-start", id: "text-1" },
          {
            type: "text-delta",
            id: "text-1",
            delta: "Артикул распознан. Можно запускать поиск.",
          },
          { type: "text-end", id: "text-1" },
          { type: "finish" },
        ]),
      });
      return;
    }

    if (chatCalls === 2) {
      const offer = {
        sourceId: "auto1",
        externalId: "315677",
        externalUrl: "https://auto1.by/avtozapchasti/dvigatel/315677",
        title: "RENAULT 7700274177 Масляный фильтр",
        brand: "RENAULT",
        rawPartNumber: "7700274177",
        normalizedPartNumber: "7700274177",
        oemNumbers: [],
        condition: "new",
        partKind: "unknown",
        priceAmount: "10.45",
        currency: "BYN",
        availability: "В наличии",
        fetchedAt: "2026-07-29T20:00:00.000Z",
        rawPayloadHash: "3".repeat(64),
      };
      const output = {
        kind: "search_result",
        jobId: "98b65b68-d59d-4ba0-b6b9-e3c064512a30",
        status: "completed",
        offers: [offer],
        sources: [
          {
            sourceId: "auto1",
            status: "completed",
            offerCount: 1,
            durationMs: 120,
            errorMessage: null,
          },
        ],
        clarification: null,
      };
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "x-vercel-ai-ui-message-stream": "v1",
        },
        body: sse([
          { type: "start", messageId: "assistant-2" },
          { type: "start-step" },
          {
            type: "tool-input-available",
            toolCallId: "search-1",
            toolName: "start_parts_search",
            input: {},
          },
          {
            type: "tool-output-available",
            toolCallId: "search-1",
            output,
          },
          { type: "finish-step" },
          { type: "text-start", id: "text-2" },
          {
            type: "text-delta",
            id: "text-2",
            delta: "Нашёл одно предложение.",
          },
          { type: "text-end", id: "text-2" },
          { type: "finish" },
        ]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: sse([
        { type: "start", messageId: "assistant-3" },
        { type: "text-start", id: "text-3" },
        {
          type: "text-delta",
          id: "text-3",
          delta: "Самое дешёвое предложение — 10.45 BYN на Auto1.by.",
        },
        { type: "text-end", id: "text-3" },
        { type: "finish" },
      ]),
    });
  });

  await page.goto(`/chat/${conversationId}`);
  await expect(
    page.getByRole("heading", { name: "Что нужно найти?" }),
  ).toBeVisible();

  const input = page.getByRole("textbox", {
    name: "Сообщение Авто Радар",
  });
  await input.fill("Найди по артикулу 7700274177");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(
    page.getByRole("heading", { name: "Масляный фильтр" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Искать", exact: true }).click();
  await expect(page.getByText("1 предложение")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Посмотреть все предложения" }),
  ).toHaveAttribute(
    "href",
    `/search/98b65b68-d59d-4ba0-b6b9-e3c064512a30?conversation=${conversationId}`,
  );

  await input.fill("Какой вариант самый дешёвый?");
  await input.press("Enter");
  await expect(
    page.getByText("Самое дешёвое предложение — 10.45 BYN на Auto1.by."),
  ).toBeVisible();
  expect(chatCalls).toBe(3);
});

test("guest sees request quota and vehicle context inside the composer", async ({
  page,
}) => {
  await mockConversation(page, 4);
  await page.goto(`/chat/${conversationId}`);

  await expect(
    page.getByRole("button", { name: "Выбрать автомобиль для поиска" }),
  ).toBeVisible();
  const quota = page.getByRole("button", {
    name: "Осталось реальных поисков: 1",
  });
  await expect(quota).toBeVisible();
  await quota.click();
  const quotaDialog = page.getByRole("dialog");
  await expect(quotaDialog.getByText("1", { exact: true })).toBeVisible();
  await expect(
    quotaDialog.getByText("из 5 реальных поисков осталось"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Обычные вопросы в чате бесплатны. Лимит расходуется только при запуске федеративного поиска по каталогам.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Войти без ограничений" }),
  ).toBeVisible();
});

test("new search renders immediately without creating an empty conversation", async ({
  page,
}) => {
  let draftPosts = 0;
  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() === "POST") draftPosts += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ conversations: [] }),
    });
  });

  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "Что нужно найти?" }),
  ).toBeVisible();
  expect(draftPosts).toBe(0);
});

test("garage starts empty and persists a manually added vehicle", async ({
  page,
}) => {
  await page.goto("/garage");
  await expect(page.getByRole("heading", { name: "Гараж" })).toBeVisible();
  await expect(page.getByText("Добавьте автомобиль")).toBeVisible();

  await page
    .getByRole("button", { name: "Добавить автомобиль" })
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

test("VIN entered in chat stays out of the model-visible message", async ({
  page,
}) => {
  await mockConversation(page);
  let modelVisibleMessage = "";
  await page.route("**/api/chat", async (route) => {
    const payload = route.request().postDataJSON() as {
      message: { parts: Array<{ type: string; text?: string }> };
    };
    modelVisibleMessage =
      payload.message.parts.find((part) => part.type === "text")?.text ?? "";
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: sse([
        { type: "start", messageId: "assistant-vin" },
        { type: "text-start", id: "text-vin" },
        {
          type: "text-delta",
          id: "text-vin",
          delta: "VIN сохранён приложением и не передан модели.",
        },
        { type: "text-end", id: "text-vin" },
        { type: "finish" },
      ]),
    });
  });

  await page.goto(`/chat/${conversationId}`);
  const input = page.getByRole("textbox", { name: "Сообщение Авто Радар" });
  await input.fill("Сохрани VIN VF3LBBHZHES123456");
  await page.getByRole("button", { name: "Отправить" }).click();

  await expect(
    page.getByText("VIN сохранён приложением и не передан модели."),
  ).toBeVisible();
  expect(modelVisibleMessage).not.toContain("VF3LBBHZHES123456");
});
