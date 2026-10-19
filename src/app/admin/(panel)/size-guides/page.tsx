import type { Metadata } from "next";
import SizeGuidesManager, { type GuideRow } from "@/components/admin/catalog/SizeGuidesManager";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Size guides" };

export default async function SizeGuidesPage() {
  const { supabase } = await requireRole("staff");
  const { data, error } = await supabase
    .from("size_guides")
    .select("id, name, description, unit, columns, rows, how_to_measure, is_sample, products(count), categories(count)")
    .order("name");
  const rows: GuideRow[] = (data ?? []).map(({ products, categories, ...g }) => ({
    ...g,
    rows: (g.rows as unknown as string[][]) ?? [],
    unit: g.unit as "cm" | "in",
    usage: ((products as unknown as { count: number }[])[0]?.count ?? 0) + ((categories as unknown as { count: number }[])[0]?.count ?? 0),
  }));
  return (
    <>
      <PageHeader title="Size guides" description="Measurement charts shown on product pages. Attach one to a category, or to a single product." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <SizeGuidesManager rows={rows} />
    </>
  );
}
