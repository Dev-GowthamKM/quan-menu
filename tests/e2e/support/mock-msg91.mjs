// A small stand-in for MSG91's Send SMS (Flow) endpoint, for local development and
// end-to-end tests: it accepts messages for the configured auth key and template and lists
// them at /__test/messages, so tests can read the sign-in code. Never used in production:
// the app only talks to it when MSG91_API_BASE points at localhost.
//
//   node tests/e2e/support/mock-msg91.mjs   (PORT=4014, MSG91_AUTH_KEY/TEMPLATE_ID=...)
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_MSG91_PORT || 4014);
const KEY = process.env.MSG91_AUTH_KEY || "mock_msg91_key";
const TEMPLATE = process.env.MSG91_TEMPLATE_ID || "mock_login_template";
const sent = [];
let next = 1;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/__test/messages" && req.method === "GET") {
    const to = url.searchParams.get("to");
    return send(res, 200, to ? sent.filter((m) => m.to === to) : sent);
  }
  if (url.pathname !== "/api/v5/flow" || req.method !== "POST") return send(res, 404, { type: "error", message: "Not found" });
  // MSG91 reports most problems with HTTP 200 and "type": "error".
  if (req.headers.authkey !== KEY) return send(res, 200, { type: "error", message: "Authentication failure" });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return send(res, 400, { type: "error", message: "Invalid JSON" });
  }
  if (body.template_id !== TEMPLATE) return send(res, 200, { type: "error", message: "Template ID Missing or Invalid" });
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];
  if (!recipients.length || recipients.some((r) => !/^91[6-9]\d{9}$/.test(String(r.mobiles)))) {
    return send(res, 200, { type: "error", message: "Mobile number missing or invalid" });
  }
  const id = `3${String(next++).padStart(23, "0")}`;
  for (const r of recipients) {
    const { mobiles, ...vars } = r;
    sent.push({ id, to: mobiles, template_id: body.template_id, vars, at: new Date().toISOString() });
  }
  return send(res, 200, { type: "success", message: id });
}).listen(PORT, () => console.log(`mock MSG91 listening on http://127.0.0.1:${PORT}`));
