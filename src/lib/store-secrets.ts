import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { STORE_SECRETS_KEY } from "./server-env";
import { supabaseService } from "./supabase/admin";

// Each store's own API keys (Razorpay to begin with). They are encrypted here with
// AES-256-GCM under STORE_SECRETS_KEY before they reach the database, bound to their store
// and name (so a value can't be moved to another store's row), and only ever decrypted
// on the server. The table has no policies for browser roles; admins see only a hint.

export const SECRET_NAMES = ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

function key() {
  const k = Buffer.from(STORE_SECRETS_KEY, "base64");
  if (k.length !== 32) throw new Error("STORE_SECRETS_KEY must be 32 random bytes, base64 encoded (openssl rand -base64 32).");
  return k;
}

/** Whether the server can encrypt store keys (STORE_SECRETS_KEY is set correctly). */
export function secretsReady() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function sealSecret(storeId: string, name: string, value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${storeId}:${name}`));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function openSecret(storeId: string, name: string, sealed: string) {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`${storeId}:${name}`));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** A store's saved keys, decrypted. Keys that can't be decrypted (a changed STORE_SECRETS_KEY) are left out. */
export async function storeSecrets(storeId: string): Promise<Partial<Record<SecretName, string>>> {
  if (!secretsReady()) return {};
  const { data, error } = await supabaseService(storeId).from("store_secrets").select("name, ciphertext").eq("store_id", storeId);
  if (error) {
    // Before the multi-store database update the table doesn't exist.
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error("[secrets] could not load:", error.message);
    return {};
  }
  const out: Partial<Record<SecretName, string>> = {};
  for (const row of data ?? []) {
    if (!(SECRET_NAMES as readonly string[]).includes(row.name)) continue;
    try {
      out[row.name as SecretName] = openSecret(storeId, row.name, row.ciphertext);
    } catch {
      console.error(`[secrets] ${row.name} for store ${storeId} could not be decrypted (was STORE_SECRETS_KEY changed?)`);
    }
  }
  return out;
}

/** Saves (or, with an empty value, removes) one of a store's keys. */
export async function saveStoreSecret(storeId: string, name: SecretName, value: string, userId: string) {
  const sb = supabaseService(storeId);
  if (!value) {
    const { error } = await sb.from("store_secrets").delete().eq("store_id", storeId).eq("name", name);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await sb.from("store_secrets").upsert(
    {
      store_id: storeId,
      name,
      ciphertext: sealSecret(storeId, name, value),
      hint: value.slice(-4),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id,name" },
  );
  if (error) throw new Error(error.message);
}
