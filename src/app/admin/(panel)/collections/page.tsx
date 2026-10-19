import Link from "next/link";
import type { Metadata } from "next";
import { Empty, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import CatalogImage from "@/components/ui/CatalogImage";
import { Badge, buttonClass, Notice } from "@/components/ui/controls";
import { PlusIcon, StarIcon } from "@/components/ui/icons";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Collections" };

interface Row {
  id: string; title: string; slug: string; kind: "manual" | "automated"; is_published: boolean; is_featured: boolean;
  is_seasonal: boolean; season: string; starts_at: string | null; ends_at: string | null; image_url: string | null;
  sort_order: number; is_sample: boolean; product_count: number; live_count: number;
}

function schedule(r: Row) {
  const now = Date.now();
  if (r.starts_at && new Date(r.starts_at).getTime() > now) return { label: `Starts ${formatDate(r.starts_at)}`, tone: "blue" as const };
  if (r.ends_at && new Date(r.ends_at).getTime() < now) return { label: `Ended ${formatDate(r.ends_at)}`, tone: "amber" as const };
  if (r.ends_at) return { label: `Until ${formatDate(r.ends_at)}`, tone: "neutral" as const };
  return null;
}

export default async function CollectionsPage() {
  const { supabase } = await requireRole("staff");
  const { data, error } = await supabase.rpc("admin_collection_list");
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageHeader
        title="Collections"
        description="Curated edits (you pick the products) and automated collections (products join by rules such as tag or price)."
        actions={<Link href="/admin/collections/new" className={buttonClass("primary", "sm")}><PlusIcon size={14} /> Add collection</Link>}
      />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      {rows.length === 0 ? (
        <Empty title="No collections yet">Create a seasonal edit or a rule-based collection such as &ldquo;Under ₹3,000&rdquo;.</Empty>
      ) : (
        <Table>
          <thead><tr><Th>Collection</Th><Th>Type</Th><Th>Status</Th><Th className="text-right">Products</Th><Th className="text-right">Order</Th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const sch = schedule(r);
              return (
                <tr key={r.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <div className="relative size-10 shrink-0 overflow-hidden rounded bg-bone">{r.image_url && <CatalogImage src={r.image_url} alt="" fill sizes="40px" className="object-cover" />}</div>
                      <div>
                        <Link href={`/admin/collections/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone">
                          /collections/{r.slug}
                          {r.is_featured && <span className="inline-flex items-center gap-0.5 text-amber-700"><StarIcon size={11} filled /> Featured</span>}
                          {r.is_seasonal && <span>· {r.season || "Seasonal"}</span>}
                          {r.is_sample && <Badge tone="violet">Sample</Badge>}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.kind === "manual" ? "Hand-picked" : "Automated"}</Td>
                  <Td>
                    <span className="inline-flex flex-wrap gap-1">
                      {r.is_published ? <Badge tone="green">Published</Badge> : <Badge>Hidden</Badge>}
                      {sch && <Badge tone={sch.tone}>{sch.label}</Badge>}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{r.live_count}<span className="text-xs text-stone"> live{r.product_count !== r.live_count ? ` of ${r.product_count}` : ""}</span></Td>
                  <Td className="text-right text-stone tabular-nums">{r.sort_order}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
