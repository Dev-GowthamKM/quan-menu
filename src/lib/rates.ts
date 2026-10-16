import type { Lang } from "./types";

/** VND per one unit of each customer's currency, by menu language. */
export type Rates = Partial<Record<Lang, number>>;

/**
 * Daily exchange rates from ExchangeRate-API's free open endpoint (no key; attribution shown under
 * the menu). Refreshed at most twice a day. If it is unreachable, menus fall back to the fixed
 * rates in i18n.ts, so a failure never breaks a menu.
 */
export async function liveRates(): Promise<Rates> {
  try {
    const res = await fetch(process.env.RATES_URL || "https://open.er-api.com/v6/latest/USD", {
      next: { revalidate: 43200 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    const r = json.rates ?? {};
    if (json.result !== "success" || !(r.VND > 1000)) return {};
    const out: Rates = { en: r.VND };
    if (r.KRW > 0) out.ko = r.VND / r.KRW;
    if (r.CNY > 0) out.zh = r.VND / r.CNY;
    if (r.JPY > 0) out.ja = r.VND / r.JPY;
    return out;
  } catch {
    return {};
  }
}
