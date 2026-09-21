import { expect, test } from "@playwright/test";

test("explains the product and labels the example estimate", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Understand the menu before you order.",
    }),
  ).toBeVisible();
  await expect(page.getByText("AI visual estimate")).toBeVisible();
  await expect(page.getByText("鯖の味噌煮")).toBeVisible();
  await page.getByRole("link", { name: "See an example" }).click();
  await expect(page.locator("#preview")).toBeInViewport();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
