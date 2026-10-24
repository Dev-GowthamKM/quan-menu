// A small stand-in for Razorpay's REST API, for local development and end-to-end tests.
// It implements the endpoints the app uses (orders, payments, capture, refunds) and a
// test-only endpoint that "pays" an order the way Razorpay Checkout would, returning the
// same signature Razorpay computes. Never used in production: the app only talks to it
// when RAZORPAY_API_BASE points here. Like Razorpay, each key pair is its own account and
// only sees its own orders and payments (the multi-store tests give a second store the
// second account).
//
//   node tests/e2e/support/mock-razorpay.mjs   (PORT=4010, RAZORPAY_KEY_SECRET=...)
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_RAZORPAY_PORT || 4010);
const SECRET = process.env.RAZORPAY_KEY_SECRET || "mock_key_secret";
const KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "rzp_test_mock";
const SECOND_ACCOUNT = { keyId: "rzp_test_secondstore1", secret: "secondstoresecret0123456789" };
const ACCOUNTS = new Map([[KEY_ID, SECRET], [SECOND_ACCOUNT.keyId, SECOND_ACCOUNT.secret]]);

const orders = new Map();
const payments = new Map();
const refunds = new Map();
/** Which account (key id) each order, payment and refund belongs to. */
const owner = new Map();
const id = (prefix) => `${prefix}_${randomBytes(7).toString("hex")}`;

function send(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

/** The account a request's key pair belongs to, or null. */
function account(req) {
  const header = req.headers.authorization || "";
  for (const [keyId, secret] of ACCOUNTS) {
    if (header === `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}`) return keyId;
  }
  return null;
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const notFound = (res) => send(res, 404, { error: { code: "BAD_REQUEST_ERROR", description: "The id provided does not exist" } });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  if (req.method === "OPTIONS") return send(res, 204, {});

  // Test-only: simulate a customer paying (or failing to pay) in Razorpay Checkout.
  if (path === "/__test/pay" && req.method === "POST") {
    const { order_id, outcome = "captured", method = "upi" } = await readJson(req);
    const order = orders.get(order_id);
    if (!order) return notFound(res);
    const payment = {
      id: id("pay"),
      entity: "payment",
      order_id,
      amount: order.amount,
      currency: order.currency,
      status: outcome,
      method,
      captured: outcome === "captured",
      amount_refunded: 0,
      error_code: outcome === "failed" ? "BAD_REQUEST_ERROR" : null,
      error_description: outcome === "failed" ? "Payment declined by the bank (mock)" : null,
      bank: method === "netbanking" ? "HDFC" : null,
      wallet: null,
      vpa: method === "upi" ? "success@razorpay" : null,
      card: method === "card" ? { network: "Visa", last4: "1111", type: "debit" } : null,
      notes: order.notes,
      created_at: Math.floor(Date.now() / 1000),
    };
    payments.set(payment.id, payment);
    owner.set(payment.id, owner.get(order_id));
    if (outcome === "captured") order.status = "paid";
    else order.status = "attempted";
    const signature = createHmac("sha256", ACCOUNTS.get(owner.get(order_id))).update(`${order_id}|${payment.id}`).digest("hex");
    return send(res, 200, { razorpay_order_id: order_id, razorpay_payment_id: payment.id, razorpay_signature: signature, status: outcome });
  }
  if (path === "/__test/state") {
    const withAccount = (o) => ({ ...o, account: owner.get(o.id) });
    return send(res, 200, { orders: [...orders.values()].map(withAccount), payments: [...payments.values()].map(withAccount), refunds: [...refunds.values()].map(withAccount) });
  }

  const acct = account(req);
  if (!acct) return send(res, 401, { error: { code: "BAD_REQUEST_ERROR", description: "Authentication failed" } });
  const mine = (map, key) => (owner.get(key) === acct ? map.get(key) : undefined);

  let m;
  if (path === "/v1/orders" && req.method === "POST") {
    const body = await readJson(req);
    if (!Number.isInteger(body.amount) || body.amount < 100) return send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "The amount must be at least INR 1.00." } });
    const order = { id: id("order"), entity: "order", amount: body.amount, currency: body.currency, receipt: body.receipt ?? null, notes: body.notes ?? {}, status: "created", created_at: Math.floor(Date.now() / 1000) };
    orders.set(order.id, order);
    owner.set(order.id, acct);
    return send(res, 200, order);
  }
  if ((m = path.match(/^\/v1\/orders\/([^/]+)\/payments$/))) {
    return send(res, 200, { entity: "collection", items: [...payments.values()].filter((p) => p.order_id === m[1] && owner.get(p.id) === acct) });
  }
  if ((m = path.match(/^\/v1\/payments\/([^/]+)\/capture$/)) && req.method === "POST") {
    const p = mine(payments, m[1]);
    if (!p) return notFound(res);
    const body = await readJson(req);
    if (p.status !== "authorized" || body.amount !== p.amount) return send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "This payment cannot be captured" } });
    p.status = "captured";
    p.captured = true;
    return send(res, 200, p);
  }
  if ((m = path.match(/^\/v1\/payments\/([^/]+)\/refund$/)) && req.method === "POST") {
    const p = mine(payments, m[1]);
    if (!p) return notFound(res);
    const body = await readJson(req);
    const amount = body.amount ?? p.amount - p.amount_refunded;
    if (p.status !== "captured" && p.status !== "refunded") return send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "Payment not captured" } });
    if (amount > p.amount - p.amount_refunded) return send(res, 400, { error: { code: "BAD_REQUEST_ERROR", description: "The refund amount provided is greater than amount captured" } });
    p.amount_refunded += amount;
    if (p.amount_refunded >= p.amount) p.status = "refunded";
    const refund = { id: id("rfnd"), entity: "refund", payment_id: p.id, amount, currency: p.currency, status: "processed", notes: body.notes ?? {} };
    refunds.set(refund.id, refund);
    owner.set(refund.id, acct);
    return send(res, 200, refund);
  }
  if ((m = path.match(/^\/v1\/payments\/([^/]+)$/))) {
    const p = mine(payments, m[1]);
    return p ? send(res, 200, p) : notFound(res);
  }
  if ((m = path.match(/^\/v1\/refunds\/([^/]+)$/))) {
    const r = mine(refunds, m[1]);
    return r ? send(res, 200, r) : notFound(res);
  }
  return notFound(res);
}).listen(PORT, "127.0.0.1", () => console.log(`mock Razorpay listening on http://127.0.0.1:${PORT}`));
