"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  bulkUpdateProducts, deleteProducts, duplicateProduct, getQuickEdit, productIdsMatching, quickEditProduct, type QuickEditData,
} from "@/server/admin/catalog";
import { formatDate } from "@/lib/format";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import CatalogImage from "../../ui/CatalogImage";
import { Badge, Button, cx } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { CopyIcon, EyeIcon, ImageIcon, StarIcon, TrashIcon } from "../../ui/icons";
import { useToast } from "../Toaster";
import { adminInput } from "../ui";

export interface ProductRow {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
  state: "draft" | "active" | "archived" | "scheduled";
  published_at: string | null;
  price: number;
  compare_at_price: number | null;
  min_price: number | null;
  max_price: number | null;
  on_sale: boolean;
  available_stock: number;
  low_variants: number;
  is_featured: boolean;
  is_sample: boolean;
  sales_count: number;
  updated_at: string;
  brand: string | null;
  category: string | null;
  variant_count: number;
  image: string | null;
  tags: string[];
}

type Opt = { id: string; label: string };
type BulkAction = Parameters<typeof bulkUpdateProducts>[1];

const STATE: Record<ProductRow["state"], { label: string; tone: "green" | "neutral" | "blue" | "amber" }> = {
  active: { label: "Active", tone: "green" },
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "blue" },
  archived: { label: "Archived", tone: "amber" },
};

/** Value-taking bulk actions, each asking for one input in a small dialog. */
const VALUE_ACTIONS: { key: BulkAction; label: string; input: "category" | "brand" | "collection" | "text" | "money" | "percent" }[] = [
  { key: "category", label: "Set category", input: "category" },
  { key: "brand", label: "Set brand", input: "brand" },
  { key: "collection_add", label: "Add to collection", input: "collection" },
  { key: "collection_remove", label: "Remove from collection", input: "collection" },
  { key: "add_tag", label: "Add tag", input: "text" },
  { key: "remove_tag", label: "Remove tag", input: "text" },
  { key: "price_set", label: "Set price", input: "money" },
  { key: "price_percent", label: "Change prices by %", input: "percent" },
];

function priceText(r: ProductRow) {
  const min = r.min_price ?? r.price;
  const max = r.max_price ?? r.price;
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`;
}

export default function ProductTable({
  rows, total, filters, brands, categories, collections,
}: {
  rows: ProductRow[];
  total: number;
  filters: Record<string, string>;
  brands: Opt[];
  categories: Opt[];
  collections: Opt[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState<string[] | null>(null);
  const [pending, start] = useTransition();
  const [valueAction, setValueAction] = useState<(typeof VALUE_ACTIONS)[number] | null>(null);
  const [value, setValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [quick, setQuick] = useState<string | null>(null);

  // A new page of results starts with nothing selected.
  const key = rows.map((r) => r.id).join();
  useEffect(() => {
    setSelected(new Set());
    setAllMatching(null);
  }, [key]);

  const ids = allMatching ?? [...selected];
  const pageAll = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const run = (label: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast(res.error ?? `${label} failed.`, "error");
      else {
        toast(res.message ?? `${label} done.`);
        setSelected(new Set());
        setAllMatching(null);
        after?.();
        router.refresh();
      }
    });

  const bulk = (action: BulkAction, v: string | number | boolean | null, label: string) => run(label, () => bulkUpdateProducts(ids, action, v));

  const submitValue = () => {
    if (!valueAction) return;
    let v: string | number | null = value;
    if (valueAction.input === "money") {
      const m = toMinor(value);
      if (m === null) return toast("Enter a price like 1499 or 1499.50.", "error");
      v = m;
    } else if (valueAction.input === "percent") {
      const n = Number(value);
      if (!Number.isFinite(n) || n === 0) return toast("Enter a percentage such as -10 or 15.", "error");
      v = n;
    } else if (!value.trim() && valueAction.input !== "category" && valueAction.input !== "brand") {
      return toast("Choose a value first.", "error");
    }
    const action = valueAction;
    run(action.label, () => bulkUpdateProducts(ids, action.key, v === "" ? null : v), () => {
      setValueAction(null);
      setValue("");
    });
  };

  const options = useMemo(
    () => ({ category: categories, brand: brands, collection: collections }),
    [categories, brands, collections],
  );

  return (
    <div>
      {ids.length > 0 && (
        <div className="sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-ink bg-ink px-3 py-2 text-sm text-white shadow-lg lg:top-2">
          <span className="mr-2 font-medium tabular-nums">{ids.length} selected</span>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" disabled={pending} onClick={() => bulk("status", "active", "Publish")}>Publish</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" disabled={pending} onClick={() => bulk("status", "draft", "Move to drafts")}>Move to drafts</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" disabled={pending} onClick={() => bulk("status", "archived", "Archive")}>Archive</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" disabled={pending} onClick={() => bulk("featured", true, "Feature")}>Feature</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" disabled={pending} onClick={() => bulk("featured", false, "Unfeature")}>Unfeature</button>
          <button type="button" className="rounded px-2 py-1 hover:bg-white/15" disabled={pending} onClick={() => bulk("compare_at_clear", null, "End sale")}>End sale</button>
          <select
            aria-label="More bulk actions"
            className="h-8 rounded bg-white/10 px-2 text-sm text-white [&>option]:text-ink"
            value=""
            disabled={pending}
            onChange={(e) => {
              const a = VALUE_ACTIONS.find((x) => x.key === e.target.value);
              if (a) {
                setValue("");
                setValueAction(a);
              }
            }}
          >
            <option value="">More actions…</option>
            {VALUE_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <button type="button" className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-red-200 hover:bg-white/15" disabled={pending} onClick={() => setConfirmDelete(ids)}>
            <TrashIcon size={14} /> Delete
          </button>
          <button type="button" className="rounded px-2 py-1 text-white/70 hover:text-white" onClick={() => { setSelected(new Set()); setAllMatching(null); }}>Clear</button>
        </div>
      )}

      {pageAll && total > rows.length && !allMatching && (
        <p className="mb-2 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
          All {rows.length} on this page are selected.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() =>
              start(async () => {
                const res = await productIdsMatching(filters as Parameters<typeof productIdsMatching>[0]);
                if (res.ok) setAllMatching(res.data);
                else toast(res.error, "error");
              })
            }
          >
            Select all {total} matching products
          </button>
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 bg-white px-6 py-14 text-center">
          <p className="font-medium">No products match</p>
          <p className="mt-2 text-sm text-taupe">
            Try other filters, <Link href="/admin/products/new" className="underline">add a product</Link> or{" "}
            <Link href="/admin/products/import" className="underline">import a CSV</Link>.
          </p>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-black/10 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-[#fafaf9] text-left text-xs text-taupe">
                <th className="w-10 border-b border-black/10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    className="size-4 accent-ink"
                    checked={pageAll}
                    onChange={(e) => {
                      setAllMatching(null);
                      setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set());
                    }}
                  />
                </th>
                <th className="border-b border-black/10 px-3 py-2.5 font-medium">Product</th>
                <th className="border-b border-black/10 px-3 py-2.5 font-medium">Status</th>
                <th className="border-b border-black/10 px-3 py-2.5 font-medium">Stock</th>
                <th className="border-b border-black/10 px-3 py-2.5 text-right font-medium">Price</th>
                <th className="border-b border-black/10 px-3 py-2.5 font-medium">Category</th>
                <th className="border-b border-black/10 px-3 py-2.5 font-medium">Brand</th>
                <th className="border-b border-black/10 px-3 py-2.5 font-medium">Updated</th>
                <th className="border-b border-black/10 px-3 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const checked = allMatching ? allMatching.includes(r.id) : selected.has(r.id);
                const st = STATE[r.state];
                return (
                  <tr key={r.id} className={cx("border-b border-black/5 last:border-0", checked && "bg-sky-50/60")}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.title}`}
                        className="size-4 accent-ink"
                        checked={checked}
                        onChange={(e) => {
                          setAllMatching(null);
                          const next = new Set(allMatching ?? selected);
                          if (e.target.checked) next.add(r.id);
                          else next.delete(r.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="relative size-12 shrink-0 overflow-hidden rounded bg-bone">
                          {r.image ? <CatalogImage src={r.image} alt="" fill sizes="48px" className="object-cover" /> : <ImageIcon size={18} className="absolute inset-0 m-auto text-stone" />}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/admin/products/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone">
                            <span>{r.variant_count} {r.variant_count === 1 ? "variant" : "variants"}</span>
                            {r.is_featured && <span className="inline-flex items-center gap-0.5 text-amber-700"><StarIcon size={11} filled /> Featured</span>}
                            {r.on_sale && <Badge tone="red">On sale</Badge>}
                            {r.is_sample && <Badge tone="violet">Sample</Badge>}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {r.state === "scheduled" && <p className="mt-0.5 text-xs text-stone">{formatDate(r.published_at, { hour: "numeric", minute: "2-digit" })}</p>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.available_stock === 0 ? (
                        <span className="text-red-700">Out of stock</span>
                      ) : (
                        <span className={r.low_variants > 0 ? "text-amber-800" : undefined}>
                          {r.available_stock} available
                          {r.low_variants > 0 && <span className="block text-xs">{r.low_variants} {r.low_variants === 1 ? "variant" : "variants"} low</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {priceText(r)}
                      {r.compare_at_price && <span className="block text-xs text-stone line-through">{formatMoney(r.compare_at_price)}</span>}
                    </td>
                    <td className="px-3 py-2 text-taupe">{r.category ?? "—"}</td>
                    <td className="px-3 py-2 text-taupe">{r.brand ?? "—"}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-stone">{formatDate(r.updated_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <button type="button" onClick={() => setQuick(r.id)} className="rounded px-2 py-1 text-xs hover:bg-black/5">Quick edit</button>
                        <a
                          href={r.state === "active" ? `/products/${r.slug}` : `/products/${r.slug}/preview`}
                          target="_blank"
                          rel="noreferrer"
                          className="grid size-7 place-items-center rounded hover:bg-black/5"
                          aria-label={`Preview ${r.title}`}
                          title="Preview"
                        >
                          <EyeIcon size={15} />
                        </a>
                        <button
                          type="button"
                          className="grid size-7 place-items-center rounded hover:bg-black/5"
                          aria-label={`Duplicate ${r.title}`}
                          title="Duplicate"
                          disabled={pending}
                          onClick={() =>
                            start(async () => {
                              const res = await duplicateProduct(r.id);
                              if (!res.ok) return toast(res.error, "error");
                              toast(res.message ?? "Duplicated.");
                              router.push(`/admin/products/${res.data.id}`);
                            })
                          }
                        >
                          <CopyIcon size={15} />
                        </button>
                        <button type="button" className="grid size-7 place-items-center rounded text-red-700 hover:bg-red-50" aria-label={`Delete ${r.title}`} title="Delete" onClick={() => setConfirmDelete([r.id])}>
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!valueAction} onClose={() => setValueAction(null)} title={valueAction?.label} size="sm" className="bg-white">
        {valueAction && (
          <form
            className="grid gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              submitValue();
            }}
          >
            <p className="text-sm text-taupe">Applies to {ids.length} selected {ids.length === 1 ? "product" : "products"}.</p>
            {valueAction.input === "category" || valueAction.input === "brand" || valueAction.input === "collection" ? (
              <select autoFocus value={value} onChange={(e) => setValue(e.target.value)} className={adminInput} aria-label={valueAction.label}>
                <option value="">{valueAction.input === "collection" ? "Choose a collection" : `No ${valueAction.input}`}</option>
                {options[valueAction.input].map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : (
              <label className="grid gap-1.5 text-xs text-taupe">
                {valueAction.input === "money" ? "New price (₹)" : valueAction.input === "percent" ? "Change in % (negative lowers prices)" : "Tag"}
                <input
                  autoFocus
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  inputMode={valueAction.input === "text" ? "text" : "decimal"}
                  placeholder={valueAction.input === "money" ? "1499" : valueAction.input === "percent" ? "-10" : "summer"}
                  className={adminInput}
                />
              </label>
            )}
            {valueAction.input === "percent" && <p className="text-xs text-stone">Variant price overrides change too. Sale prices that would fall below the new price are removed.</p>}
            {valueAction.input === "collection" && collections.length === 0 && <p className="text-xs text-stone">There are no manual collections yet. Automated collections choose products by their rules.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setValueAction(null)}>Cancel</Button>
              <Button type="submit" size="sm" busy={pending}>Apply</Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete products?" size="sm" className="bg-white">
        <div className="grid gap-4 p-5 text-sm">
          <p>
            {confirmDelete?.length === 1 ? "This product" : `These ${confirmDelete?.length} products`} will be deleted with their variants and images.
            Products that appear in past orders are archived instead, so order history stays complete.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="danger"
              size="sm"
              busy={pending}
              onClick={() => {
                const list = confirmDelete ?? [];
                run("Delete", () => deleteProducts(list), () => setConfirmDelete(null));
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>

      <QuickEdit id={quick} onClose={() => setQuick(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

/** Price, status and stock for one product without opening the full editor. */
function QuickEdit({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<QuickEditData | null>(null);
  const [form, setForm] = useState<{ price: string; compare: string; status: QuickEditData["status"]; stock: Record<string, string> }>({ price: "", compare: "", status: "draft", stock: {} });
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    getQuickEdit(id).then((res) => {
      if (!res.ok) return setError(res.error);
      setData(res.data);
      setForm({
        price: fromMinor(res.data.price),
        compare: fromMinor(res.data.compare_at_price),
        status: res.data.status,
        stock: Object.fromEntries(res.data.variants.map((v) => [v.id, String(v.stock_quantity)])),
      });
    });
  }, [id]);

  const save = () => {
    if (!data) return;
    const price = toMinor(form.price);
    const compare = form.compare.trim() ? toMinor(form.compare) : null;
    if (price === null) return setError("Enter a valid price.");
    if (form.compare.trim() && compare === null) return setError("Enter a valid compare-at price, or leave it empty.");
    const stock: { variant_id: string; quantity: number; loaded: number }[] = [];
    for (const v of data.variants) {
      const q = Number(form.stock[v.id]);
      if (!Number.isInteger(q) || q < 0) return setError(`Stock for ${v.sku} must be a whole number.`);
      stock.push({ variant_id: v.id, quantity: q, loaded: v.stock_quantity });
    }
    setError(null);
    start(async () => {
      const res = await quickEditProduct({ id: data.id, price, compare_at_price: compare, status: form.status, stock });
      if (!res.ok) return setError(res.error);
      toast("Saved.");
      onSaved();
      onClose();
    });
  };

  return (
    <Dialog open={!!id} onClose={onClose} side="right" size="md" title={data?.title ?? "Quick edit"} className="bg-white"
      footer={
        <div className="flex items-center justify-between gap-2">
          {data && <Link href={`/admin/products/${data.id}`} className="text-sm underline">Open full editor</Link>}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} busy={saving} disabled={!data}>Save</Button>
          </div>
        </div>
      }
    >
      {!data ? (
        <p className="p-5 text-sm text-taupe">{error ?? "Loading…"}</p>
      ) : (
        <div className="grid gap-5 p-5">
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-medium text-taupe">
              Price (₹)
              <input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} inputMode="decimal" className={adminInput} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-taupe">
              Compare-at price (₹)
              <input value={form.compare} onChange={(e) => setForm({ ...form, compare: e.target.value })} inputMode="decimal" placeholder="Not on sale" className={adminInput} />
            </label>
          </div>
          <label className="grid gap-1.5 text-xs font-medium text-taupe">
            Status
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as QuickEditData["status"] })} className={adminInput}>
              <option value="active">Active (visible in the store)</option>
              <option value="draft">Draft (hidden)</option>
              <option value="archived">Archived (hidden)</option>
            </select>
          </label>
          <div>
            <p className="text-xs font-medium text-taupe">Stock on hand</p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone">
                  <th className="py-1 font-normal">Variant</th>
                  <th className="py-1 font-normal">Held</th>
                  <th className="w-28 py-1 font-normal">On hand</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v) => (
                  <tr key={v.id} className="border-t border-black/5">
                    <td className="py-1.5">
                      <span className="block">{[v.color, v.size].filter(Boolean).join(" / ") || "Default"}</span>
                      <span className="text-xs text-stone">{v.sku}</span>
                    </td>
                    <td className="py-1.5 text-xs text-stone tabular-nums" title="Held by orders waiting for payment">{v.reserved_quantity || "—"}</td>
                    <td className="py-1.5">
                      <input
                        aria-label={`Stock for ${v.sku}`}
                        value={form.stock[v.id] ?? ""}
                        onChange={(e) => setForm({ ...form, stock: { ...form.stock, [v.id]: e.target.value } })}
                        inputMode="numeric"
                        className={cx(adminInput, "w-24 tabular-nums")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-stone">If an order comes in while you edit, your change is applied on top of it, so no sale is lost.</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
