const TZ = "Asia/Kolkata";

export function formatDate(value: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, { hour: "numeric", minute: "2-digit" });
}

/** "Thu, 23 Oct" for delivery estimates. */
export function formatDay(value: Date) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(value);
}

/**
 * Delivery estimate from business-day ranges, skipping Sundays. Days are counted on the
 * Indian calendar wherever this runs (a server in UTC or a browser abroad).
 */
export function deliveryWindow(minDays: number, maxDays: number, from = new Date()) {
  const IST = 5.5 * 3600_000;
  const add = (days: number) => {
    const d = new Date(from.getTime() + IST);
    let left = days;
    while (left > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0) left--;
    }
    return new Date(d.getTime() - IST);
  };
  return { from: add(Math.max(minDays, 1)), to: add(Math.max(maxDays, minDays, 1)) };
}

export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
