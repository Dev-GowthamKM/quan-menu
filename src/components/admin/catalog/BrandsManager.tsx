"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCatalogRow, saveBrand } from "@/server/admin/catalog";
import CatalogImage from "../../ui/CatalogImage";
import { Badge, Button } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";
import { PlusIcon, StarIcon } from "../../ui/icons";
import { SeoFields, slugify, TextArea, TextField, Toggle } from "../fields";
import { SingleImageField } from "../ImageManager";
import { useToast } from "../Toaster";
import { Empty, Table, Td, Th } from "../ui";

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  logo_url: string | null;
  banner_url: string | null;
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
  seo_title: string;
  seo_description: string;
  is_sample: boolean;
  product_count: number;
}

type Draft = Omit<BrandRow, "id" | "product_count" | "is_sample"> & { id: string | null };

const blank: Draft = { id: null, name: "", slug: "", description: "", logo_url: null, banner_url: null, is_published: true, is_featured: false, sort_order: 0, seo_title: "", seo_description: "" };

export default function BrandsManager({ rows }: { rows: BrandRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (row: BrandRow | null) => {
    setError(null);
    setSlugTouched(!!row);
    setDraft(row ? { ...row } : { ...blank });
  };
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const save = () => {
    if (!draft) return;
    start(async () => {
      const res = await saveBrand({ ...draft, slug: draft.slug || slugify(draft.name) });
      if (!res.ok) return setError(res.error);
      toast("Brand saved.");
      setDraft(null);
      router.refresh();
    });
  };

  const remove = () => {
    if (!draft?.id || !window.confirm(`Delete ${draft.name}?`)) return;
    start(async () => {
      const res = await deleteCatalogRow("brands", draft.id!);
      if (!res.ok) return setError(res.error);
      toast("Brand deleted.");
      setDraft(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => open(null)}><PlusIcon size={14} /> Add brand</Button>
      </div>
      {rows.length === 0 ? (
        <Empty title="No brands yet">Add the labels you sell so customers can shop by brand.</Empty>
      ) : (
        <Table>
          <thead>
            <tr><Th>Brand</Th><Th>Page</Th><Th className="text-right">Products</Th><Th className="text-right">Order</Th><Th><span className="sr-only">Edit</span></Th></tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded border border-black/10 bg-white text-xs font-semibold">
                      {b.logo_url ? <CatalogImage src={b.logo_url} alt="" fill sizes="40px" className="object-contain p-1" /> : b.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <button type="button" onClick={() => open(b)} className="font-medium hover:underline">{b.name}</button>
                      <p className="flex items-center gap-1.5 text-xs text-stone">
                        /brands/{b.slug}
                        {b.is_featured && <span className="inline-flex items-center gap-0.5 text-amber-700"><StarIcon size={11} filled /> Featured</span>}
                        {b.is_sample && <Badge tone="violet">Sample</Badge>}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td>{b.is_published ? <Badge tone="green">Published</Badge> : <Badge>Hidden</Badge>}</Td>
                <Td className="text-right tabular-nums">{b.product_count}</Td>
                <Td className="text-right text-stone tabular-nums">{b.sort_order}</Td>
                <Td className="text-right"><button type="button" onClick={() => open(b)} className="text-xs underline">Edit</button></Td>
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
        title={draft?.id ? `Edit ${draft.name || "brand"}` : "New brand"}
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
            <TextField label="Name" value={draft.name} maxLength={120} autoFocus onChange={(e) => patch({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
            <TextField label="URL handle" value={draft.slug} maxLength={120} hint={`/brands/${draft.slug || "…"}`} onChange={(e) => { setSlugTouched(true); patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }); }} />
            <TextArea label="About the brand" value={draft.description} rows={4} maxLength={5000} onChange={(e) => patch({ description: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <SingleImageField label="Logo" value={draft.logo_url} onChange={(url) => patch({ logo_url: url })} folder="brands" aspect="aspect-square" />
              <SingleImageField label="Banner" value={draft.banner_url} onChange={(url) => patch({ banner_url: url })} folder="brands" />
            </div>
            <Toggle label="Published" hint="Shows the brand page and the brand in filters." checked={draft.is_published} onChange={(v) => patch({ is_published: v })} />
            <Toggle label="Featured on the homepage" checked={draft.is_featured} onChange={(v) => patch({ is_featured: v })} />
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
