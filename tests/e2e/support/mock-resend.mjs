// A small stand-in for Resend's send-email endpoint, for local development and end-to-end
// tests: it accepts emails for the configured API key and lists them at /__test/emails,
// so tests can read the links inside. Never used in production: the app only talks to it
// when RESEND_API_BASE points here.
//
//   node tests/e2e/support/mock-resend.mjs   (PORT=4013, RESEND_API_KEY=...)
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_RESEND_PORT || 4013);
const KEY = process.env.RESEND_API_KEY || "re_mock_key";
const sent = [];
let next = 1;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/__test/emails" && req.method === "GET") {
    const to = url.searchParams.get("to");
    return send(res, 200, to ? sent.filter((m) => m.to.includes(to)) : sent);
  }
  if (url.pathname !== "/emails" || req.method !== "POST") return send(res, 404, { name: "not_found", message: "Not found" });
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(res, 401, { name: "validation_error", message: "API key is invalid" });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || "{}");
  if (!body.from || !Array.isArray(body.to) || !body.to.length || !body.subject || !(body.html || body.text)) {
    return send(res, 422, { name: "validation_error", message: "Missing from, to, subject or content" });
  }
  const id = `mock_${String(next++).padStart(6, "0")}`;
  sent.push({ id, from: body.from, to: body.to, subject: body.subject, html: body.html ?? "", text: body.text ?? "", headers: body.headers ?? {}, at: new Date().toISOString() });
  return send(res, 200, { id });
}).listen(PORT, () => console.log(`mock Resend listening on http://127.0.0.1:${PORT}`));
