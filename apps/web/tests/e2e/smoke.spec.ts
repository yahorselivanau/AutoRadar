import { expect, test } from "@playwright/test";

test("guest can reach demo results from conversational search", async ({
  page,
}) => {
  await page.goto("/chat");
  await expect(
    page.getByRole("heading", { name: "Что нужно найти?" }),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: /Передний левый стеклоподъёмник/,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Передний левый стеклоподъёмник" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Искать предложения" }).click();
  await page.getByRole("link", { name: "Открыть все предложения" }).click();
  await expect(page).toHaveURL(/\/search\/demo/);
  await expect(page.getByText("18 предложений")).toBeVisible();
});

test("garage masks saved VIN values", async ({ page }) => {
  await page.goto("/garage");
  await expect(page.getByRole("heading", { name: "Мой гараж" })).toBeVisible();
  await expect(page.getByText("VF3••••••••4821")).toBeVisible();
});
