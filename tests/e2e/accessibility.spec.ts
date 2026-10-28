// Automated accessibility checks (axe-core, WCAG 2.1 A/AA rules) on the main storefront
// and admin pages. Automated checks catch roughly a third of issues; keyboard and screen
// reader testing is still needed before launch.
import { test, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { db, expectAccessible } from "./support/helpers";

async function audit(page: Page, path: string) {
  await page.goto(path);
  await expectAccessible(page, path);
}

test.describe("storefront", () => {
  test("home, listing, product, cart, checkout and sign-in pages", async ({ page }) => {
    const { data } = await db().from("products").select("slug").eq("status", "active").lte("published_at", new Date().toISOString()).limit(1).single();
    for (const path of ["/", "/shop", "/category/women", `/products/${data!.slug}`, "/brands", "/collections", "/cart", "/login", "/signup", "/orders/lookup", "/contact", "/faq", "/pages/returns"]) {
      await audit(page, path);
    }
    await page.goto(`/products/${data!.slug}`);
    // Whichever product comes first: a size to choose only if it comes in sizes.
    const size = page.getByRole("button", { name: /^Size (?!guide)/ }).first();
    if (await size.count()) await size.click();
    await page.getByRole("button", { name: "Add to bag" }).click();
    await audit(page, "/checkout");
  });
});

test.describe("admin", () => {
  test.use({ storageState: OWNER.state });
  test("dashboard, catalog, orders and settings pages", async ({ page }) => {
    const { data: product } = await db().from("products").select("id").limit(1).single();
    const { data: order } = await db().from("orders").select("order_number").limit(1).maybeSingle();
    const paths = [
      "/admin", "/admin/products", "/admin/products/new", `/admin/products/${product!.id}`, "/admin/products/import", "/admin/inventory",
      "/admin/collections", "/admin/media", "/admin/orders", "/admin/customers", "/admin/discounts", "/admin/shipping", "/admin/settings",
      "/admin/settings?tab=payments", "/admin/settings?tab=appearance", "/admin/settings?tab=homepage", "/admin/setup", "/admin/stores", "/admin/stores/new",
    ];
    if (order) paths.push(`/admin/orders/${order.order_number}`);
    for (const path of paths) await audit(page, path);
  });
});
