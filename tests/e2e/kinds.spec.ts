// Stores of every kind: a pet shop made in Platform › New store speaks a pet shop's language
// (its departments, home page, product page and policies), a product names its options its
// own way (pack size and flavour, shown as words rather than colour swatches) in the editor
// and on its page, and changing what the store sells changes its words.
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { db, expectAccessible } from "./support/helpers";

test.use({ storageState: OWNER.state });

const run = randomUUID().slice(0, 6);
const NAME = `Wag and Purr ${run}`;
const HOST = `wag-${run}.localhost:3000`;
const ORIGIN = `http://${HOST}`;
const PREFIX = `W${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;

/** Switches the owner's admin panel to a store with the store picker. */
async function useStore(page: Page, name: string) {
  await page.goto("/admin");
  await page.getByLabel("Store").selectOption({ label: name });
  await page.waitForURL("**/admin");
  await expect(page.getByLabel("Store").locator("option:checked")).toHaveText(name);
  await page.waitForLoadState("networkidle");
}

test("a pet shop speaks a pet shop's language, and a product names its own options", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await page.goto("/admin/stores/new");
  await page.getByLabel("Store name").fill(NAME);
  await page.getByLabel("What it sells").selectOption("pets");
  const departments = page.getByLabel("Start with departments: Dogs, Cats, Birds and small pets, Food and treats");
  await expect(departments).toBeChecked();
  await page.getByLabel("Order numbers start with").fill(PREFIX);
  await page.getByLabel("Address customers will visit").fill(HOST);
  await page.getByRole("radio", { name: "Atelier" }).click();
  await page.getByRole("button", { name: "Create store" }).click();
  await expect(page.getByText(`${NAME} is ready. Next:`)).toBeVisible();
  const storeId = page.url().match(/stores\/([0-9a-f-]{36})/)![1];

  // A food with pack sizes and flavours, in the Dogs department.
  const { data: dogs } = await db().from("categories").select("id").eq("store_id", storeId).eq("slug", "dogs").single();
  const { data: photo } = await db().from("product_images").select("url").limit(1).single();
  const slug = `kibble-${run}`;
  const { data: product } = await db()
    .from("products")
    .insert({
      store_id: storeId, title: "Garden Kibble", slug, price: 89900, status: "active", published_at: new Date().toISOString(), category_id: dogs!.id,
      description: "Slow-baked kibble for grown dogs.", fabric: "Chicken (40%), brown rice, peas", fit: "For dogs of 10–25 kg: 150–250 g a day.",
      option_names: { size: "Pack size", color: "Flavour" },
    })
    .select("id")
    .single();
  await db().from("product_variants").insert(
    [["1 kg", "Chicken"], ["3 kg", "Chicken"], ["1 kg", "Fish"], ["3 kg", "Fish"]].map(([size, color], i) => ({
      store_id: storeId, product_id: product!.id, sku: `KIB-${run}-${i}`.toUpperCase(), size, color, stock_quantity: 10,
    })),
  );
  await db().from("product_images").insert({ store_id: storeId, product_id: product!.id, url: photo!.url, alt: "Garden Kibble", position: 0 });

  // The home page in a pet shop's words.
  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const shop = await guest.newPage();
  await shop.goto(`${ORIGIN}/`);
  await expect(shop.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dogs" })).toBeVisible();
  await expect(shop.getByRole("heading", { name: "Shop by pet" })).toBeVisible();
  await expect(shop.getByRole("heading", { name: "Pet favourites" })).toBeVisible();
  await expect(shop.getByRole("heading", { name: "First to know, first to wag" })).toBeVisible();

  // The product page names its options its own way, and shows flavours as words.
  await shop.goto(`${ORIGIN}/products/${slug}`);
  await expect(shop.getByText("Pack size", { exact: true })).toBeVisible();
  await expect(shop.getByText(/^Flavour:/)).toBeVisible();
  await expect(shop.getByRole("button", { name: "Fish", exact: true })).toBeVisible();
  await shop.getByRole("button", { name: "Add to bag" }).click();
  await expect(shop.getByRole("alert").filter({ hasText: "Please choose a pack size." })).toBeVisible();
  await shop.getByRole("button", { name: "Pack size 3 kg" }).click();
  await expect(shop.getByText("Ingredients & care")).toBeVisible();
  await expect(shop.getByText("Sizing & feeding")).toBeVisible();
  await shop.getByText("Shipping & returns").click();
  await expect(shop.getByText(/for unused items in their original packaging/)).toBeVisible();
  await expectAccessible(shop, "pet shop: product page");
  // Its returns policy was written for a pet shop.
  await shop.goto(`${ORIGIN}/pages/returns`);
  await expect(shop.getByText(/Opened food and treats cannot be returned/)).toBeVisible();

  // The editor speaks the same language, and renames the product's options.
  await useStore(page, NAME);
  await page.goto(`/admin/products/${product!.id}`);
  await expect(page.getByLabel("Ingredients and materials")).toHaveValue("Chicken (40%), brown rice, peas");
  await expect(page.getByLabel("First option is called")).toHaveValue("Pack size");
  await expect(page.getByText("Pack sizes", { exact: true })).toBeVisible();
  await page.getByLabel("Second option is called").fill("Recipe");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Product saved.").first()).toBeVisible();
  await shop.goto(`${ORIGIN}/products/${slug}`);
  await expect(shop.getByText(/^Recipe:/)).toBeVisible();

  // Selling something else changes the store's words.
  await page.goto("/admin/settings?tab=general");
  await page.getByLabel("What the store sells").selectOption("instruments");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Settings saved.").first()).toBeVisible();
  await shop.goto(`${ORIGIN}/`);
  await expect(shop.getByRole("heading", { name: "Find your sound" })).toBeVisible();
  await guest.close();
  await useStore(page, "Taana");
});
