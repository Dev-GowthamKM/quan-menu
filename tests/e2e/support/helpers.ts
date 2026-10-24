import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./env";

export const env = loadEnv();

/** Service-role client for checking what the database holds (tests only). */
export const db = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** Replaces Razorpay Checkout with a stub that pays (or fails) through the local mock API. */
export async function stubRazorpay(context: BrowserContext, outcome: "captured" | "failed" | "dismiss") {
  const stub = readFileSync("tests/e2e/support/razorpay-checkout-stub.js", "utf8");
  await context.route("https://checkout.razorpay.com/v1/checkout.js", (r) => r.fulfill({ contentType: "application/javascript", body: stub }));
  await context.addInitScript((o) => {
    (window as unknown as { __RZP_OUTCOME: string }).__RZP_OUTCOME = o;
  }, outcome);
}

/** origin: another store's address (default: the main store's). */
export async function addToBag(page: Page, slug: string, size: string, quantity = 1, origin = "") {
  await page.goto(`${origin}/products/${slug}`);
  await page.getByRole("button", { name: `Size ${size}`, exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  if (quantity > 1) {
    await page.goto(`${origin}/cart`);
    for (let i = 1; i < quantity; i++) {
      await page.getByRole("button", { name: "Increase quantity" }).first().click();
      await expect(page.getByRole("group", { name: /Quantity of/ }).first()).toContainText(String(i + 1));
    }
  }
}

/** A mobile number no other test uses (cash-on-delivery limits count orders per phone). */
export const uniquePhone = () => `+91 9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

/**
 * Guest checkout from the cart through to the pay button, or "Place order" for cash on
 * delivery (with a phone number of its own, unless one is given).
 */
export async function checkout(page: Page, email: string, opts: { coupon?: string; whatsapp?: boolean; phone?: string; cod?: boolean; origin?: string } = {}) {
  const phone = opts.phone ?? (opts.cod ? uniquePhone() : "+91 98765 43210");
  await page.goto(`${opts.origin ?? ""}/cart`);
  if (opts.coupon) {
    await page.fill("#cart-coupon", opts.coupon);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`${opts.coupon}:`)).toBeVisible();
  }
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("**/checkout");
  await page.fill("#co-email", email);
  await page.fill("#co-phone", phone);
  if (opts.whatsapp) await page.getByLabel(/Send my order updates on WhatsApp/).check();
  await page.getByRole("button", { name: "Continue to address" }).click();
  await page.fill("#a-name", "Asha Rao");
  await page.fill("#a-line1", "12, 4th Cross, Indiranagar");
  await page.fill("#a-pin", "560038");
  await page.fill("#a-city", "Bengaluru");
  await page.selectOption("#a-state", "Karnataka");
  await page.fill("#a-phone", phone);
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  if (opts.cod) await page.getByRole("radio", { name: /^Cash on delivery/ }).check();
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: opts.cod ? /^Place order/ : /^Pay ₹/ }).click();
}

/** The private link a guest uses to open their order (same signature as the app's). */
export function orderLink(orderNumber: string, orderId: string) {
  const key = createHmac("sha256", env.ORDER_LINK_SECRET || env.SUPABASE_SERVICE_ROLE_KEY).update(`order:${orderId}`).digest("base64url").slice(0, 32);
  return `/orders/${orderNumber}?key=${key}`;
}

/**
 * A guest order placed straight through the server-only checkout function (faster than
 * clicking through checkout when a test is about what happens afterwards).
 */
export async function placeOrder(method: "cod" | "razorpay", email: string, address: Record<string, string> = {}) {
  const sb = db();
  const { data: variant } = await sb
    .from("product_variants")
    .select("id, products!inner(status)")
    .eq("is_active", true)
    .eq("products.status", "active")
    .gte("stock_quantity", 5)
    .limit(1)
    .single();
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const add = await sb.rpc("cart_set_item", { p_user_id: null as never, p_token: token, p_variant_id: variant!.id, p_quantity: 1, p_mode: "add" });
  if (add.error) throw new Error(add.error.message);
  const placed = await sb.rpc("place_order", {
    p_user_id: null as never, p_cart_token: token, p_idempotency_key: randomUUID(), p_email: email, p_phone: "",
    p_shipping_address: { full_name: "Ravi Kumar", phone: uniquePhone(), line1: "22 Residency Road", city: "Bengaluru", state: "Karnataka", postal_code: "560025", country: "IN", ...address },
    p_billing_address: null as never, p_rate_id: null as never, p_payment_method: method,
  });
  if (placed.error) throw new Error(placed.error.message);
  const o = placed.data as { id: string; order_number: string; grand_total: number };
  return { id: o.id, number: o.order_number, total: o.grand_total };
}

/** A Razorpay webhook request signed with the configured secret. */
export function signedWebhook(body: object, eventId = `evt_${randomUUID()}`) {
  const raw = JSON.stringify(body);
  const signature = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
  return { raw, headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": eventId } };
}

/** A solid-colour PNG made in memory (no fixture files), for upload tests. */
export function pngBuffer(width = 400, height = 500, rgb: [number, number, number] = [40, 52, 84]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Fails on serious or critical axe-core findings (WCAG 2.1 A and AA rules) on the page as it is now. */
export async function expectAccessible(page: Page, label = page.url()) {
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // Next.js's development overlay isn't part of the app.
    .exclude("nextjs-portal")
    .analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(report, `${label}\n${report.join("\n")}`).toEqual([]);
}
