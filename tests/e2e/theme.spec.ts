// The store's look from Settings › Appearance: an owner picks a palette and a heading font,
// saves them, and the storefront repaints; then a different design rebuilds the store, and
// the original look is put back.
import { expect, test, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { db } from "./support/helpers";

test.use({ storageState: OWNER.state });

/** A colour token as the storefront resolves it on its outermost element. */
async function token(page: Page, name: string) {
  return page.locator("#main").evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.").first()).toBeVisible();
}

test("an owner restyles the store: colours, fonts and another design", async ({ page }) => {
  const columns = "primary_color, brand_color, accent_color, background_color, heading_font, heading_italic, body_font, design, design_options";
  const { data: before } = await db().from("store_settings").select(columns).eq("id", 1).single();
  try {
    await page.goto("/admin/settings?tab=appearance");
    await page.getByRole("button", { name: /Emerald and brass/ }).click();
    await expect(page.getByRole("button", { name: /Emerald and brass/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Headings", { exact: true }).selectOption("playfair");
    await save(page);
    const { data: saved } = await db().from("store_settings").select("brand_color, heading_font, heading_italic, design").eq("id", 1).single();
    expect(saved).toEqual({ brand_color: "#114a3a", heading_font: "playfair", heading_italic: true, design: "atelier" });

    await page.goto("/");
    await expect.poll(() => token(page, "--color-brand")).toBe("#114a3a");
    await expect(page.locator("h1").first()).toHaveCSS("font-style", "italic");
    await expect(page.locator("footer")).toHaveCSS("background-color", "rgb(17, 74, 58)");

    await page.goto("/admin/settings?tab=appearance");
    await page.getByLabel("Italic headings").uncheck();
    await save(page);
    await page.goto("/");
    await expect(page.locator("h1").first()).toHaveCSS("font-style", "normal");

    // Noir rebuilds the store: dark, with a menu button on every screen and capital headings.
    await page.goto("/admin/settings?tab=appearance");
    await page.getByRole("button", { name: /^Noir/ }).click();
    await save(page);
    expect((await db().from("store_settings").select("design").eq("id", 1).single()).data?.design).toBe("noir");
    await page.goto("/");
    await expect(page.locator("[data-design]")).toHaveAttribute("data-design", "noir");
    await expect(page.locator("[data-design]")).toHaveAttribute("data-scheme", "dark");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.locator("h1").first()).toHaveCSS("text-transform", "uppercase");

    // Atelier's own look is the store's original one.
    await page.goto("/admin/settings?tab=appearance");
    await page.getByRole("button", { name: /^Atelier/ }).click();
    await save(page);
    const { data: after } = await db().from("store_settings").select(columns).eq("id", 1).single();
    expect(after).toEqual(before);
  } finally {
    await db().from("store_settings").update(before!).eq("id", 1);
  }
});
