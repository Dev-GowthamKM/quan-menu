// Courier bookings through Shiprocket (the bundled mock): staff turn it on, book a courier
// from the order page, print the label, and tracking updates (webhook, or "Refresh
// tracking") move the order along and show on the customer's order page.
import { expect, test } from "@playwright/test";
import { OWNER } from "./support/env";
import { db, env, orderLink, placeOrder } from "./support/helpers";

const MOCK = "http://localhost:4011";
const run = Date.now().toString(36).toUpperCase();

test.use({ storageState: OWNER.state });

test("staff book a Shiprocket courier, and tracking updates reach the order and the customer", async ({ page, request, browser }) => {
  // Turn the courier connection on.
  await page.goto("/admin/shipping");
  const card = page.locator("section", { hasText: "Courier connection (Shiprocket)" });
  await card.getByLabel("Book couriers with Shiprocket").check();
  await card.getByLabel("Pickup address name").fill("Primary");
  await card.getByLabel("Pickup PIN code").fill("400001");
  await card.getByRole("button", { name: "Save courier settings" }).click();
  await expect(page.getByText("Courier settings saved.")).toBeVisible();
  await card.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connected to Shiprocket.")).toBeVisible();

  const order = await placeOrder("cod", `courier-${run.toLowerCase()}@example.com`);
  await page.goto(`/admin/orders/${order.number}`);
  await page.getByRole("button", { name: "Book courier…" }).click();
  await expect(page.getByRole("combobox", { name: "Courier" })).toContainText("Delhivery Surface");
  await page.getByRole("button", { name: "Book courier", exact: true }).click();
  await expect(page.getByText(/Courier booked: Delhivery Surface, AWB \d+/)).toBeVisible();

  const { data: ship } = await db().from("shipments").select("tracking_number, provider, status, pickup_scheduled_for").eq("order_id", order.id).single();
  expect(ship).toMatchObject({ provider: "shiprocket", status: "packed" });
  expect(ship!.pickup_scheduled_for).not.toBeNull();
  const awb = ship!.tracking_number;
  await expect(page.getByText(awb).first()).toBeVisible();
  await expect(page.getByText(/Pickup \d+ \w+ \d{4}/)).toBeVisible();

  // What Shiprocket was asked to deliver and collect.
  const sent = ((await (await request.get(`${MOCK}/__test/orders`)).json()) as Record<string, unknown>[]).find((x) => x.order_id === order.number)!;
  expect(sent).toMatchObject({ payment_method: "COD", billing_pincode: "560025", pickup_location: "Primary", billing_customer_name: "Ravi" });
  expect(String(sent.billing_phone)).toMatch(/^9\d{9}$/);
  const collected = Number(sent.sub_total) + Number(sent.shipping_charges) + Number(sent.transaction_charges);
  expect(collected).toBeCloseTo(order.total / 100, 2);

  await page.getByRole("button", { name: "Shipping label" }).click();
  await expect(page.getByRole("link", { name: "Open the label (PDF)" })).toHaveAttribute("href", /__labels\/\d+\.pdf/);

  // The courier picks it up: Shiprocket's webhook needs the shared token.
  const update = (status: string, id: number, time: string) => ({
    awb, courier_name: "Delhivery Surface", current_status: status, current_status_id: id, shipment_status: status, shipment_status_id: id,
    current_timestamp: time, etd: "", is_return: 0,
    scans: [{ date: "2026-10-21 11:00:00", activity: status, location: "Mumbai_Hub (Maharashtra)", "sr-status-label": status }],
  });
  const forged = await request.post("/api/webhooks/courier", { data: update("DELIVERED", 7, "21 10 2026 11:00:00"), headers: { "x-api-key": "not-the-token" } });
  expect(forged.status()).toBe(401);
  const picked = await request.post("/api/webhooks/courier", { data: update("PICKED UP", 42, "21 10 2026 11:00:00"), headers: { "x-api-key": env.SHIPROCKET_WEBHOOK_TOKEN } });
  expect(picked.status()).toBe(200);
  expect((await picked.json()).result).toBe("shipped");
  const again = await request.post("/api/webhooks/courier", { data: update("PICKED UP", 42, "21 10 2026 11:00:00"), headers: { "x-api-key": env.SHIPROCKET_WEBHOOK_TOKEN } });
  expect((await again.json()).duplicate).toBe(true);

  const guest = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const mine = await guest.newPage();
  await mine.goto(orderLink(order.number, order.id));
  await expect(mine.getByText("Latest update:")).toBeVisible();
  await expect(mine.getByText("Picked up").first()).toBeVisible();
  await expect(mine.getByText(awb).first()).toBeVisible();
  await guest.close();

  // A delivery the webhook missed: staff pull the latest tracking.
  await request.post(`${MOCK}/__test/track`, { data: { awb, status: "DELIVERED", status_id: 7 } });
  await page.reload();
  await page.getByRole("button", { name: "Refresh tracking" }).click();
  await expect(page.getByText("Tracking updated: Delivered.")).toBeVisible();
  const { data: done } = await db().from("orders").select("status, fulfillment_status").eq("id", order.id).single();
  expect(done).toEqual({ status: "completed", fulfillment_status: "delivered" });
  const { data: mail } = await db().from("email_outbox").select("template").eq("order_id", order.id);
  expect((mail ?? []).map((m) => m.template)).toEqual(expect.arrayContaining(["order_shipped", "order_delivered"]));

  // Leave the store as it was.
  await page.goto("/admin/shipping");
  await card.getByLabel("Book couriers with Shiprocket").uncheck();
  await card.getByRole("button", { name: "Save courier settings" }).click();
  await expect(page.getByText("Courier settings saved.")).toBeVisible();
});

test("a parcel returned undelivered cancels the cash-on-delivery order and restocks it", async ({ page }) => {
  const order = await placeOrder("cod", `rto-${run.toLowerCase()}@example.com`);
  await page.goto(`/admin/orders/${order.number}`);
  await page.getByRole("button", { name: "Mark shipped…" }).click();
  await page.getByLabel("Tracking number").fill(`RTO${run}`);
  await page.getByRole("button", { name: "Save shipment" }).click();
  await expect(page.getByRole("button", { name: "Mark delivered" })).toBeVisible();

  page.once("dialog", (d) => d.accept("Customer refused the parcel"));
  await page.getByRole("button", { name: "Mark returned to origin" }).click();
  await expect(page.getByText(/Marked as returned to origin/)).toBeVisible();
  await expect(page.getByText("All items have been returned.")).toBeVisible();
  const { data } = await db().from("orders").select("status, payment_status, fulfillment_status").eq("id", order.id).single();
  expect(data).toEqual({ status: "cancelled", payment_status: "voided", fulfillment_status: "returned" });
});
