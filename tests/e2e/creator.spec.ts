import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import path from "node:path";

const menuPhoto = path.resolve(
  process.cwd(),
  "tests/fixtures/live/synthetic-menu-photo.png",
);

test("creates and corrects an anonymous menu draft", async ({ page }) => {
  await page.goto("/create");

  await page.getByLabel("Choose photos or PDF").setInputFiles(menuPhoto);
  await expect(
    page.getByRole("heading", { name: "Reading order" }),
  ).toBeVisible();
  await expect(page.getByText("synthetic-menu-photo.png")).toBeVisible();

  await page.getByRole("button", { name: "Read this menu" }).click();
  await expect(page).toHaveURL(/\/create\/[a-f0-9-]+\/processing$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByText("Review ready. 2 details need your attention."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Review 2 details" }).click();

  await expect(
    page.getByRole("heading", { name: "2 details need a look." }),
  ).toBeVisible();
  await expect(page.getByText("鯖の味噌煮")).toBeVisible();
  await expect(page.getByText("Source menu image")).toBeVisible();

  const price = page.getByLabel("Confirm price exactly as printed");
  await price.fill("¥980");
  await page.getByRole("button", { name: "Save price" }).click();
  await expect(
    page.getByRole("heading", { name: "1 detail needs a look." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Leave unassociated" }).click();
  await expect(
    page.getByRole("heading", { name: "0 details need a look." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue to images" }).click();

  await expect(page).toHaveURL(/\/create\/[a-f0-9-]+\/generate$/);
  await expect(
    page.getByRole("heading", {
      name: "Keep this menu and make its images.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue as preview diner" }).click();

  await expect(
    page.getByRole("heading", { name: "Ready when you are." }),
  ).toBeVisible();
  await expect(page.getByText("3 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Use 1 credit and generate" }).click();

  await expect(
    page.getByRole("heading", { name: "Your visual menu is ready." }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(page.getByText("Source menu image")).toBeVisible();
  await expect(page.getByText("AI visual estimate")).toBeVisible();
  await expect(page.getByText("Image unavailable")).toBeVisible();
  await expect(
    page.getByText("This item failed without stopping the rest of the menu."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Try again · 2 left" }).click();
  await expect(page.getByText("Image unavailable")).not.toBeVisible();
  await expect(page.getByText("2 of 3")).toBeVisible();

  await page.getByRole("link", { name: "Open private result" }).click();
  await expect(
    page.getByRole("heading", { name: "Evening menu" }),
  ).toBeVisible();
  await expect(page.getByText("AI visual estimate")).toHaveCount(2);
  await expect(page.getByText("Source menu image")).toBeVisible();
  const resultAccessibility = await new AxeBuilder({ page }).analyze();
  expect(resultAccessibility.violations).toEqual([]);

  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Complete" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No private menus yet.")).toBeVisible();
});

test("creator upload page has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/create");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
