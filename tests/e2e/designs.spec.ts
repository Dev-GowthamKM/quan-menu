// Store designs: each of the eight builds the storefront its own way and stays accessible;
// "Preview on the store" shows an unsaved look only in the browser that opens the signed
// link; the home page follows the store's own section order; the WhatsApp chat button and
// each store's own icon; a film in the opening banner; a product's 360° view.
import { join } from "node:path";
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
  {
    name: "Cinema",
    key: "cinema",
    home: async (p) => {
      // A full-screen opening scene under a floating header, then chapters to scroll through.
      await expect(p.locator('[data-hero="film"]')).toBeVisible();
      await expect(p.locator("header").first()).toHaveClass(/overlay-clear/);
      await expect(p.locator("[data-design]")).toHaveAttribute("data-motion", "cinematic");
      await expect(p.getByRole("region", { name: "Spotlight" })).toBeVisible();
    },
  },
  {
    name: "Neon",
    key: "neon",
    home: async (p) => {
      await expect(p.locator("[data-design]")).toHaveAttribute("data-scheme", "dark");
      await expect(p.locator('[data-hero="glow"]')).toBeVisible();
      // A glass header with a button of its own.
      await expect(p.locator("header").first().getByRole("link", { name: "Shop now" })).toBeVisible();
      // The Showcase: one piece at a time, the next one brought forward by the arrows or its dot.
      const show = p.getByRole("region", { name: "Pieces we love" });
      const piece = show.getByRole("heading", { level: 3 });
      const first = (await piece.textContent())!;
      await show.getByRole("button", { name: "Next piece" }).click();
      await expect(piece).not.toHaveText(first);
      await expect(show.getByRole("button", { name: `Show ${await piece.textContent()}` })).toHaveAttribute("aria-current", "true");
      await show.getByRole("button", { name: `Show ${first}` }).click();
      await expect(piece).toHaveText(first);
      await expect(show.getByRole("link", { name: `Shop now: ${first}` })).toHaveAttribute("href", /^\/products\//);
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
  await expect(tab.locator("[data-design]")).toHaveAttribute("data-design", "neon");
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

test("a film in the opening banner, and the picture for shoppers who ask for less motion", async ({ page, browser }) => {
  const { data: before } = await db().from("store_settings").select("homepage").eq("id", 1).single();
  try {
    await page.goto("/admin/settings?tab=homepage");
    await page.getByLabel("Video (optional): file").setInputFiles(join(__dirname, "fixtures/banner.webm"));
    await expect(page.locator("form video")).toHaveAttribute("src", /\/homepage\/.+\.webm$/);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved.").first()).toBeVisible();

    // It plays, silently, beside the banner's heading, and can be paused.
    await page.goto("/");
    const film = page.locator("main video").first();
    await expect(film).toHaveAttribute("src", /\/homepage\/.+\.webm$/);
    await expect.poll(() => film.evaluate((v: HTMLVideoElement) => v.muted && !v.paused)).toBe(true);
    const pause = page.getByRole("button", { name: "Pause the film" });
    await pause.click();
    await expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(await film.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
    await expectAccessible(page, "home with a film");

    // Shoppers whose device asks for less motion see the picture alone.
    const still = await browser.newContext({ reducedMotion: "reduce" });
    const visit = await still.newPage();
    await visit.goto("/");
    await expect(visit.locator("main img").first()).toBeVisible();
    await expect(visit.locator("main video")).toHaveCount(0);
    await still.close();
  } finally {
    await db().from("store_settings").update({ homepage: before!.homepage }).eq("id", 1);
  }
});

test("a product shown as a 360° view, turned by dragging or with the arrow keys", async ({ page }) => {
  // A product of its own with nine photos taken all the way round.
  const { data: photo } = await db().from("product_images").select("url, store_id").limit(1).single();
  const slug = `spin-${Date.now()}`;
  const { data: product } = await db()
    .from("products")
    .insert({ store_id: photo!.store_id, title: "Turning Jacket", slug, price: 499900, status: "active", published_at: new Date().toISOString() })
    .select("id")
    .single();
  try {
    await db().from("product_variants").insert({ store_id: photo!.store_id, product_id: product!.id, sku: `SPIN-${Date.now()}`, size: "M", stock_quantity: 5 });
    await db().from("product_images").insert(Array.from({ length: 9 }, (_, i) => ({ store_id: photo!.store_id, product_id: product!.id, url: photo!.url, alt: `Angle ${i + 1}`, position: i })));

    await page.goto(`/admin/products/${product!.id}`);
    await page.getByLabel("Show as a 360° view").check();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Product saved.").first()).toBeVisible();

    await page.goto(`/products/${slug}`);
    const spin = page.getByRole("slider", { name: "Turning Jacket: 360° view" });
    await expect(spin).toBeVisible();
    await expect(page.getByRole("button", { name: "360° view" })).toHaveAttribute("aria-pressed", "true");
    await spin.focus();
    await page.keyboard.press("Home");
    await expect(spin).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("ArrowRight");
    await expect(spin).toHaveAttribute("aria-valuetext", "View 2 of 9");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(spin).toHaveAttribute("aria-valuenow", "9");

    // Dragging across half the picture turns it half way round.
    const box = (await spin.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(spin).not.toHaveAttribute("aria-valuenow", "9");
    await expectAccessible(page, "product: 360° view");

    // The photos are a click away.
    await page.getByRole("button", { name: "Photos" }).click();
    await expect(spin).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Choose image" })).toBeVisible();
  } finally {
    await db().from("products").delete().eq("id", product!.id);
  }
});
