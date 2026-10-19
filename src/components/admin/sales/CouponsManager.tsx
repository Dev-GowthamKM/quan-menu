"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchProductsForPicker, type PickerProduct } from "@/server/admin/catalog";
import { deleteCoupon, saveCoupon } from "@/server/admin/sales";
import { formatDate } from "@/lib/format";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import { Badge, Button, cx } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { CloseIcon, PlusIcon } from "../../ui/icons";
import { SelectField, TextArea, TextField, Toggle } from "../fields";
import { useToast } from "../Toaster";
import { adminInput, Empty, Table, Td, Th } from "../ui";

export interface CouponRow {
  id: string;
  code: string;
  description: string;
  kind: "percentage" | "fixed" | "free_shipping";
  value: number;
  max_discount: number | null;
  min_subtotal: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_limit_per_customer: number | null;
  first_order_only: boolean;
  applies_to: "all" | "products" | "categories" | "collections";
  product_ids: string[];
  category_ids: string[];
  collection_ids: string[];
  customer_emails: string[];
  is_active: boolean;
  is_sample: boolean;
  used: number;
}

type Opt = { id: string; label: string };

interface Draft {
  id: string | null;
  code: string;
  description: string;
  kind: CouponRow["kind"];
  value: string;
  max: string;
  min: string;
  starts: string;
  ends: string;
  limit: string;
  perCustomer: string;
  first: boolean;
  applies: CouponRow["applies_to"];
  products: PickerProduct[];
  product_ids: string[];
  category_ids: string[];
  collection_ids: string[];
  emails: string;
  active: boolean;
}

const local = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function describe(c: CouponRow) {
  const off = c.kind === "percentage" ? `${c.value / 100}% off` : c.kind === "fixed" ? `${formatMoney(c.value)} off` : "Free delivery";
  const scope = c.applies_to === "all" ? "" : ` selected ${c.applies_to}`;
  return `${off}${scope}${c.min_subtotal ? ` over ${formatMoney(c.min_subtotal)}` : ""}${c.max_discount ? `, up to ${formatMoney(c.max_discount)}` : ""}`;
}

function state(c: CouponRow) {
  const now = Date.now();
  if (!c.is_active) return { label: "Off", tone: "neutral" as const };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: `Starts ${formatDate(c.starts_at)}`, tone: "blue" as const };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: "Expired", tone: "amber" as const };
  if (c.usage_limit && c.used >= c.usage_limit) return { label: "Used up", tone: "amber" as const };
  return { label: "Active", tone: "green" as const };
}

export default function CouponsManager({ rows, canEdit, categories, collections }: { rows: CouponRow[]; canEdit: boolean; categories: Opt[]; collections: Opt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const open = (c: CouponRow | null) => {
    setError(null);
    setDraft(
      c
        ? {
            id: c.id, code: c.code, description: c.description, kind: c.kind,
            value: c.kind === "percentage" ? String(c.value / 100) : c.kind === "fixed" ? fromMinor(c.value) : "",
            max: fromMinor(c.max_discount), min: c.min_subtotal ? fromMinor(c.min_subtotal) : "", starts: local(c.starts_at), ends: local(c.ends_at),
            limit: c.usage_limit ? String(c.usage_limit) : "", perCustomer: c.usage_limit_per_customer ? String(c.usage_limit_per_customer) : "",
            first: c.first_order_only, applies: c.applies_to, products: c.product_ids.map((id) => ({ id, title: "Selected product", status: "", image: null })),
            product_ids: c.product_ids, category_ids: c.category_ids, collection_ids: c.collection_ids, emails: c.customer_emails.join("\n"), active: c.is_active,
          }
        : { id: null, code: "", description: "", kind: "percentage", value: "10", max: "", min: "", starts: "", ends: "", limit: "", perCustomer: "1", first: false, applies: "all", products: [], product_ids: [], category_ids: [], collection_ids: [], emails: "", active: true },
    );
  };

  const save = () => {
    if (!draft) return;
    let value = 0;
    if (draft.kind === "percentage") {
      const n = Number(draft.value);
      if (!Number.isFinite(n) || n <= 0 || n > 100) return setError("Enter a percentage between 1 and 100.");
      value = Math.round(n * 100);
    } else if (draft.kind === "fixed") {
      const m = toMinor(draft.value);
      if (!m) return setError("Enter the amount off in rupees.");
      value = m;
    }
    const int = (s: string) => (s.trim() ? Math.max(1, Math.round(Number(s))) || null : null);
    start(async () => {
      const res = await saveCoupon({
        id: draft.id, code: draft.code, description: draft.description, kind: draft.kind, value,
        max_discount: draft.kind === "percentage" && draft.max.trim() ? toMinor(draft.max) : null,
        min_subtotal: toMinor(draft.min) ?? 0,
        starts_at: draft.starts ? new Date(draft.starts).toISOString() : null,
        ends_at: draft.ends ? new Date(draft.ends).toISOString() : null,
        usage_limit: int(draft.limit), usage_limit_per_customer: int(draft.perCustomer), first_order_only: draft.first,
        applies_to: draft.applies,
        product_ids: draft.applies === "products" ? draft.product_ids : [],
        category_ids: draft.applies === "categories" ? draft.category_ids : [],
        collection_ids: draft.applies === "collections" ? draft.collection_ids : [],
        customer_emails: draft.emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean),
        is_active: draft.active,
      });
      if (!res.ok) return setError(res.error);
      toast("Discount saved.");
      setDraft(null);
      router.refresh();
    });
  };

  const remove = () => {
    if (!draft?.id || !window.confirm(`Delete ${draft.code}?`)) return;
    start(async () => {
      const res = await deleteCoupon(draft.id!);
      if (!res.ok) return setError(res.error);
      toast(res.message ?? "Deleted.");
      setDraft(null);
      router.refresh();
    });
  };

  const search = async (text: string) => {
    setQ(text);
    const res = await searchProductsForPicker(text);
    if (res.ok) setResults(res.data);
  };

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <>
      {canEdit ? (
        <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => open(null)}><PlusIcon size={14} /> Create discount</Button></div>
      ) : (
        <p className="mb-3 text-sm text-taupe">Only admins can create or change discounts.</p>
      )}
      {rows.length === 0 ? (
        <Empty title="No discount codes yet" />
      ) : (
        <Table>
          <thead><tr><Th>Code</Th><Th>Discount</Th><Th>Status</Th><Th className="text-right">Used</Th><Th>Dates</Th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const s = state(c);
              return (
                <tr key={c.id}>
                  <Td>
                    {canEdit ? <button type="button" onClick={() => open(c)} className="font-mono font-medium hover:underline">{c.code}</button> : <span className="font-mono font-medium">{c.code}</span>}
                    {c.is_sample && <Badge tone="violet" className="ml-2">Sample</Badge>}
                    {c.description && <span className="block text-xs text-stone">{c.description}</span>}
                  </Td>
                  <Td className="text-taupe">{describe(c)}{c.first_order_only && <span className="block text-xs">First order only</span>}</Td>
                  <Td><Badge tone={s.tone}>{s.label}</Badge></Td>
                  <Td className="text-right tabular-nums">{c.used}{c.usage_limit ? <span className="text-stone"> / {c.usage_limit}</span> : ""}</Td>
                  <Td className="text-xs text-taupe">{c.starts_at ? formatDate(c.starts_at) : "Now"} – {c.ends_at ? formatDate(c.ends_at) : "no end"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog open={!!draft} onClose={() => setDraft(null)} side="right" size="md" title={draft?.id ? `Edit ${draft.code}` : "New discount"} className="bg-white"
        footer={
          <div className="flex items-center gap-2">
            {draft?.id && <button type="button" onClick={remove} className="text-sm text-red-700 underline">Delete</button>}
            <div className="ml-auto flex gap-2"><Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button><Button size="sm" onClick={save} busy={pending}>Save</Button></div>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-4 p-5">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <TextField label="Code" value={draft.code} onChange={(e) => patch({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} maxLength={40} hint="What customers type, e.g. DIWALI20." className="font-mono" autoFocus />
            <TextArea label="Internal description" value={draft.description} onChange={(e) => patch({ description: e.target.value })} rows={2} maxLength={500} />
            <SelectField label="Type" value={draft.kind} onChange={(e) => patch({ kind: e.target.value as Draft["kind"] })}>
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
              <option value="free_shipping">Free delivery</option>
            </SelectField>
            {draft.kind !== "free_shipping" && (
              <div className="grid grid-cols-2 gap-3">
                <TextField label={draft.kind === "percentage" ? "Percent off" : "Amount off (₹)"} value={draft.value} onChange={(e) => patch({ value: e.target.value })} inputMode="decimal" />
                {draft.kind === "percentage" && <TextField label="Maximum discount (₹)" value={draft.max} onChange={(e) => patch({ max: e.target.value })} inputMode="decimal" placeholder="No cap" />}
              </div>
            )}
            <TextField label="Minimum order (₹)" value={draft.min} onChange={(e) => patch({ min: e.target.value })} inputMode="decimal" placeholder="None" hint="Item total after other discounts." />
            <SelectField label="Applies to" value={draft.applies} onChange={(e) => patch({ applies: e.target.value as Draft["applies"] })}>
              <option value="all">The whole order</option>
              <option value="categories">Products in some categories</option>
              <option value="collections">Products in some collections</option>
              <option value="products">Specific products</option>
            </SelectField>
            {draft.applies === "categories" && (
              <fieldset className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-black/10 p-2 text-sm">
                <legend className="sr-only">Categories</legend>
                {categories.map((c) => <label key={c.id} className="inline-flex items-center gap-2"><input type="checkbox" className="size-4 accent-ink" checked={draft.category_ids.includes(c.id)} onChange={() => patch({ category_ids: toggle(draft.category_ids, c.id) })} />{c.label}</label>)}
              </fieldset>
            )}
            {draft.applies === "collections" && (
              <fieldset className="grid max-h-48 gap-1 overflow-y-auto rounded-md border border-black/10 p-2 text-sm">
                <legend className="sr-only">Collections</legend>
                {collections.map((c) => <label key={c.id} className="inline-flex items-center gap-2"><input type="checkbox" className="size-4 accent-ink" checked={draft.collection_ids.includes(c.id)} onChange={() => patch({ collection_ids: toggle(draft.collection_ids, c.id) })} />{c.label}</label>)}
              </fieldset>
            )}
            {draft.applies === "products" && (
              <div className="grid gap-2">
                <input value={q} onChange={(e) => search(e.target.value)} onFocus={() => !results.length && search("")} placeholder="Search products" aria-label="Search products" className={adminInput} />
                {results.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-md border border-black/10 text-sm">
                    {results.map((p) => (
                      <li key={p.id}><button type="button" disabled={draft.product_ids.includes(p.id)} onClick={() => patch({ product_ids: [...draft.product_ids, p.id], products: [...draft.products, p] })} className="w-full px-2 py-1.5 text-left hover:bg-black/5 disabled:opacity-40">{p.title}</button></li>
                    ))}
                  </ul>
                )}
                <ul className="flex flex-wrap gap-1.5">
                  {draft.product_ids.map((id) => {
                    const p = draft.products.find((x) => x.id === id);
                    return <li key={id} className="inline-flex items-center gap-1 rounded bg-black/[0.06] px-2 py-0.5 text-xs">{p?.title ?? "Product"}<button type="button" aria-label="Remove" onClick={() => patch({ product_ids: draft.product_ids.filter((x) => x !== id) })}><CloseIcon size={11} /></button></li>;
                  })}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Starts" type="datetime-local" value={draft.starts} onChange={(e) => patch({ starts: e.target.value })} />
              <TextField label="Ends" type="datetime-local" value={draft.ends} onChange={(e) => patch({ ends: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Total uses" value={draft.limit} onChange={(e) => patch({ limit: e.target.value })} inputMode="numeric" placeholder="Unlimited" />
              <TextField label="Uses per customer" value={draft.perCustomer} onChange={(e) => patch({ perCustomer: e.target.value })} inputMode="numeric" placeholder="Unlimited" />
            </div>
            <Toggle label="First order only" hint="Checked against the customer's email and account." checked={draft.first} onChange={(v) => patch({ first: v })} />
            <TextArea label="Only for these customers (optional)" value={draft.emails} onChange={(e) => patch({ emails: e.target.value })} rows={2} placeholder="one@example.com, two@example.com" />
            <Toggle label="Active" checked={draft.active} onChange={(v) => patch({ active: v })} />
            <p className={cx("rounded-md bg-black/[0.03] px-3 py-2 text-xs text-taupe")}>Limits are enforced when the order is placed, even if many customers use the code at the same moment.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}
