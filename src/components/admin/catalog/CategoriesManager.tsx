"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deleteCatalogRow, saveCategory } from "@/server/admin/catalog";
import CatalogImage from "../../ui/CatalogImage";
import { Badge, Button } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { PlusIcon } from "../../ui/icons";
import { SelectField, SeoFields, slugify, TextArea, TextField, Toggle } from "../fields";
import { SingleImageField } from "../ImageManager";
import { useToast } from "../Toaster";
import { Empty, Table, Td, Th } from "../ui";

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string;
  image_url: string | null;
  banner_url: string | null;
  size_guide_id: string | null;
  is_published: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  is_sample: boolean;
  depth: number;
  path: string;
  product_count: number;
}

type Draft = Omit<CategoryRow, "id" | "depth" | "path" | "product_count" | "is_sample"> & { id: string | null };

export default function CategoriesManager({ rows, sizeGuides }: { rows: CategoryRow[]; sizeGuides: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, string[]>();
    for (const r of rows) m.set(r.parent_id, [...(m.get(r.parent_id) ?? []), r.id]);
    return m;
  }, [rows]);

  /** A category can't move under itself or one of its own subcategories. */
  const excluded = useMemo(() => {
    const out = new Set<string>();
    if (!draft?.id) return out;
    const walk = (id: string) => {
      out.add(id);
      for (const c of childrenOf.get(id) ?? []) walk(c);
    };
    walk(draft.id);
    return out;
  }, [draft?.id, childrenOf]);

  const suggestSlug = (name: string, parent: string | null) => {
    const p = rows.find((r) => r.id === parent);
    return slugify(p ? `${p.slug}-${name}` : name);
  };

  const open = (row: CategoryRow | null, parent: string | null = null) => {
    setError(null);
    setSlugTouched(!!row);
    setDraft(
      row
        ? { ...row }
        : { id: null, parent_id: parent, name: "", slug: "", description: "", image_url: null, banner_url: null, size_guide_id: null, is_published: true, sort_order: (childrenOf.get(parent)?.length ?? 0) + 1, seo_title: "", seo_description: "" },
    );
  };
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const save = () => {
    if (!draft) return;
    start(async () => {
      const res = await saveCategory({ ...draft, slug: draft.slug || suggestSlug(draft.name, draft.parent_id) });
      if (!res.ok) return setError(res.error);
      toast("Category saved.");
      setDraft(null);
      router.refresh();
    });
  };

  const remove = () => {
    if (!draft?.id || !window.confirm(`Delete ${draft.name}?`)) return;
    start(async () => {
      const res = await deleteCatalogRow("categories", draft.id!);
      if (!res.ok) return setError(res.error);
      toast("Category deleted.");
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => open(null)}><PlusIcon size={14} /> Add category</Button>
      </div>
      {rows.length === 0 ? (
        <Empty title="No categories yet">Start with departments such as Women, Men and Accessories, then add categories inside them.</Empty>
      ) : (
        <Table>
          <thead>
            <tr><Th>Category</Th><Th>Page</Th><Th className="text-right">Products</Th><Th className="text-right">Order</Th><Th><span className="sr-only">Actions</span></Th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div className="flex items-center gap-3" style={{ paddingLeft: c.depth * 28 }}>
                    <div className="relative size-9 shrink-0 overflow-hidden rounded bg-bone">
                      {c.image_url && <CatalogImage src={c.image_url} alt="" fill sizes="36px" className="object-cover" />}
                    </div>
                    <div>
                      <button type="button" onClick={() => open(c)} className={c.depth === 0 ? "font-semibold hover:underline" : "hover:underline"}>{c.name}</button>
                      <p className="flex items-center gap-1.5 text-xs text-stone">/category/{c.slug} {c.is_sample && <Badge tone="violet">Sample</Badge>}</p>
                    </div>
                  </div>
                </Td>
                <Td>{c.is_published ? <Badge tone="green">Published</Badge> : <Badge>Hidden</Badge>}</Td>
                <Td className="text-right tabular-nums">{c.product_count}</Td>
                <Td className="text-right text-stone tabular-nums">{c.sort_order}</Td>
                <Td className="text-right whitespace-nowrap">
                  {c.depth < 5 && <button type="button" onClick={() => open(null, c.id)} className="mr-3 text-xs underline">Add subcategory</button>}
                  <button type="button" onClick={() => open(c)} className="text-xs underline">Edit</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        side="right"
        size="md"
        title={draft?.id ? `Edit ${draft.name || "category"}` : "New category"}
        className="bg-white"
        footer={
          <div className="flex items-center gap-2">
            {draft?.id && <button type="button" onClick={remove} disabled={pending} className="text-sm text-red-700 underline">Delete</button>}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
              <Button size="sm" onClick={save} busy={pending} disabled={!draft?.name.trim()}>Save</Button>
            </div>
          </div>
        }
      >
        {draft && (
          <div className="grid gap-4 p-5">
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            <TextField label="Name" value={draft.name} maxLength={120} autoFocus onChange={(e) => patch({ name: e.target.value, ...(slugTouched ? {} : { slug: suggestSlug(e.target.value, draft.parent_id) }) })} />
            <SelectField label="Inside" value={draft.parent_id ?? ""} onChange={(e) => patch({ parent_id: e.target.value || null, ...(slugTouched ? {} : { slug: suggestSlug(draft.name, e.target.value || null) }) })} hint="Top level categories are departments in the main menu.">
              <option value="">Top level</option>
              {rows.filter((r) => !excluded.has(r.id)).map((r) => <option key={r.id} value={r.id}>{" ".repeat(r.depth)}{r.name}</option>)}
            </SelectField>
            <TextField label="URL handle" value={draft.slug} maxLength={120} hint={`/category/${draft.slug || "…"}`} onChange={(e) => { setSlugTouched(true); patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }); }} />
            <TextArea label="Description" value={draft.description} rows={3} maxLength={5000} onChange={(e) => patch({ description: e.target.value })} hint="Shown at the top of the category page." />
            <div className="grid grid-cols-2 gap-4">
              <SingleImageField label="Tile image" value={draft.image_url} onChange={(url) => patch({ image_url: url })} folder="categories" aspect="aspect-[3/4]" />
              <SingleImageField label="Banner" value={draft.banner_url} onChange={(url) => patch({ banner_url: url })} folder="categories" />
            </div>
            <SelectField label="Size guide" value={draft.size_guide_id ?? ""} onChange={(e) => patch({ size_guide_id: e.target.value || null })} hint="Used by products in this category that don't choose their own.">
              <option value="">None</option>
              {sizeGuides.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </SelectField>
            <Toggle label="Published" hint="Hidden categories don't appear in menus or filters." checked={draft.is_published} onChange={(v) => patch({ is_published: v })} />
            <TextField label="Sort order" type="number" value={draft.sort_order} onChange={(e) => patch({ sort_order: Number(e.target.value) || 0 })} hint="Lower numbers come first." />
            <div className="border-t border-black/10 pt-4">
              <p className="mb-3 text-xs font-medium text-taupe">Search engine listing</p>
              <SeoFields title={draft.seo_title} description={draft.seo_description} fallbackTitle={draft.name} fallbackDescription={draft.description.slice(0, 160)} onChange={patch} />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
