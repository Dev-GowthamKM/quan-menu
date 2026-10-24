import "server-only";

// Adds store web addresses to this site's Vercel project, so a new store is reachable
// without opening Vercel. Optional: without a token, the platform page explains how to add
// the address in Vercel by hand. The token is a server secret (Vercel › Account Settings ›
// Tokens), set only in the project's environment variables.

const TOKEN = process.env.VERCEL_API_TOKEN || "";
const PROJECT = process.env.VERCEL_PROJECT_ID || "";
const TEAM = process.env.VERCEL_TEAM_ID || "";

export const vercelDomainsReady = () => !!(TOKEN && PROJECT);

export interface VercelDomainResult {
  ok: boolean;
  /** Vercel can serve it now (vercel.app names, or a domain whose DNS already points here). */
  verified?: boolean;
  message: string;
}

async function call(path: string, init: { method: string; body?: unknown }) {
  const url = new URL(`https://api.vercel.com${path}`);
  if (TEAM) url.searchParams.set("teamId", TEAM);
  const res = await fetch(url, {
    method: init.method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { verified?: boolean; error?: { code?: string; message?: string } };
  return { res, body };
}

/** Adds a host name to the Vercel project. A name it already has counts as added. */
export async function addVercelDomain(host: string): Promise<VercelDomainResult> {
  if (!vercelDomainsReady()) return { ok: false, message: "Vercel isn't connected (VERCEL_API_TOKEN, VERCEL_PROJECT_ID)." };
  if (/localhost(:\d+)?$/.test(host)) return { ok: true, verified: true, message: "Local address: nothing to add in Vercel." };
  try {
    const { res, body } = await call(`/v10/projects/${encodeURIComponent(PROJECT)}/domains`, { method: "POST", body: { name: host.replace(/:\d+$/, "") } });
    if (res.ok) {
      return body.verified
        ? { ok: true, verified: true, message: `${host} is live on Vercel.` }
        : { ok: true, verified: false, message: `${host} was added to Vercel. Point its DNS at Vercel to finish (Vercel › Domains shows the record).` };
    }
    if (body.error?.code === "domain_already_in_use" || body.error?.code === "domain_already_exists") {
      return { ok: true, message: `${host} is already in the Vercel project.` };
    }
    return { ok: false, message: `Vercel: ${body.error?.message || `error ${res.status}`}` };
  } catch (e) {
    return { ok: false, message: `Couldn't reach Vercel: ${(e as Error).message}` };
  }
}

/** Removes a host name from the Vercel project. */
export async function removeVercelDomain(host: string): Promise<VercelDomainResult> {
  if (!vercelDomainsReady() || /localhost(:\d+)?$/.test(host)) return { ok: true, message: "" };
  try {
    const { res, body } = await call(`/v9/projects/${encodeURIComponent(PROJECT)}/domains/${encodeURIComponent(host.replace(/:\d+$/, ""))}`, { method: "DELETE" });
    if (res.ok || res.status === 404) return { ok: true, message: `${host} was removed from Vercel.` };
    return { ok: false, message: `Vercel: ${body.error?.message || `error ${res.status}`}` };
  } catch (e) {
    return { ok: false, message: `Couldn't reach Vercel: ${(e as Error).message}` };
  }
}
