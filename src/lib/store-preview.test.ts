import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.ORDER_LINK_SECRET = "a-test-secret-for-signing-links";
});

const { readStorePreview, signStorePreview, STORE_PREVIEW_SECONDS } = await import("./store-preview");

const STORE = "ccc26a1c-3771-497e-9fc2-35096df4fbda";

describe("store preview links", () => {
  it("open the store they were made for, for a day", () => {
    const now = Date.UTC(2026, 9, 29, 12);
    const token = signStorePreview(STORE, now);
    expect(readStorePreview(token, now)).toBe(STORE);
    expect(readStorePreview(token, now + (STORE_PREVIEW_SECONDS - 60) * 1000)).toBe(STORE);
    expect(readStorePreview(token, now + (STORE_PREVIEW_SECONDS + 60) * 1000)).toBeNull();
  });

  it("can't be made up or changed", () => {
    const token = signStorePreview(STORE);
    const [payload, signature] = token.split(".");
    const other = Buffer.from(JSON.stringify({ s: "11111111-2222-3333-4444-555555555555", e: 9_999_999_999 })).toString("base64url");
    expect(readStorePreview(`${other}.${signature}`)).toBeNull();
    expect(readStorePreview(`${payload}.${"x".repeat(signature.length)}`)).toBeNull();
    expect(readStorePreview(payload)).toBeNull();
    expect(readStorePreview(undefined)).toBeNull();
    expect(readStorePreview("exit")).toBeNull();
  });
});
