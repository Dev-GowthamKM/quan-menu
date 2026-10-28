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

test("cinematic designs open with a curtain once a visit, zoom the banner, raise their headlines and mark the chapters", async ({ page, context, browser }) => {
  await page.goto("/admin/settings?tab=appearance");
  const tab = await preview(page, context, "Cinema");
  const html = tab.locator("html");
  // The curtain with the store's name lifts by itself, and doesn't come back on this visit.
  await expect(html).toHaveClass(/intro-seen/);
  await expect(html).not.toHaveClass(/intro-playing/);
  await expect(tab.locator(".intro")).toBeHidden();
  await tab.reload({ waitUntil: "domcontentloaded" });
  await expect(html).not.toHaveClass(/intro-playing/);

  // A new visit (a new tab) opens with it; a tap lifts it at once.
  const fresh = await context.newPage();
  await fresh.addInitScript(() => {
    new MutationObserver(() => {
      if (document.documentElement?.classList.contains("intro-playing")) (window as unknown as { intro: boolean }).intro = true;
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  await fresh.goto("/", { waitUntil: "domcontentloaded" });
  expect(await fresh.evaluate(() => (window as unknown as { intro?: boolean }).intro)).toBe(true);
  await expect(fresh.locator(".intro")).toContainText(/\S/);
  await fresh.mouse.click(10, 300);
  await expect(fresh.locator("html")).toHaveClass(/intro-seen/);
  await expect(fresh.locator(".intro")).toBeHidden();
  await fresh.close();

  // The banner zooms in as the page scrolls over it.
  const hero = tab.locator("[data-zoom]");
  await tab.evaluate(() => window.scrollTo(0, window.innerHeight * 0.4));
  await expect.poll(() => hero.evaluate((el) => Number(el.style.getPropertyValue("--zoom")))).toBeGreaterThan(0.3);
  await expect(tab.locator('[data-zoom] h1[data-rise="load"]')).toHaveText(/\S/);

  // Headlines rise as they come into view, line by line, keeping their words.
  const title = tab.locator("main .sh-title[data-rise]").first();
  const words = (await title.textContent())!;
  await title.scrollIntoViewIfNeeded();
  await expect(title).toHaveClass(/is-in/);
  await expect(title).toHaveText(words);
  await expect(title.locator(".rise-w").first()).toHaveCSS("--line", "0");

  // The Spotlight's dots show the chapter on screen and go to any other.
  const dots = tab.getByRole("navigation", { name: "Spotlight chapters" }).getByRole("button");
  await tab.getByRole("region", { name: "Spotlight" }).scrollIntoViewIfNeeded();
  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "step");
  await expect(dots.nth(0)).not.toHaveAttribute("aria-current", "step");
  await expectAccessible(tab, "Cinema: home after the curtain");
  await tab.close();

  // Shoppers who ask for less motion get the page straight away, still.
  const still = await browser.newContext({ reducedMotion: "reduce", storageState: OWNER.state });
  const quiet = await still.newPage();
  await quiet.goto("/admin/settings?tab=appearance");
  const calm = await preview(quiet, still, "Cinema");
  await expect(calm.locator("html")).not.toHaveClass(/intro-playing/);
  await expect(calm.locator(".intro")).toBeHidden();
  await expect(calm.locator("html")).not.toHaveClass(/motion-ready/);
  await still.close();
});

test("a rail brings a piece forward, an aisle walks past the products, and moving bands and numbers tell the rest", async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  await page.goto("/admin/settings?tab=appearance");

  // Neon: the promises on moving bands, the pieces on a rail, the store in numbers.
  const neon = await preview(page, context, "Neon");
  await expect(neon.locator("html")).toHaveClass(/intro-seen/);
  const band = neon.getByRole("region", { name: "What we promise" });
  await expect(band.getByRole("listitem").first()).toHaveText(/\S/);
  const rail = neon.getByRole("region", { name: "Take your pick" });
  const pieces = rail.getByRole("button", { name: /: take a closer look$/ });
  await rail.scrollIntoViewIfNeeded();
  const name = (await pieces.nth(1).getAttribute("aria-label"))!.replace(/: take a closer look$/, "");
  await pieces.nth(1).click();
  const look = neon.getByRole("dialog", { name });
  await expect(look.getByRole("heading", { name })).toBeVisible();
  await expect(look.getByRole("link", { name: "Shop now" })).toHaveAttribute("href", /^\/products\//);
  // Its back, where it has a second photo, and the next piece without going back to the rail.
  const back = look.getByRole("button", { name: "Back", exact: true });
  if (await back.count()) {
    await back.click();
    await expect(back).toHaveAttribute("aria-pressed", "true");
  }
  await expectAccessible(neon, "Neon: a piece brought forward from the rail");
  await look.getByRole("button", { name: "Next piece" }).click();
  await expect(neon.getByRole("dialog").getByRole("heading", { level: 2 })).not.toHaveText(name);
  await neon.keyboard.press("Escape");
  await expect(neon.getByRole("dialog")).toHaveCount(0);
  // Back on the rail, at the piece last looked at.
  await expect(pieces.nth(2)).toBeFocused();
  const numbers = neon.getByRole("region", { name: "By the numbers" });
  await numbers.scrollIntoViewIfNeeded();
  await expect(numbers.locator("dd").first()).toContainText(/\d/);
  await expect(numbers.locator("dt").first()).toHaveText(/to choose from/);
  await expectAccessible(neon, "Neon: bands, rail and numbers");
  await neon.close();

  // Cinema: the aisle, walked by scrolling, naming the next piece on the way.
  const cinema = await preview(page, context, "Cinema");
  const aisle = cinema.getByRole("region", { name: "Walk the aisle" });
  await expect(aisle.getByRole("link", { name: /^01 \/ \d\d/ })).toBeAttached();
  await aisle.evaluate((el: HTMLElement) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + el.offsetHeight * 0.55));
  await expect(aisle.getByRole("link", { name: /^\d\d \/ \d\d/ })).toBeVisible();
  await expect(aisle.getByRole("link", { name: /^01 \/ \d\d/ })).toHaveCount(0);
  await expect(aisle.getByRole("link", { name: "Shop all" })).toBeAttached();
  await expectAccessible(cinema, "Cinema: the aisle");
  await cinema.close();

  // Shoppers who ask for less motion get the aisle's products as a grid, still.
  const still = await browser.newContext({ reducedMotion: "reduce", storageState: OWNER.state });
  const quiet = await still.newPage();
  await quiet.goto("/admin/settings?tab=appearance");
  const calm = await preview(quiet, still, "Cinema");
  const stillAisle = calm.getByRole("region", { name: "Walk the aisle" });
  await expect(stillAisle.locator(".aisle-walk")).toBeHidden();
  await expect(stillAisle.locator(".aisle-still article").first()).toBeVisible();
  await still.close();
});

test("the store's own numbers, set in Settings › Homepage", async ({ page }) => {
  const { data: before } = await db().from("store_settings").select("homepage").eq("id", 1).single();
  try {
    await page.goto("/admin/settings?tab=homepage");
    await page.getByLabel("Show Numbers: your store in figures, counting up (your own below, or the store's)").check();
    await page.getByRole("button", { name: "Add a number" }).click();
    await page.getByLabel("Number 1").fill("12,000+");
    await page.getByLabel("What it counts").fill("happy customers");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Settings saved.").first()).toBeVisible();
    await page.goto("/");
    const numbers = page.getByRole("region", { name: "By the numbers" });
    await numbers.scrollIntoViewIfNeeded();
    await expect(numbers.getByText("happy customers")).toBeVisible();
    await expect(numbers.locator("dd")).toContainText("12,000+");
  } finally {
    await db().from("store_settings").update({ homepage: before!.homepage }).eq("id", 1);
  }
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
