import Link from "next/link";
import type { Metadata } from "next";
import ReviewsTable, { type ReviewRow } from "@/components/admin/sales/ReviewsTable";
import { PageHeader, Pager, pageOf, sp, withParams } from "@/components/admin/ui";
import { cx, Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Reviews" };

const PAGE_SIZE = 50;
type Params = Record<string, string | string[] | undefined>;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const status = ["pending", "published", "rejected"].includes(sp(params, "status")) ? sp(params, "status") : "pending";
  const { data, count, error } = await supabase
    .from("product_reviews")
    .select("id, rating, title, body, author_name, is_verified_purchase, status, created_at, product:products(id, title, slug)", { count: "exact" })
    .eq("status", status as "pending")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return (
    <>
      <PageHeader title="Reviews" description="Customer reviews appear on product pages once published. Settings decide whether reviews need approval first." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <nav aria-label="Review status" className="mb-4 flex gap-1 border-b border-black/10">
        {[["pending", "Waiting for approval"], ["published", "Published"], ["rejected", "Rejected"]].map(([k, label]) => (
          <Link key={k} href={k === "pending" ? "/admin/reviews" : `/admin/reviews?status=${k}`} aria-current={status === k ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", status === k ? "border-ink font-medium" : "border-transparent text-taupe hover:text-ink")}>{label}</Link>
        ))}
      </nav>
      <ReviewsTable rows={(data ?? []) as unknown as ReviewRow[]} status={status as ReviewRow["status"]} />
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/reviews", params, { page: p })} />
    </>
  );
}
