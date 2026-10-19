import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
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

export async function addToBag(page: Page, slug: string, size: string, quantity = 1) {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: `Size ${size}`, exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  if (quantity > 1) {
    await page.goto("/cart");
    for (let i = 1; i < quantity; i++) {
      await page.getByRole("button", { name: "Increase quantity" }).first().click();
      await expect(page.getByRole("group", { name: /Quantity of/ }).first()).toContainText(String(i + 1));
    }
  }
}

/** Guest checkout from the cart through to the pay button. */
export async function checkout(page: Page, email: string, opts: { coupon?: string } = {}) {
  await page.goto("/cart");
  if (opts.coupon) {
    await page.fill("#cart-coupon", opts.coupon);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(`${opts.coupon}:`)).toBeVisible();
  }
  await page.getByRole("link", { name: "Checkout" }).click();
  await page.waitForURL("**/checkout");
  await page.fill("#co-email", email);
  await page.fill("#co-phone", "+91 98765 43210");
  await page.getByRole("button", { name: "Continue to address" }).click();
  await page.fill("#a-name", "Asha Rao");
  await page.fill("#a-line1", "12, 4th Cross, Indiranagar");
  await page.fill("#a-pin", "560038");
  await page.fill("#a-city", "Bengaluru");
  await page.selectOption("#a-state", "Karnataka");
  await page.fill("#a-phone", "+91 98765 43210");
  await page.getByRole("button", { name: "Continue to delivery" }).click();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: /^Pay ₹/ }).click();
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
