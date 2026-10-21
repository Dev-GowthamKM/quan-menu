import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhook } from "./standard-webhooks";

const SECRET = "v1,whsec_dGFhbmEtbG9jYWwtZGV2ZWxvcG1lbnQtc21zLWhvb2s=";
const OTHER = `v1,whsec_${Buffer.from("another-secret-for-key-rotation!").toString("base64")}`;
const body = JSON.stringify({ user: { id: "u1", phone: "919845012345" }, sms: { otp: "123456" } });
const now = Date.UTC(2026, 9, 21, 8, 0, 0);
const ts = Math.floor(now / 1000);

const headers = (signature: string, timestamp = ts, id = "msg_1") => ({ id, timestamp: String(timestamp), signature });

describe("Standard Webhooks signatures (Supabase auth hooks)", () => {
  it("match the specification: HMAC-SHA256 of id.timestamp.body with the base64-decoded secret", () => {
    const key = Buffer.from("taana-local-development-sms-hook");
    const expected = createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64");
    expect(signWebhook(SECRET, "msg_1", ts, body)).toBe(`v1,${expected}`);
  });

  it("accept a fresh, correctly signed body", () => {
    expect(verifyWebhook([SECRET], headers(signWebhook(SECRET, "msg_1", ts, body)), body, now)).toBe(true);
  });

  it("accept any listed signature, and any configured secret (during a rotation)", () => {
    const both = `${signWebhook(OTHER, "msg_1", ts, body)}, ${signWebhook(SECRET, "msg_1", ts, body)}`;
    expect(verifyWebhook([SECRET], headers(both), body, now)).toBe(true);
    expect(verifyWebhook([OTHER, SECRET], headers(signWebhook(SECRET, "msg_1", ts, body)), body, now)).toBe(true);
  });

  it("reject a changed body, id or timestamp, or another secret", () => {
    const sig = signWebhook(SECRET, "msg_1", ts, body);
    expect(verifyWebhook([SECRET], headers(sig), body.replace("123456", "654321"), now)).toBe(false);
    expect(verifyWebhook([SECRET], headers(sig, ts, "msg_2"), body, now)).toBe(false);
    expect(verifyWebhook([SECRET], headers(sig, ts + 1), body, now)).toBe(false);
    expect(verifyWebhook([OTHER], headers(sig), body, now)).toBe(false);
  });

  it("reject old or future timestamps, missing headers and malformed secrets", () => {
    const old = ts - 6 * 60;
    expect(verifyWebhook([SECRET], headers(signWebhook(SECRET, "msg_1", old, body), old), body, now)).toBe(false);
    const future = ts + 6 * 60;
    expect(verifyWebhook([SECRET], headers(signWebhook(SECRET, "msg_1", future, body), future), body, now)).toBe(false);
    expect(verifyWebhook([SECRET], { id: null, timestamp: String(ts), signature: "v1,x" }, body, now)).toBe(false);
    expect(verifyWebhook([SECRET], headers("v2,abc"), body, now)).toBe(false);
    expect(verifyWebhook(["", "v1,whsec_short"], headers(signWebhook(SECRET, "msg_1", ts, body)), body, now)).toBe(false);
  });
});
