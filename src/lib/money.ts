// Money is stored and computed in integer minor units (paise for INR). These helpers
// only convert for display and for admin form input; never do pricing math in floats.

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, fraction: boolean) {
  const key = `${currency}:${fraction}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
      minimumFractionDigits: fraction ? 2 : 0,
      maximumFractionDigits: fraction ? 2 : 0,
    });
    formatters.set(key, f);
  }
  return f;
}

/** 129900 -> "₹1,299"; 129950 -> "₹1,299.50". */
export function formatMoney(minor: number | string | null | undefined, currency = "INR") {
  const n = Number(minor ?? 0);
  return formatter(currency, n % 100 !== 0).format(n / 100);
}

/** "1,299.5" -> 129950. Returns null for empty or invalid input. */
export function toMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[₹,\s]/g, "").trim();
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** 129950 -> "1299.50" (for form inputs). */
export function fromMinor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const n = Number(minor);
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

export function discountPercent(price: number, compareAt: number | null | undefined) {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}
