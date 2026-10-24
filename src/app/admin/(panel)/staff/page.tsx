import type { Metadata } from "next";
import StaffManager from "@/components/admin/store/StaffManager";
import { Card, PageHeader } from "@/components/admin/ui";
import { Notice } from "@/components/ui/controls";
import { requireRole, requireStaffPage, roleAtLeast } from "@/lib/auth";

export const metadata: Metadata = { title: "Staff and roles" };

export default async function StaffPage() {
  await requireStaffPage("admin");
  const { supabase, role, user } = await requireRole("admin");
  const { data, error } = await supabase.rpc("admin_staff");
  return (
    <>
      <PageHeader title="Staff and roles" description="Who works on this store in the admin. Roles are stored on the server and belong to one store; nobody can give themselves access from their own account." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <StaffManager staff={data ?? []} canManage={roleAtLeast(role, "owner")} currentUserId={user.id} />
        <Card title="What each role can do">
          <dl className="grid gap-3 text-sm">
            <div><dt className="font-medium">Owner</dt><dd className="text-taupe">Everything, including adding and removing staff. Keep at least two owners so the store is never locked out.</dd></div>
            <div><dt className="font-medium">Admin</dt><dd className="text-taupe">Everything except staff: settings, payments and refunds, discounts, shipping, exports, audit log.</dd></div>
            <div><dt className="font-medium">Staff</dt><dd className="text-taupe">Day-to-day work: products, stock, orders and fulfilment, returns (without refunds), customers, reviews and messages.</dd></div>
          </dl>
        </Card>
      </div>
    </>
  );
}
