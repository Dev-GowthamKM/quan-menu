// A small stand-in for Shiprocket's API, for local development and end-to-end tests. It
// implements the endpoints the app uses (sign-in, serviceability, orders, AWB, pickup,
// label, cancel, tracking) plus test-only endpoints to read what was booked and to add
// tracking scans. Never used in production: the app only talks to it when
// SHIPROCKET_API_BASE points at localhost.
//
//   node tests/e2e/support/mock-shiprocket.mjs   (PORT=4011, SHIPROCKET_EMAIL/PASSWORD=...)
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SHIPROCKET_PORT || 4011);
const EMAIL = process.env.SHIPROCKET_EMAIL || "api@shiprocket.test";
const PASSWORD = process.env.SHIPROCKET_PASSWORD || "mock-password";

const tokens = new Set();
const orders = new Map(); // shiprocket order id -> order
const shipments = new Map(); // shipment id -> { orderId, awb, courier, cancelled, activities: [] }
let nextId = 5_000_001;

const COURIERS = [
  { courier_company_id: 10, courier_name: "Delhivery Surface", rate: 72.5, days: 4, cod: 1, rating: 4.1 },
  { courier_company_id: 33, courier_name: "Xpressbees Surface", rate: 64, days: 5, cod: 1, rating: 3.9 },
  { courier_company_id: 24, courier_name: "Blue Dart Air", rate: 145, days: 2, cod: 0, rating: 4.6 },
];

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const ist = (d) => {
  const t = new Date(d.getTime() + 5.5 * 3600_000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 19)}`;
};
const etdText = (days) => new Date(Date.now() + days * 86400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // --- Test-only helpers -------------------------------------------------------------
  if (path === "/__test/orders" && req.method === "GET") return send(res, 200, [...orders.values()]);
  if (path === "/__test/track" && req.method === "POST") {
    const { awb, status, status_id, location = "Bengaluru_Hub (Karnataka)" } = await readJson(req);
    const s = [...shipments.values()].find((x) => x.awb === awb);
    if (!s) return send(res, 404, { message: "Unknown AWB" });
    s.activities.push({ date: ist(new Date()), status: "X-TEST", activity: status, location, "sr-status": String(status_id ?? ""), "sr-status-label": status });
    s.status = status;
    s.statusId = status_id ?? null;
    return send(res, 200, { ok: true });
  }
  if (path.startsWith("/__labels/")) return send(res, 200, "%PDF-1.4\n% mock shipping label\n", "application/pdf");

  // --- Shiprocket API ----------------------------------------------------------------
  if (path === "/v1/external/auth/login" && req.method === "POST") {
    const { email, password } = await readJson(req);
    if (email !== EMAIL || password !== PASSWORD) return send(res, 400, { message: "Invalid email and password combination", status_code: 400 });
    const token = randomBytes(16).toString("hex");
    tokens.add(token);
    return send(res, 200, { id: 1, email, token });
  }
  const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!tokens.has(auth)) return send(res, 401, { message: "Token has expired", status_code: 401 });

  if (path === "/v1/external/courier/serviceability/" && req.method === "GET") {
    const delivery = url.searchParams.get("delivery_postcode") || "";
    const cod = url.searchParams.get("cod") === "1";
    if (!/^[1-8][0-9]{5}$/.test(delivery)) return send(res, 200, { status: 404, message: "Delivery postcode not serviceable" });
    const list = COURIERS.filter((c) => !cod || c.cod).map((c) => ({ ...c, etd: etdText(c.days), estimated_delivery_days: String(c.days) }));
    return send(res, 200, { status: 200, data: { available_courier_companies: list, recommended_courier_company_id: 10 } });
  }

  if (path === "/v1/external/orders/create/adhoc" && req.method === "POST") {
    const body = await readJson(req);
    const missing = ["order_id", "order_date", "pickup_location", "billing_customer_name", "billing_address", "billing_city", "billing_pincode", "billing_state", "billing_email", "billing_phone", "payment_method", "sub_total", "length", "breadth", "height", "weight"]
      .filter((k) => body[k] === undefined || body[k] === "");
    if (missing.length || !Array.isArray(body.order_items) || body.order_items.length === 0) {
      return send(res, 422, { message: "Oops! Invalid Data.", errors: Object.fromEntries(missing.map((k) => [k, [`The ${k} field is required.`]])) });
    }
    if (!/^\d{10}$/.test(String(body.billing_phone))) return send(res, 422, { message: "Oops! Invalid Data.", errors: { billing_phone: ["The billing phone must be 10 digits."] } });
    if ([...orders.values()].some((o) => o.order_id === body.order_id)) return send(res, 422, { message: "Order Id already exists" });
    const orderId = nextId++;
    const shipmentId = nextId++;
    orders.set(orderId, { ...body, sr_order_id: orderId, shipment_id: shipmentId });
    shipments.set(shipmentId, { orderId, awb: null, courier: null, cancelled: false, activities: [], status: "NEW", statusId: null });
    return send(res, 200, { order_id: orderId, shipment_id: shipmentId, status: "NEW", status_code: 1 });
  }

  if (path === "/v1/external/courier/assign/awb" && req.method === "POST") {
    const { shipment_id, courier_id } = await readJson(req);
    const s = shipments.get(Number(shipment_id));
    if (!s || s.cancelled) return send(res, 200, { awb_assign_status: 0, response: { data: { awb_assign_error: "Shipment not found" } } });
    const courier = COURIERS.find((c) => c.courier_company_id === Number(courier_id)) ?? COURIERS[0];
    s.awb = s.awb ?? `${Date.now()}${Math.floor(Math.random() * 10)}`;
    s.courier = courier.courier_name;
    s.status = "AWB ASSIGNED";
    return send(res, 200, { awb_assign_status: 1, response: { data: { awb_code: s.awb, courier_name: courier.courier_name, courier_company_id: courier.courier_company_id, shipment_id } } });
  }

  if (path === "/v1/external/courier/generate/pickup" && req.method === "POST") {
    const { shipment_id } = await readJson(req);
    const s = shipments.get(Number(shipment_id?.[0]));
    if (!s?.awb) return send(res, 400, { message: "Assign an AWB first" });
    const tomorrow = new Date(Date.now() + 86400_000);
    return send(res, 200, { pickup_status: 1, response: { pickup_scheduled_date: `${ist(tomorrow).slice(0, 10)} 10:00:00`, pickup_token_number: "Reference No: MOCK" } });
  }

  if (path === "/v1/external/courier/generate/label" && req.method === "POST") {
    const { shipment_id } = await readJson(req);
    const id = Number(shipment_id?.[0]);
    if (!shipments.get(id)?.awb) return send(res, 400, { message: "Assign an AWB first" });
    return send(res, 200, { label_created: 1, label_url: `http://localhost:${PORT}/__labels/${id}.pdf`, response: "Label has been created and uploaded successfully!", not_created: [] });
  }

  if (path === "/v1/external/orders/cancel" && req.method === "POST") {
    const { ids } = await readJson(req);
    for (const id of ids ?? []) {
      const o = orders.get(Number(id));
      if (o) shipments.get(o.shipment_id).cancelled = true;
    }
    return send(res, 200, { status: 200, message: "Order cancelled successfully." });
  }

  const track = path.match(/^\/v1\/external\/courier\/track\/awb\/(.+)$/);
  if (track && req.method === "GET") {
    const s = [...shipments.values()].find((x) => x.awb === decodeURIComponent(track[1]));
    if (!s) return send(res, 200, { tracking_data: { track_status: 0, error: "Aahh! There is no activities found in our DB." } });
    return send(res, 200, {
      tracking_data: {
        track_status: 1,
        shipment_status: s.statusId,
        shipment_track: [{ awb_code: s.awb, current_status: s.status }],
        shipment_track_activities: [...s.activities].reverse(),
        etd: `${ist(new Date(Date.now() + 2 * 86400_000)).slice(0, 10)} 18:00:00`,
      },
    });
  }

  return send(res, 404, { message: `Mock Shiprocket: no route for ${req.method} ${path}` });
}).listen(PORT, () => console.log(`mock Shiprocket listening on http://127.0.0.1:${PORT}`));
