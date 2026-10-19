import type { Metadata } from "next";
import CouponsManager, { type CouponRow } from "@/components/admin/sales/CouponsManager";
import { PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/controls";
import { categoryOptions } from "@/lib/admin-data";
import { requireRole, roleAtLeast } from "@/lib/auth";

export const metadata: Metadata = { title: "Discounts" };

export default async function DiscountsPage() {
  const { supabase, role } = await requireRole("staff");
  const [{ data, error }, categories, allCollections] = await Promise.all([
    supabase.from("coupons").select("*, redemptions:coupon_redemptions(count)").order("created_at", { ascending: false }),
    categoryOptions(supabase),
    supabase.from("collections").select("id, title").order("title"),
  ]);
  const rows: CouponRow[] = (data ?? []).map(({ redemptions, ...c }) => ({
    ...c,
    applies_to: c.applies_to as CouponRow["applies_to"],
    used: (redemptions as unknown as { count: number }[])[0]?.count ?? 0,
  }));
  return (
    <>
      <PageHeader title="Discounts" description="Codes customers enter at checkout. The discount is worked out on the server, so a code can't be stretched beyond its rules." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <CouponsManager
        rows={rows}
        canEdit={roleAtLeast(role, "admin")}
        categories={categories.map((c) => ({ id: c.id, label: c.path }))}
        collections={(allCollections.data ?? []).map((c) => ({ id: c.id, label: c.title }))}
      />
    </>
  );
}
