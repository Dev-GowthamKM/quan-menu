"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setStock } from "@/server/admin/catalog";
import { formatDate } from "@/lib/format";
import CatalogImage from "../../ui/CatalogImage";
import { Button, cx } from "../../ui/controls";
import { ImageIcon } from "../../ui/icons";
import { useToast } from "../Toaster";
import { adminInput } from "../ui";

export interface InventoryRow {
  id: string;
  sku: string;
  size: string;
  color: string;
  stock_quantity: number;
  reserved_quantity: number;
  available: number;
  threshold: number;
  low_stock_threshold: number | null;
  is_active: boolean;
  updated_at: string;
  product_id: string;
  title: string;
  slug: string;
  status: string;
  image: string | null;
}

const REASONS = [
  { value: "restock", label: "Received stock" },
  { value: "adjustment", label: "Stock count" },
  { value: "correction", label: "Correction" },
  { value: "damaged", label: "Damaged or lost" },
  { value: "return", label: "Customer return" },
];

/** "12" sets the count; "+12" or "-3" adds or removes units. */
function parseEntry(text: string, onHand: number): { quantity?: number; delta?: number } | null {
  const t = text.trim();
  if (/^[+-]\d+$/.test(t)) return { delta: Number(t) };
  if (/^\d+$/.test(t)) return Number(t) === onHand ? null : { quantity: Number(t) };
  return null;
}

export default function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("restock");
  const [note, setNote] = useState("");
  const [saving, start] = useTransition();

  const key = rows.map((r) => `${r.id}:${r.stock_quantity}`).join();
  useEffect(() => setEdits({}), [key]);

  const changes = rows
    .map((r) => ({ r, entry: edits[r.id] !== undefined ? parseEntry(edits[r.id], r.stock_quantity) : null }))
    .filter((x) => x.entry);
  const invalid = rows.filter((r) => edits[r.id] !== undefined && edits[r.id].trim() !== "" && !/^[+-]?\d+$/.test(edits[r.id].trim()));

  const save = () =>
    start(async () => {
      const items = changes.map(({ r, entry }) => (entry!.delta !== undefined ? { variant_id: r.id, delta: entry!.delta } : { variant_id: r.id, quantity: entry!.quantity, loaded: r.stock_quantity }));
      const res = await setStock(items, reason, note);
      if (!res.ok) return toast(res.error, "error");
      toast(res.message ?? "Stock updated.");
      setEdits({});
      setNote("");
      router.refresh();
    });

  if (!rows.length) {
    return <div className="rounded-lg border border-dashed border-black/15 bg-white px-6 py-14 text-center text-sm text-taupe">No variants match these filters.</div>;
  }

  return (
    <div>
      {(changes.length > 0 || invalid.length > 0) && (
        <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-end gap-3 rounded-lg border border-ink bg-white p-3 shadow-lg lg:top-2">
          <p className="self-center text-sm font-medium">{changes.length} {changes.length === 1 ? "change" : "changes"}</p>
          <label className="grid gap-1 text-xs text-taupe">
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={adminInput}>
              {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="grid flex-1 gap-1 text-xs text-taupe">
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Supplier invoice, count sheet…" className={cx(adminInput, "min-w-48")} />
          </label>
          <Button size="sm" variant="ghost" onClick={() => setEdits({})}>Discard</Button>
          <Button size="sm" onClick={save} busy={saving} disabled={!changes.length || invalid.length > 0}>Save stock</Button>
          {invalid.length > 0 && <p className="w-full text-xs text-red-700">Enter a whole number, or +/− a number, for {invalid.map((r) => r.sku).join(", ")}.</p>}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#fafaf9] text-left text-xs text-taupe">
              <th className="border-b border-black/10 px-3 py-2.5 font-medium">Product</th>
              <th className="border-b border-black/10 px-3 py-2.5 font-medium">SKU</th>
              <th className="border-b border-black/10 px-3 py-2.5 font-medium">On hand</th>
              <th className="border-b border-black/10 px-3 py-2.5 text-right font-medium" title="Held by orders waiting for payment">Held</th>
              <th className="border-b border-black/10 px-3 py-2.5 text-right font-medium">Available</th>
              <th className="border-b border-black/10 px-3 py-2.5 text-right font-medium">Alert at</th>
              <th className="border-b border-black/10 px-3 py-2.5 font-medium">Changed</th>
              <th className="border-b border-black/10 px-3 py-2.5"><span className="sr-only">History</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const label = [r.color, r.size].filter(Boolean).join(" / ") || "Default";
              const edited = edits[r.id] !== undefined && edits[r.id] !== String(r.stock_quantity);
              const entry = edits[r.id] !== undefined ? parseEntry(edits[r.id], r.stock_quantity) : null;
              const preview = entry?.delta !== undefined ? r.stock_quantity + entry.delta : entry?.quantity;
              return (
                <tr key={r.id} className={cx("border-b border-black/5 last:border-0", !r.is_active && "text-stone", edited && "bg-amber-50/60")}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <div className="relative size-10 shrink-0 overflow-hidden rounded bg-bone">
                        {r.image ? <CatalogImage src={r.image} alt="" fill sizes="40px" className="object-cover" /> : <ImageIcon size={16} className="absolute inset-0 m-auto text-stone" />}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/admin/products/${r.product_id}`} className="font-medium hover:underline">{r.title}</Link>
                        <p className="text-xs text-stone">{label}{!r.is_active && " · not on sale"}{r.status !== "active" && ` · ${r.status}`}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`On hand for ${r.sku}`}
                      value={edits[r.id] ?? String(r.stock_quantity)}
                      onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })}
                      onFocus={(e) => e.target.select()}
                      inputMode="numeric"
                      className={cx(adminInput, "h-8 w-20 tabular-nums", edited && "border-amber-500")}
                    />
                    {preview !== undefined && preview !== r.stock_quantity && <span className="ml-2 text-xs text-taupe tabular-nums">→ {preview}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-taupe tabular-nums">{r.reserved_quantity || "—"}</td>
                  <td className={cx("px-3 py-2 text-right font-medium tabular-nums", r.available <= 0 ? "text-red-700" : r.available <= r.threshold ? "text-amber-700" : "")}>{r.available}</td>
                  <td className="px-3 py-2 text-right text-xs text-stone tabular-nums">{r.threshold}{r.low_stock_threshold === null && " (default)"}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-stone">{formatDate(r.updated_at)}</td>
                  <td className="px-3 py-2 text-right"><Link href={`/admin/inventory/history?sku=${encodeURIComponent(r.sku)}`} className="text-xs underline">History</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone">Type a new count, or +12 / −3 to add or remove units. Changes apply on top of any orders placed meanwhile.</p>
    </div>
  );
}
