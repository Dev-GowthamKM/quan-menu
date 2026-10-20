"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateReviews } from "@/server/admin/sales";
import { formatDate } from "@/lib/format";
import { Badge, Button } from "../../ui/controls";
import { StarIcon } from "../../ui/icons";
import { useToast } from "../Toaster";

export interface ReviewRow {
  id: string;
  rating: number;
  title: string;
  body: string;
  author_name: string;
  is_verified_purchase: boolean;
  status: "pending" | "published" | "rejected";
  created_at: string;
  product: { id: string; title: string; slug: string } | null;
}

export default function ReviewsTable({ rows, status }: { rows: ReviewRow[]; status: ReviewRow["status"] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const act = (ids: string[], action: Parameters<typeof moderateReviews>[1]) =>
    start(async () => {
      if (action === "delete" && !window.confirm(`Delete ${ids.length} review${ids.length === 1 ? "" : "s"} permanently?`)) return;
      const res = await moderateReviews(ids, action);
      if (!res.ok) return toast(res.error, "error");
      toast(res.message ?? "Done.");
      setSelected(new Set());
      router.refresh();
    });

  if (!rows.length) return <p className="rounded-lg border border-dashed border-black/15 bg-white px-6 py-14 text-center text-sm text-taupe">No reviews here.</p>;
  const ids = [...selected];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="inline-flex items-center gap-2"><input type="checkbox" className="size-4 accent-ink" checked={selected.size === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Select all</label>
        {ids.length > 0 && (
          <>
            {status !== "published" && <Button size="sm" busy={pending} onClick={() => act(ids, "published")}>Publish {ids.length}</Button>}
            {status !== "rejected" && <Button size="sm" variant="secondary" busy={pending} onClick={() => act(ids, "rejected")}>Reject</Button>}
            <Button size="sm" variant="ghost" busy={pending} onClick={() => act(ids, "delete")}>Delete</Button>
          </>
        )}
      </div>
      <ul className="grid gap-3">
        {rows.map((r) => (
          <li key={r.id} className="flex gap-3 rounded-lg border border-black/10 bg-white p-4">
            <input type="checkbox" aria-label={`Select review by ${r.author_name}`} className="mt-1 size-4 accent-ink" checked={selected.has(r.id)} onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSelected(s); }} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex text-amber-600" role="img" aria-label={`${r.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, i) => <StarIcon key={i} size={14} filled={i < r.rating} />)}</span>
                <span className="font-medium">{r.title}</span>
                {r.is_verified_purchase && <Badge tone="green">Verified purchase</Badge>}
              </div>
              <p className="mt-1 text-sm whitespace-pre-line">{r.body}</p>
              <p className="mt-2 text-xs text-stone">
                {r.author_name || "Customer"} on {r.product ? <Link href={`/admin/products/${r.product.id}`} className="underline">{r.product.title}</Link> : "a deleted product"} · {formatDate(r.created_at)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              {status !== "published" && <Button size="sm" busy={pending} onClick={() => act([r.id], "published")}>Publish</Button>}
              {status !== "rejected" && <Button size="sm" variant="ghost" busy={pending} onClick={() => act([r.id], "rejected")}>Reject</Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
