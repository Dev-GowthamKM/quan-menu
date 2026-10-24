// Store designs: each of the six builds the storefront its own way and stays accessible;
// "Preview on the store" shows an unsaved look only in the browser that opens the signed
// link; the home page follows the store's own section order; the WhatsApp chat button and
// each store's own icon.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { db, expectAccessible } from "./support/helpers";

test.use({ storageState: OWNER.state });
test.describe.configure({ mode: "serial" });

/** What gives each design away on its home page (and, for some, its shop page). */
const DESIGNS: { name: string; key: string; home: (p: Page) => Promise<void>; shop?: (p: Page) => Promise<void> }[] = [
  {
    name: "Atelier",
    key: "atelier",
    home: async (p) => {
      await expect(p.getByRole("link", { name: "Track order" })).toBeVisible();
      await expect(p.locator("h1").first()).toHaveCSS("text-transform", "none");
    },
    shop: async (p) => await expect(p.getByRole("complementary", { name: "Filters" })).toBeVisible(),
  },
  {
    name: "Nordic",
    key: "nordic",
    home: async (p) => {
      await expect(p.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "New In" })).toBeVisible();
      await expect(p.getByRole("link", { name: "Track order" })).toHaveCount(0);
    },
    // Filters behind a button on every screen, for a wider grid.
    shop: async (p) => {
      await expect(p.getByRole("button", { name: /Filter & sort/ })).toBeVisible();
      await expect(p.getByRole("complementary", { name: "Filters" })).toHaveCount(0);
    },
  },
  {
    name: "Bazaar",
    key: "bazaar",
    home: async (p) => {
      await expect(p.getByRole("searchbox", { name: "Search products" })).toBeVisible();
      await expect(p.getByRole("button", { name: "Pause announcements" })).toBeVisible();
      await expect(p.locator("h1").first()).toHaveCSS("text-transform", "uppercase");
    },
  },
  {
    name: "Boutique",
    key: "boutique",
    home: async (p) => {
      await expect(p.getByRole("heading", { name: "Find your fit" })).toBeVisible();
      await expect(p.getByRole("button", { name: "Subscribe" }).last()).toHaveCSS("border-top-left-radius", "999px");
    },
  },
  {
    name: "Heritage",
    key: "heritage",
    home: async (p) => {
      await expect(p.locator("header .ornament").first()).toBeVisible();
      // Heritage's home page tells the store's story (Settings › Policies › About).
      await expect(p.getByRole("link", { name: "Read our story" })).toBeVisible();
    },
  },
  {
    name: "Noir",
    key: "noir",
    home: async (p) => {
      await expect(p.locator("[data-design]")).toHaveAttribute("data-scheme", "dark");
      // The header sits see-through over the opening photograph, with a menu button on every screen.
      await expect(p.locator("header").first()).toHaveClass(/overlay-clear/);
      await expect(p.getByRole("button", { name: "Open menu" })).toBeVisible();
    },
  },
];

/** Picks a design in Settings › Appearance and opens "Preview on the store" in a new tab. */
async function preview(page: Page, context: BrowserContext, name: string) {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: /Preview on the store/ }).click()]);
  await tab.waitForURL((u) => u.pathname === "/" && !u.search.includes("look="));
  return tab;
}

test("each design builds the store its own way, and every one stays accessible", async ({ page, context, browser }) => {
  test.setTimeout(360_000);
  const { data: product } = await db().from("products").select("slug").eq("status", "active").lte("published_at", new Date().toISOString()).limit(1).single();
  await page.goto("/admin/settings?tab=appearance");
  for (const d of DESIGNS) {
    const tab = await preview(page, context, d.name);
    await expect(tab.getByText("Preview of a look that isn't saved yet")).toBeVisible();
    await expect(tab.locator("[data-design]")).toHaveAttribute("data-design", d.key);
    await d.home(tab);
    await expectAccessible(tab, `${d.name}: home`);
    await tab.goto(`/products/${product!.slug}`);
    await expect(tab.getByRole("button", { name: "Add to bag" })).toBeVisible();
    await expectAccessible(tab, `${d.name}: product`);
    await tab.goto("/shop");
    await d.shop?.(tab);
    await expectAccessible(tab, `${d.name}: shop`);
    await tab.close();
  }

  // Shoppers still see the saved look while the owner previews another.
  const shopper = await browser.newContext();
  const visit = await shopper.newPage();
  await visit.goto("/");
  await expect(visit.locator("[data-design]")).toHaveAttribute("data-design", "atelier");
  await expect(visit.getByText("Preview of a look")).toHaveCount(0);
  // A made-up preview link does nothing.
  await visit.goto("/?look=eyJsIjp7fX0.forged-signature");
  await expect(visit.locator("[data-design]")).toHaveAttribute("data-design", "atelier");
  await shopper.close();

  // Ending the preview brings back the saved look.
  const tab = await context.newPage();
  await tab.goto("/");
  await expect(tab.locator("[data-design]")).toHaveAttribute("data-design", "noir");
  await tab.getByRole("link", { name: "End preview" }).click();
  await expect(tab.locator("[data-design]")).toHaveAttribute("data-design", "atelier");
  await expect(tab.getByText("Preview of a look")).toHaveCount(0);
});

test("the home page follows the store's own order of sections", async ({ page }) => {
  const { data: before } = await db().from("store_settings").select("homepage").eq("id", 1).single();
  try {
    await page.goto("/admin/settings?tab=homepage");
    await page.getByLabel("Show Featured brands").uncheck();
    // Best sellers first, above the main banner.
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Move Best sellers (or your featured edit) up" }).click();
    await expect(page.getByRole("button", { name: "Move Best sellers (or your featured edit) up" })).toBeDisabled();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved.").first()).toBeVisible();

    await page.goto("/");
    const headings = await page.locator("main h1, main h2").allTextContents();
    expect(headings[0]).toMatch(/Pieces we love|Best sellers/);
    expect(headings.indexOf((await page.locator("main h1").first().textContent())!)).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "The makers" })).toHaveCount(0);

    await page.goto("/admin/settings?tab=homepage");
    await page.getByRole("button", { name: "Use Atelier's order" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved.").first()).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "The makers" })).toBeVisible();
  } finally {
    await db().from("store_settings").update({ homepage: before!.homepage }).eq("id", 1);
  }
});

test("a WhatsApp chat button the owner can turn on, and the store's own icon", async ({ page, request }) => {
  const { data: before } = await db().from("store_settings").select("contact").eq("id", 1).single();
  const original = (before!.contact as { whatsapp?: string }).whatsapp ?? "";
  try {
    await page.goto("/admin/settings?tab=general");
    await page.getByLabel("WhatsApp").fill("+91 98450 12345");
    await page.getByLabel("Show a “Chat with us” button on the store").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved.").first()).toBeVisible();

    await page.goto("/");
    const chat = page.getByRole("link", { name: "Chat with us on WhatsApp" });
    await expect(chat).toBeVisible();
    await expect(chat).toHaveAttribute("href", /^https:\/\/wa\.me\/919845012345\?text=/);
    // Not in the way at checkout.
    await page.goto("/cart");
    await expect(page.getByRole("link", { name: "Chat with us on WhatsApp" })).toHaveCount(0);

    await page.goto("/admin/settings?tab=general");
    await page.getByLabel("Show a “Chat with us” button on the store").uncheck();
    await page.getByLabel("WhatsApp").fill(original);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved.").first()).toBeVisible();
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Chat with us on WhatsApp" })).toHaveCount(0);
  } finally {
    await db().from("store_settings").update({ contact: before!.contact }).eq("id", 1);
  }

  // The store's icon: its initial in its own colours, linked from every storefront page.
  const href = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect(href).toMatch(/^\/store-icon\.svg\?v=/);
  const icon = await request.get(href!);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  const svg = await icon.text();
  expect(svg).toContain(">T</text>");
  expect(svg.toLowerCase()).toContain("#6b1d2e");
});
