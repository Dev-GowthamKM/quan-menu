// The store's look from Settings › Appearance: an owner picks a theme, saves it, and the
// storefront repaints with its colours and italic headings; the theme is then put back.
import { expect, test, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { db } from "./support/helpers";

test.use({ storageState: OWNER.state });

/** A colour token as the storefront resolves it on its outermost element. */
async function token(page: Page, name: string) {
  return page.locator("#main").evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
}

async function chooseTheme(page: Page, name: RegExp) {
  await page.goto("/admin/settings?tab=appearance");
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.").first()).toBeVisible();
}

test("an owner restyles the store with a theme", async ({ page }) => {
  const { data: before } = await db().from("store_settings").select("primary_color, brand_color, accent_color, background_color, heading_font, heading_italic, body_font").eq("id", 1).single();
  try {
    await chooseTheme(page, /Emerald and brass/);
    const { data: saved } = await db().from("store_settings").select("brand_color, heading_font, heading_italic").eq("id", 1).single();
    expect(saved).toEqual({ brand_color: "#114a3a", heading_font: "playfair", heading_italic: true });

    await page.goto("/");
    await expect.poll(() => token(page, "--color-brand")).toBe("#114a3a");
    const heading = page.locator("h1").first();
    await expect(heading).toHaveCSS("font-style", "italic");
    await expect(page.locator("footer")).toHaveCSS("background-color", "rgb(17, 74, 58)");

    await chooseTheme(page, /Black and white/);
    await page.goto("/");
    await expect(page.locator("h1").first()).toHaveCSS("font-style", "normal");

    await chooseTheme(page, /Wine and gold/);
  } finally {
    await db().from("store_settings").update(before!).eq("id", 1);
  }
});
