// The Numbers section's figures: "12,000+", "₹2,999", "4.8★" or "15", counted up from nothing
// in the figure's own manner (its prefix and suffix, decimals and digit grouping kept).

const FIGURE = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s;

/** A figure part of the way (t, 0 to 1) to its value; text that isn't a figure stays as it is. */
export function countTo(value: string, t: number): string {
  const m = FIGURE.exec(value);
  if (!m) return value;
  const [, prefix, figure, suffix] = m;
  const decimals = figure.includes(".") ? figure.length - figure.indexOf(".") - 1 : 0;
  const target = Number(figure.replace(/,/g, ""));
  if (!Number.isFinite(target)) return value;
  const n = t >= 1 ? target : target * Math.max(0, t);
  const text = n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: figure.includes(",") });
  return `${prefix}${t >= 1 ? figure : text}${suffix}`;
}
