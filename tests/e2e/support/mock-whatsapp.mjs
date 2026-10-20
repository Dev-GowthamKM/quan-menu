// A small stand-in for the WhatsApp Business Platform (Cloud API) messages endpoint, for
// local development and end-to-end tests. It accepts template messages for the configured
// phone number id and token, and lists what was sent at /__test/messages. Never used in
// production: the app only talks to it when WHATSAPP_API_BASE points at localhost.
//
//   node tests/e2e/support/mock-whatsapp.mjs   (PORT=4012, WHATSAPP_TOKEN/PHONE_NUMBER_ID=...)
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_WHATSAPP_PORT || 4012);
const TOKEN = process.env.WHATSAPP_TOKEN || "mock_whatsapp_token";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "1234567890";

const sent = [];
let next = 1;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const error = (res, status, code, message) => send(res, status, { error: { message, type: "OAuthException", code, fbtrace_id: "mock" } });

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/__test/messages" && req.method === "GET") return send(res, 200, sent);

  const m = url.pathname.match(/^\/v\d+\.\d+\/([^/]+)\/messages$/);
  if (!m || req.method !== "POST") return error(res, 404, 100, `Unknown path ${req.method} ${url.pathname}`);
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return error(res, 401, 190, "Invalid OAuth access token.");
  if (m[1] !== PHONE_ID) return error(res, 400, 100, "Unsupported post request. Object with ID does not exist.");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return error(res, 400, 100, "Invalid JSON");
  }
  if (body.messaging_product !== "whatsapp" || body.type !== "template" || !/^\d{8,15}$/.test(String(body.to))) {
    return error(res, 400, 100, "(#100) Invalid parameter");
  }
  const t = body.template ?? {};
  if (!t.name || !t.language?.code) return error(res, 400, 100, "(#100) The parameter template['name'] is required.");
  if (t.name === "not_approved") return error(res, 404, 132001, "(#132001) Template name does not exist in the translation");
  const params = (t.components ?? []).flatMap((c) => (c.parameters ?? []).map((p) => p.text));
  if (params.some((p) => typeof p !== "string" || /[\n\t]| {5,}/.test(p))) return error(res, 400, 132000, "(#132000) Param text cannot have new-line/tab characters or more than 4 consecutive spaces");
  const id = `wamid.MOCK${String(next++).padStart(6, "0")}`;
  sent.push({ id, to: body.to, template: t.name, language: t.language.code, params, at: new Date().toISOString() });
  return send(res, 200, { messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id }] });
}).listen(PORT, () => console.log(`mock WhatsApp listening on http://127.0.0.1:${PORT}`));
