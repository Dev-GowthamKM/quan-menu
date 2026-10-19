"use client";
import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";

interface Point {
  date: string;
  revenue: number;
  orders: number;
}

const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 52 };
const SERIES = "#2a78d6";
const GRID = "#e9e8e4";

/** Axis ticks in Indian units: 2.5K, 1.2L (lakh), 3Cr (crore). */
function compact(rupees: number) {
  const fmt = (n: number, unit: string) => `${Number(n.toFixed(1)).toLocaleString("en-IN")}${unit}`;
  if (rupees >= 1e7) return fmt(rupees / 1e7, "Cr");
  if (rupees >= 1e5) return fmt(rupees / 1e5, "L");
  if (rupees >= 1e3) return fmt(rupees / 1e3, "K");
  return rupees.toLocaleString("en-IN");
}

function niceMax(v: number) {
  if (v <= 0) return 100;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

/**
 * Net revenue received per day (captured payments minus refunds), one column per day.
 * Hover or focus a column for its exact values; the table below has every number.
 */
export default function RevenueChart({ data, currency }: { data: Point[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const rupees = data.map((d) => Math.max(d.revenue, 0) / 100);
  const max = niceMax(Math.max(...rupees, 0));
  const ticks = [0, max / 2, max];
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, Math.max(band - 2, 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const labelEvery = Math.ceil(data.length / 6);
  const fmtDay = useMemo(() => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }), []);
  const hovered = active !== null ? data[active] : null;

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Net revenue per day for the last 30 days">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#6b6762" style={{ fontVariantNumeric: "tabular-nums" }}>
                {t === 0 ? "0" : `₹${compact(t)}`}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const v = Math.max(d.revenue, 0) / 100;
            const x = PAD.left + i * band + (band - barW) / 2;
            const top = y(v);
            const h = PAD.top + innerH - top;
            const r = Math.min(4, h / 2, barW / 2);
            const path =
              h <= 0
                ? ""
                : `M${x},${PAD.top + innerH} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r} L${x + barW},${PAD.top + innerH} Z`;
            return (
              <g key={d.date}>
                {path && <path d={path} fill={SERIES} opacity={active === null || active === i ? 1 : 0.55} />}
                <rect
                  x={PAD.left + i * band}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${fmtDay.format(new Date(d.date))}: ${formatMoney(d.revenue, currency)}, ${d.orders} orders`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  style={{ outline: "none" }}
                />
                {i % labelEvery === 0 && (
                  <text x={PAD.left + i * band + band / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#6b6762">
                    {fmtDay.format(new Date(d.date))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && active !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${((PAD.left + active * band + band / 2) / W) * 100}%` }}
          >
            <p className="text-sm font-semibold tabular-nums">{formatMoney(hovered.revenue, currency)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-taupe">
              <span className="inline-block h-0.5 w-3" style={{ background: SERIES }} /> Net revenue · {fmtDay.format(new Date(hovered.date))}
            </p>
            <p className="text-taupe">{hovered.orders} {hovered.orders === 1 ? "order" : "orders"} placed</p>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-taupe hover:text-ink">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-taupe"><th className="py-1 font-medium">Date</th><th className="py-1 text-right font-medium">Net revenue</th><th className="py-1 text-right font-medium">Orders</th></tr>
          </thead>
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.date} className="border-t border-black/5">
                <td className="py-1">{fmtDay.format(new Date(d.date))}</td>
                <td className="py-1 text-right tabular-nums">{formatMoney(d.revenue, currency)}</td>
                <td className="py-1 text-right tabular-nums">{d.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
