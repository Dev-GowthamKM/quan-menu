"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { SORTS } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import type { Facets } from "@/lib/types";
import { Button, cx, Select } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { ChevronDown, CloseIcon, FilterIcon } from "../../ui/icons";

export interface CategoryLink {
  name: string;
  href: string;
  active?: boolean;
  depth?: number;
}

interface Props {
  facets: Facets | null;
  hide?: ("brand" | "category")[];
  categories?: CategoryLink[];
  total: number;
}

const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: "Under ₹2,000", max: 2000 },
  { label: "₹2,000 – ₹5,000", min: 2000, max: 5000 },
  { label: "₹5,000 – ₹10,000", min: 5000, max: 10000 },
  { label: "Over ₹10,000", min: 10000 },
];

function useListingUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const getList = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false }));
  };
  const toggle = (key: string, value: string) => {
    const current = getList(key);
    const nextList = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    update({ [key]: nextList.join(",") || null });
  };
  return { params, getList, update, toggle, pending };
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-line py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <span className="label-caps">{title}</span>
        <ChevronDown size={16} className="transition group-open:rotate-180" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

export function FilterPanel({ facets, hide = [], categories }: Omit<Props, "total">) {
  const { params, getList, update, toggle } = useListingUrl();
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const brands = getList("brand");
  const sizes = getList("size");
  const colors = getList("color");

  return (
    <div className="text-sm">
      {categories && categories.length > 0 && !hide.includes("category") && (
        <Section title="Category">
          <ul className="grid gap-2">
            {categories.map((c) => (
              <li key={c.href} style={{ paddingLeft: `${(c.depth ?? 0) * 0.85}rem` }}>
                <Link href={c.href} scroll={false} className={cx("hover:text-accent", c.active ? "font-medium underline underline-offset-4" : "text-taupe")}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {facets && facets.brands.length > 0 && !hide.includes("brand") && (
        <Section title="Brand">
          <ul className="grid gap-2.5">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input type="checkbox" className="size-4 accent-ink" checked={brands.includes(b.slug)} onChange={() => toggle("brand", b.slug)} />
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs text-stone tabular-nums">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {facets && facets.sizes.length > 0 && (
        <Section title="Size">
          <div className="flex flex-wrap gap-2">
            {facets.sizes.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={sizes.includes(s.value)}
                onClick={() => toggle("size", s.value)}
                className={cx(
                  "min-w-11 border px-2.5 py-2 text-xs transition",
                  sizes.includes(s.value) ? "border-ink bg-ink text-ivory" : "border-line hover:border-ink",
                )}
              >
                {s.value}
              </button>
            ))}
          </div>
        </Section>
      )}

      {facets && facets.colors.length > 0 && (
        <Section title="Colour">
          <ul className="grid grid-cols-2 gap-2.5">
            {facets.colors.map((c) => (
              <li key={c.value}>
                <button type="button" aria-pressed={colors.includes(c.value)} onClick={() => toggle("color", c.value)} className="flex w-full items-center gap-2 text-left">
                  <span
                    className={cx("size-5 shrink-0 rounded-full ring-1 ring-black/15 ring-offset-2 ring-offset-ivory", colors.includes(c.value) && "ring-2 ring-ink")}
                    style={{ background: c.hex || "#ccc" }}
                  />
                  <span className={cx("truncate", colors.includes(c.value) ? "font-medium" : "text-taupe")}>{c.value}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Price">
        <ul className="grid gap-2">
          {PRICE_PRESETS.map((p) => {
            const active = params.get("min") === (p.min ? String(p.min) : null) && params.get("max") === (p.max ? String(p.max) : null);
            return (
              <li key={p.label}>
                <button
                  type="button"
                  onClick={() => {
                    setMin(p.min ? String(p.min) : "");
                    setMax(p.max ? String(p.max) : "");
                    update(active ? { min: null, max: null } : { min: p.min ? String(p.min) : null, max: p.max ? String(p.max) : null });
                  }}
                  className={cx("hover:text-accent", active ? "font-medium underline underline-offset-4" : "text-taupe")}
                >
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>
        <form
          className="mt-4 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ min: min.replace(/\D/g, "") || null, max: max.replace(/\D/g, "") || null });
          }}
        >
          <label className="sr-only" htmlFor="price-min">Minimum price</label>
          <input id="price-min" inputMode="numeric" placeholder={facets?.price.min ? `₹${Math.floor(facets.price.min / 100)}` : "Min"} value={min} onChange={(e) => setMin(e.target.value)} className="h-9 w-full min-w-0 border border-line bg-white px-2 text-sm" />
          <span className="text-stone">–</span>
          <label className="sr-only" htmlFor="price-max">Maximum price</label>
          <input id="price-max" inputMode="numeric" placeholder={facets?.price.max ? `₹${Math.ceil(facets.price.max / 100)}` : "Max"} value={max} onChange={(e) => setMax(e.target.value)} className="h-9 w-full min-w-0 border border-line bg-white px-2 text-sm" />
          <button type="submit" className="h-9 shrink-0 border border-ink px-3 text-xs hover:bg-ink hover:text-ivory">Go</button>
        </form>
      </Section>

      <Section title="Availability & offers">
        <div className="grid gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="size-4 accent-ink" checked={params.get("stock") === "1"} onChange={(e) => update({ stock: e.target.checked ? "1" : null })} />
            <span className="flex-1">In stock only</span>
            {facets && <span className="text-xs text-stone tabular-nums">{facets.in_stock}</span>}
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input type="checkbox" className="size-4 accent-ink" checked={params.get("sale") === "1"} onChange={(e) => update({ sale: e.target.checked ? "1" : null })} />
            <span className="flex-1">On sale</span>
            {facets && <span className="text-xs text-stone tabular-nums">{facets.on_sale}</span>}
          </label>
        </div>
      </Section>
    </div>
  );
}

export function SortSelect({ className }: { className?: string }) {
  const { params, update, pending } = useListingUrl();
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <label htmlFor="sort" className="shrink-0 text-xs text-taupe">Sort by</label>
      <Select id="sort" value={params.get("sort") ?? "featured"} onChange={(e) => update({ sort: e.target.value === "featured" ? null : e.target.value })} className="h-9 border-transparent! bg-transparent! text-sm hover:border-line!" wrapperClassName="min-w-44" aria-busy={pending}>
        {SORTS.map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </Select>
    </div>
  );
}

export function ActiveFilters({ facets }: { facets: Facets | null }) {
  const { getList, params, toggle, update } = useListingUrl();
  const chips: { label: string; onRemove: () => void }[] = [];
  for (const b of getList("brand")) chips.push({ label: facets?.brands.find((x) => x.slug === b)?.name ?? b, onRemove: () => toggle("brand", b) });
  for (const s of getList("size")) chips.push({ label: `Size ${s}`, onRemove: () => toggle("size", s) });
  for (const c of getList("color")) chips.push({ label: c, onRemove: () => toggle("color", c) });
  const min = params.get("min");
  const max = params.get("max");
  if (min || max) {
    chips.push({
      label: min && max ? `${formatMoney(+min * 100)} – ${formatMoney(+max * 100)}` : min ? `Over ${formatMoney(+min * 100)}` : `Under ${formatMoney(+max! * 100)}`,
      onRemove: () => update({ min: null, max: null }),
    });
  }
  if (params.get("stock") === "1") chips.push({ label: "In stock", onRemove: () => update({ stock: null }) });
  if (params.get("sale") === "1") chips.push({ label: "On sale", onRemove: () => update({ sale: null }) });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <button key={c.label} type="button" onClick={c.onRemove} className="inline-flex items-center gap-1.5 border border-line bg-paper px-2.5 py-1 text-xs hover:border-ink" aria-label={`Remove filter ${c.label}`}>
          {c.label} <CloseIcon size={12} />
        </button>
      ))}
      <button type="button" onClick={() => update({ brand: null, size: null, color: null, min: null, max: null, stock: null, sale: null })} className="text-xs underline underline-offset-4">
        Clear all
      </button>
    </div>
  );
}

export function MobileFilters({ facets, hide, categories, total }: Props) {
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  const count = ["brand", "size", "color", "min", "stock", "sale"].filter((k) => params.get(k)).length;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 border border-ink px-4 text-xs tracking-[0.12em] uppercase lg:hidden">
        <FilterIcon size={16} /> Filter & sort{count > 0 ? ` (${count})` : ""}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        side="left"
        size="sm"
        title="Filter & sort"
        footer={<Button className="w-full" onClick={() => setOpen(false)}>Show {total} {total === 1 ? "result" : "results"}</Button>}
      >
        <div className="px-5">
          <div className="border-b border-line py-5">
            <SortSelect />
          </div>
          <FilterPanel facets={facets} hide={hide} categories={categories} />
        </div>
      </Dialog>
    </>
  );
}
