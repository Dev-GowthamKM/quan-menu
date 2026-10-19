import Link from "next/link";
import type { Metadata } from "next";
import MediaLibrary, { type MediaFile } from "@/components/admin/catalog/MediaLibrary";
import { adminInput, PageHeader, Pager, pageOf, sp, withParams } from "@/components/admin/ui";
import { cx, Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Media library" };

const PAGE_SIZE = 60;
type Params = Record<string, string | string[] | undefined>;

export default async function MediaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const q = sp(params, "q");
  const filter = ["used", "unused"].includes(sp(params, "filter")) ? sp(params, "filter") : "all";
  const { data, error } = await supabase.rpc("admin_media_list", { p_q: q, p_filter: filter, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  const result = data as unknown as { total: number; unused: number; rows: MediaFile[] } | null;

  return (
    <>
      <PageHeader title="Media library" description="Images uploaded to the store. Files in use by products, brands, categories, collections or settings can't be deleted." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Filter files" className="flex gap-1 rounded-md bg-black/[0.05] p-1 text-sm">
          {[
            ["all", "All"],
            ["used", "In use"],
            ["unused", `Unused${result?.unused ? ` (${result.unused})` : ""}`],
          ].map(([k, label]) => (
            <Link key={k} href={withParams("/admin/media", params, { filter: k === "all" ? null : k, page: null })} aria-current={filter === k ? "page" : undefined} className={cx("rounded px-3 py-1", filter === k ? "bg-white shadow-sm" : "text-taupe hover:text-ink")}>
              {label}
            </Link>
          ))}
        </nav>
        <form action="/admin/media" className="ml-auto flex gap-2">
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <input name="q" defaultValue={q} placeholder="Search file names" aria-label="Search file names" className={cx(adminInput, "w-56")} />
          <button className="h-9 rounded-md bg-ink px-3 text-sm text-white">Search</button>
        </form>
      </div>
      <MediaLibrary files={result?.rows ?? []} />
      <Pager page={page} pageSize={PAGE_SIZE} total={result?.total ?? 0} href={(p) => withParams("/admin/media", params, { page: p })} />
    </>
  );
}
