// Automated accessibility checks (axe-core, WCAG 2.1 A/AA rules) on the main storefront
// and admin pages. Automated checks catch roughly a third of issues; keyboard and screen
// reader testing is still needed before launch.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { OWNER } from "./support/env";
import { db } from "./support/helpers";

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next.js's development overlay isn't part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(report, `${path}\n${report.join("\n")}`).toEqual([]);
}

test.describe("storefront", () => {
  test("home, listing, product, cart, checkout and sign-in pages", async ({ page }) => {
    const { data } = await db().from("products").select("slug").eq("status", "active").lte("published_at", new Date().toISOString()).limit(1).single();
    for (const path of ["/", "/shop", "/category/women", `/products/${data!.slug}`, "/brands", "/collections", "/cart", "/login", "/signup", "/orders/lookup", "/contact", "/faq", "/pages/returns"]) {
      await audit(page, path);
    }
    await page.goto(`/products/${data!.slug}`);
    await page.getByRole("button", { name: /^Size / }).first().click();
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
    ];
    if (order) paths.push(`/admin/orders/${order.order_number}`);
    for (const path of paths) await audit(page, path);
  });
});
