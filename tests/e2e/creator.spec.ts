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
  await expect(page).toHaveURL(/\/create\/[a-f0-9-]+\/processing$/);
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
    page.getByRole("heading", { name: "Your menu record is ready." }),
  ).toBeVisible();
  await expect(page.getByText("None", { exact: true })).toBeVisible();
});

test("creator upload page has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/create");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
