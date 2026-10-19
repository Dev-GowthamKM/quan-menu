"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteCatalogRow, previewCollectionRules, saveCollection, searchProductsForPicker, type PickerProduct } from "@/server/admin/catalog";
import { fromMinor, toMinor } from "@/lib/money";
import CatalogImage from "../../ui/CatalogImage";
import { Badge, Button, cx } from "../../ui/controls";
import { ChevronDown, ChevronRight, CloseIcon, ExternalIcon, ImageIcon, PlusIcon } from "../../ui/icons";
import { SelectField, SeoFields, slugify, TextArea, TextField, Toggle } from "../fields";
import { SingleImageField } from "../ImageManager";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

type Field = "tag" | "brand" | "category" | "title" | "price" | "on_sale" | "color" | "size" | "created_within_days";
type Op = "equals" | "not_equals" | "contains" | "lt" | "gt";
interface Condition {
  field: Field;
  op: Op;
  value: string;
}

export interface EditorCollection {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  image_url: string | null;
  banner_url: string | null;
  kind: "manual" | "automated";
  rules: { match: "all" | "any"; conditions: Condition[] };
  is_seasonal: boolean;
  season: string;
  is_featured: boolean;
  is_published: boolean;
  sort_order: number;
  product_sort: "manual" | "newest" | "price_asc" | "price_desc" | "best_selling";
  starts_at: string | null;
  ends_at: string | null;
  seo_title: string;
  seo_description: string;
  products: PickerProduct[];
}

type Opt = { id: string; label: string };

const FIELDS: { value: Field; label: string; ops: { value: Op; label: string }[] }[] = [
  { value: "tag", label: "Tag", ops: [{ value: "equals", label: "is" }, { value: "not_equals", label: "is not" }] },
  { value: "category", label: "Category", ops: [{ value: "equals", label: "is in" }, { value: "not_equals", label: "is not in" }] },
  { value: "brand", label: "Brand", ops: [{ value: "equals", label: "is" }, { value: "not_equals", label: "is not" }] },
  { value: "price", label: "Price", ops: [{ value: "lt", label: "is below" }, { value: "gt", label: "is above" }, { value: "equals", label: "is exactly" }] },
  { value: "on_sale", label: "On sale", ops: [{ value: "equals", label: "is" }] },
  { value: "title", label: "Title", ops: [{ value: "contains", label: "contains" }, { value: "not_equals", label: "doesn't contain" }] },
  { value: "color", label: "Colour", ops: [{ value: "equals", label: "includes" }, { value: "not_equals", label: "doesn't include" }] },
  { value: "size", label: "Size", ops: [{ value: "equals", label: "includes" }, { value: "not_equals", label: "doesn't include" }] },
  { value: "created_within_days", label: "Added in the last", ops: [{ value: "equals", label: "days" }] },
];

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CollectionEditor({ collection, brands, categories }: { collection: EditorCollection; brands: Opt[]; categories: Opt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [c, setC] = useState(collection);
  const [slugTouched, setSlugTouched] = useState(!!collection.id);
  const [starts, setStarts] = useState(toLocalInput(collection.starts_at));
  const [ends, setEnds] = useState(toLocalInput(collection.ends_at));
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const baseline = useRef(JSON.stringify({ c: collection, starts: toLocalInput(collection.starts_at), ends: toLocalInput(collection.ends_at) }));
  const dirty = JSON.stringify({ c, starts, ends }) !== baseline.current;
  const patch = (p: Partial<EditorCollection>) => setC((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Live preview of automated rules.
  const [preview, setPreview] = useState<{ count: number; live: number; products: PickerProduct[] } | null>(null);
  const rulesKey = JSON.stringify(c.rules);
  useEffect(() => {
    if (c.kind !== "automated") return;
    const ready = c.rules.conditions.filter((x) => x.value.trim());
    if (!ready.length) return setPreview(null);
    const t = setTimeout(() => {
      previewCollectionRules({ match: c.rules.match, conditions: ready }).then((res) => res.ok && setPreview(res.data));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesKey, c.kind]);

  const save = () => {
    const conditions = c.rules.conditions.filter((x) => x.value.trim());
    if (c.kind === "automated" && !conditions.length) return setError("Add at least one rule with a value.");
    const startsAt = starts ? new Date(starts) : null;
    const endsAt = ends ? new Date(ends) : null;
    if (startsAt && endsAt && endsAt <= startsAt) return setError("The end must be after the start.");
    setError(null);
    start(async () => {
      const res = await saveCollection({
        id: c.id,
        title: c.title,
        slug: c.slug || slugify(c.title),
        description: c.description,
        image_url: c.image_url,
        banner_url: c.banner_url,
        kind: c.kind,
        rules: { match: c.rules.match, conditions },
        is_seasonal: c.is_seasonal,
        season: c.season,
        is_featured: c.is_featured,
        is_published: c.is_published,
        sort_order: c.sort_order,
        product_sort: c.kind === "automated" && c.product_sort === "manual" ? "newest" : c.product_sort,
        starts_at: startsAt?.toISOString() ?? null,
        ends_at: endsAt?.toISOString() ?? null,
        seo_title: c.seo_title,
        seo_description: c.seo_description,
        ...(c.kind === "manual" ? { product_ids: c.products.map((p) => p.id) } : {}),
      });
      if (!res.ok) return setError(res.error);
      baseline.current = JSON.stringify({ c, starts, ends });
      toast("Collection saved.");
      if (!c.id) router.replace(`/admin/collections/${res.data.id}`);
      else router.refresh();
    });
  };

  const remove = () => {
    if (!c.id || !window.confirm(`Delete the collection "${c.title}"? Products stay in the catalog.`)) return;
    start(async () => {
      const res = await deleteCatalogRow("collections", c.id!);
      if (!res.ok) return setError(res.error);
      toast("Collection deleted.");
      router.push("/admin/collections");
    });
  };

  return (
    <div className="pb-16">
      <div className="sticky top-0 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-3 border-b border-black/10 bg-[#f5f5f3]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Link href="/admin/collections" className="text-sm text-taupe hover:text-ink">← Collections</Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{c.title || (c.id ? "Untitled collection" : "New collection")}</h1>
        {dirty ? <span className="text-xs text-amber-800">Unsaved changes</span> : c.id ? <span className="text-xs text-stone">All changes saved</span> : null}
        {c.id && c.is_published && (
          <a href={`/collections/${collection.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/15 bg-white px-3 text-xs hover:border-black/40">View <ExternalIcon size={12} /></a>
        )}
        <Button size="sm" onClick={save} busy={saving} disabled={!c.title.trim() || (!dirty && !!c.id)}>Save</Button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 content-start gap-5">
          <Card>
            <div className="grid gap-4">
              <TextField label="Title" value={c.title} maxLength={120} autoFocus={!c.id} onChange={(e) => patch({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} placeholder="The Festive Edit" />
              <TextArea label="Description" value={c.description} rows={3} maxLength={5000} onChange={(e) => patch({ description: e.target.value })} hint="Shown at the top of the collection page." />
            </div>
          </Card>

          <Card title="Products">
            <div className="mb-4 flex flex-wrap gap-2" role="radiogroup" aria-label="How products are chosen">
              {(["manual", "automated"] as const).map((k) => (
                <label key={k} className={cx("flex flex-1 cursor-pointer items-start gap-2 rounded-md border p-3 text-sm", c.kind === k ? "border-ink bg-black/[0.02]" : "border-black/10")}>
                  <input type="radio" name="kind" checked={c.kind === k} onChange={() => patch({ kind: k })} className="mt-0.5 size-4 accent-ink" />
                  <span>
                    <span className="font-medium">{k === "manual" ? "Hand-picked" : "Automated"}</span>
                    <span className="block text-xs text-stone">{k === "manual" ? "Choose products and their order." : "Products join and leave by rules, as the catalog changes."}</span>
                  </span>
                </label>
              ))}
            </div>
            {c.kind === "manual" ? (
              <ManualProducts products={c.products} onChange={(products) => patch({ products })} />
            ) : (
              <RulesBuilder rules={c.rules} onChange={(rules) => patch({ rules })} brands={brands} categories={categories} preview={preview} />
            )}
          </Card>

          <Card title="Search engine listing">
            <SeoFields title={c.seo_title} description={c.seo_description} fallbackTitle={c.title} fallbackDescription={c.description.slice(0, 160)} onChange={patch} />
            <TextField className="mt-3" label="URL handle" value={c.slug} maxLength={120} hint={`/collections/${c.slug || "…"}${c.id && c.slug !== collection.slug ? " · changing it breaks saved links" : ""}`} onChange={(e) => { setSlugTouched(true); patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }); }} />
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card title="Visibility">
            <div className="grid gap-3">
              <Toggle label="Published" checked={c.is_published} onChange={(v) => patch({ is_published: v })} />
              <Toggle label="Feature on the homepage" checked={c.is_featured} onChange={(v) => patch({ is_featured: v })} />
              <div className="grid gap-3 border-t border-black/10 pt-3">
                <TextField label="Show from" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} hint="Optional. Your time zone." />
                <TextField label="Show until" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} hint="Optional. The collection hides itself afterwards." />
              </div>
              <div className="grid gap-3 border-t border-black/10 pt-3">
                <Toggle label="Seasonal collection" checked={c.is_seasonal} onChange={(v) => patch({ is_seasonal: v })} />
                {c.is_seasonal && <TextField label="Season" value={c.season} maxLength={60} onChange={(e) => patch({ season: e.target.value })} placeholder="Autumn/Winter 2026" />}
              </div>
            </div>
          </Card>
          <Card title="Display">
            <div className="grid gap-3">
              <SelectField label="Product order" value={c.kind === "automated" && c.product_sort === "manual" ? "newest" : c.product_sort} onChange={(e) => patch({ product_sort: e.target.value as EditorCollection["product_sort"] })}>
                {c.kind === "manual" && <option value="manual">As arranged</option>}
                <option value="newest">Newest first</option>
                <option value="best_selling">Best selling</option>
                <option value="price_asc">Price, low to high</option>
                <option value="price_desc">Price, high to low</option>
              </SelectField>
              <TextField label="Sort order" type="number" value={c.sort_order} onChange={(e) => patch({ sort_order: Number(e.target.value) || 0 })} hint="Position among collections. Lower comes first." />
              <SingleImageField label="Tile image" value={c.image_url} onChange={(url) => patch({ image_url: url })} folder="collections" aspect="aspect-[4/5]" />
              <SingleImageField label="Banner" value={c.banner_url} onChange={(url) => patch({ banner_url: url })} folder="collections" />
            </div>
          </Card>
          {c.id && <button type="button" onClick={remove} className="justify-self-start text-sm text-red-700 underline">Delete collection</button>}
        </div>
      </div>
    </div>
  );
}

function ProductThumb({ p }: { p: PickerProduct }) {
  return (
    <div className="relative size-10 shrink-0 overflow-hidden rounded bg-bone">
      {p.image ? <CatalogImage src={p.image} alt="" fill sizes="40px" className="object-cover" /> : <ImageIcon size={16} className="absolute inset-0 m-auto text-stone" />}
    </div>
  );
}

function ManualProducts({ products, onChange }: { products: PickerProduct[]; onChange: (p: PickerProduct[]) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearching(true);
      searchProductsForPicker(q).then((res) => {
        setSearching(false);
        if (res.ok) setResults(res.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const chosen = useMemo(() => new Set(products.map((p) => p.id)), [products]);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= products.length) return;
    const next = [...products];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <label htmlFor="picker" className="text-xs font-medium text-taupe">Find products</label>
        <input id="picker" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, SKU or tag" className={cx(adminInput, "mt-1.5 w-full")} />
        <ul className="mt-2 grid max-h-96 gap-1 overflow-y-auto" aria-busy={searching}>
          {results.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-black/[0.03]">
              <ProductThumb p={p} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{p.title}</span>
                {p.status !== "active" && <span className="text-xs text-stone capitalize">{p.status}</span>}
              </span>
              <button type="button" disabled={chosen.has(p.id)} onClick={() => onChange([...products, p])} className="inline-flex h-7 items-center gap-1 rounded border border-black/15 px-2 text-xs hover:border-black/40 disabled:opacity-40">
                {chosen.has(p.id) ? "Added" : <><PlusIcon size={12} /> Add</>}
              </button>
            </li>
          ))}
          {!results.length && !searching && <li className="px-2 py-3 text-sm text-stone">No products found.</li>}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium text-taupe">In this collection ({products.length})</p>
        {products.length === 0 ? (
          <p className="mt-2 rounded-md border border-dashed border-black/15 px-3 py-6 text-center text-sm text-stone">Add products from the search.</p>
        ) : (
          <ol className="mt-2 grid max-h-[28rem] gap-1 overflow-y-auto">
            {products.map((p, i) => (
              <li
                key={p.id}
                draggable
                onDragStart={() => setDrag(i)}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => drag !== null && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (drag !== null) move(drag, i);
                  setDrag(null);
                }}
                className={cx("flex cursor-grab items-center gap-2 rounded-md border border-black/10 bg-white px-2 py-1.5", drag === i && "opacity-40")}
              >
                <span className="w-5 text-right text-xs text-stone tabular-nums">{i + 1}</span>
                <ProductThumb p={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.title}</span>
                  {p.status !== "active" && <Badge tone={p.status === "scheduled" ? "blue" : "neutral"}>{p.status}</Badge>}
                </span>
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${p.title} up`} className="grid size-6 place-items-center rounded hover:bg-black/5 disabled:opacity-30"><ChevronDown size={13} className="rotate-180" /></button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === products.length - 1} aria-label={`Move ${p.title} down`} className="grid size-6 place-items-center rounded hover:bg-black/5 disabled:opacity-30"><ChevronDown size={13} /></button>
                <button type="button" onClick={() => onChange(products.filter((x) => x.id !== p.id))} aria-label={`Remove ${p.title}`} className="grid size-6 place-items-center rounded text-stone hover:bg-red-50 hover:text-red-700"><CloseIcon size={13} /></button>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-2 text-xs text-stone">Drag to reorder. Only active products show in the store.</p>
      </div>
    </div>
  );
}

function RulesBuilder({ rules, onChange, brands, categories, preview }: {
  rules: EditorCollection["rules"];
  onChange: (r: EditorCollection["rules"]) => void;
  brands: Opt[];
  categories: Opt[];
  preview: { count: number; live: number; products: PickerProduct[] } | null;
}) {
  const set = (i: number, p: Partial<Condition>) => onChange({ ...rules, conditions: rules.conditions.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const add = () => onChange({ ...rules, conditions: [...rules.conditions, { field: "tag", op: "equals", value: "" }] });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Products must match
        <select aria-label="Match all or any rule" value={rules.match} onChange={(e) => onChange({ ...rules, match: e.target.value as "all" | "any" })} className={adminInput}>
          <option value="all">all rules</option>
          <option value="any">any rule</option>
        </select>
      </div>
      <ul className="grid gap-2">
        {rules.conditions.map((cond, i) => {
          const field = FIELDS.find((f) => f.value === cond.field) ?? FIELDS[0];
          return (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label={`Rule ${i + 1} field`} value={cond.field} onChange={(e) => { const f = FIELDS.find((x) => x.value === e.target.value)!; set(i, { field: f.value, op: f.ops[0].value, value: f.value === "on_sale" ? "true" : "" }); }} className={cx(adminInput, "w-40")}>
                {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              {field.value !== "created_within_days" && (
                <select aria-label={`Rule ${i + 1} condition`} value={cond.op} onChange={(e) => set(i, { op: e.target.value as Op })} className={cx(adminInput, "w-36")}>
                  {field.ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              {field.value === "brand" || field.value === "category" ? (
                <select aria-label={`Rule ${i + 1} value`} value={cond.value} onChange={(e) => set(i, { value: e.target.value })} className={cx(adminInput, "min-w-48 flex-1")}>
                  <option value="">Choose…</option>
                  {(field.value === "brand" ? brands : categories).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              ) : field.value === "on_sale" ? (
                <select aria-label={`Rule ${i + 1} value`} value={cond.value} onChange={(e) => set(i, { value: e.target.value })} className={cx(adminInput, "w-28")}>
                  <option value="true">yes</option>
                  <option value="false">no</option>
                </select>
              ) : field.value === "price" ? (
                <span className="relative">
                  <span className="pointer-events-none absolute top-2 left-2.5 text-sm text-stone">₹</span>
                  <input aria-label={`Rule ${i + 1} price`} inputMode="decimal" value={fromMinor(cond.value ? Number(cond.value) : null)} onChange={(e) => { const m = toMinor(e.target.value); set(i, { value: m === null ? "" : String(m) }); }} className={cx(adminInput, "w-32 pl-6")} />
                </span>
              ) : (
                <input aria-label={`Rule ${i + 1} value`} value={cond.value} inputMode={field.value === "created_within_days" ? "numeric" : undefined} onChange={(e) => set(i, { value: e.target.value })} className={cx(adminInput, field.value === "created_within_days" ? "w-24" : "min-w-48 flex-1")} placeholder={field.value === "tag" ? "linen" : ""} />
              )}
              {field.value === "created_within_days" && <span className="text-sm text-taupe">days</span>}
              <button type="button" onClick={() => onChange({ ...rules, conditions: rules.conditions.filter((_, j) => j !== i) })} aria-label={`Remove rule ${i + 1}`} className="grid size-8 place-items-center rounded text-stone hover:bg-red-50 hover:text-red-700"><CloseIcon size={14} /></button>
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 justify-self-start rounded-md border border-dashed border-black/20 px-3 py-1.5 text-sm hover:border-black/50"><PlusIcon size={13} /> Add rule</button>
      <div className="rounded-md bg-black/[0.03] p-3">
        {preview ? (
          <>
            <p className="text-sm"><b>{preview.count}</b> {preview.count === 1 ? "product matches" : "products match"} now{preview.live !== preview.count ? ` (${preview.live} live in the store)` : ""}.</p>
            {preview.products.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {preview.products.map((p) => (
                  <li key={p.id} title={p.title} className="flex max-w-48 items-center gap-2 rounded bg-white px-1.5 py-1 text-xs">
                    <ProductThumb p={p} />
                    <span className="truncate">{p.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="flex items-center gap-1 text-sm text-stone"><ChevronRight size={13} /> Add a rule to see which products match.</p>
        )}
      </div>
    </div>
  );
}
