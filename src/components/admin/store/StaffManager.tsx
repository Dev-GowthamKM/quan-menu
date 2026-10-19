"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { grantStaffRole, revokeStaffRole } from "@/server/admin/store";
import { formatDate } from "@/lib/format";
import type { AppRole } from "@/lib/types";
import { Badge, Button, cx } from "../../ui/controls";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

interface Member { user_id: string; email: string; full_name: string; role: AppRole; created_at: string }

export default function StaffManager({ staff, canManage, currentUserId }: { staff: Member[]; canManage: boolean; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<{ email: string; role: AppRole }>({ email: "", role: "staff" });
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? "Failed.", "error");
      toast(res.message ?? "Saved.");
      after?.();
      router.refresh();
    });

  return (
    <div className="grid content-start gap-5">
      {canManage && (
        <Card title="Add someone">
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run(() => grantStaffRole(form.email, form.role), () => setForm({ email: "", role: "staff" })); }}>
            <label className="grid flex-1 gap-1 text-xs font-medium text-taupe">Email of an existing account<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={cx(adminInput, "min-w-56")} placeholder="name@example.com" /></label>
            <label className="grid gap-1 text-xs font-medium text-taupe">Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })} className={adminInput}><option value="staff">Staff</option><option value="admin">Admin</option><option value="owner">Owner</option></select></label>
            <Button type="submit" size="sm" busy={pending}>Give access</Button>
          </form>
          <p className="mt-2 text-xs text-stone">They need to sign up on the store first (with a verified email). Then they sign in at /admin.</p>
        </Card>
      )}
      <Card title={`Team (${staff.length})`} padded={false}>
        <ul>
          {staff.map((m) => (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 border-b border-black/5 px-4 py-3 text-sm last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{m.full_name || m.email}{m.user_id === currentUserId && <span className="ml-2 text-xs font-normal text-stone">(you)</span>}</p>
                <p className="text-xs text-stone">{m.email} · since {formatDate(m.created_at)}</p>
              </div>
              <Badge tone={m.role === "owner" ? "violet" : m.role === "admin" ? "blue" : "neutral"}>{m.role}</Badge>
              {canManage && m.user_id !== currentUserId && (
                <>
                  <select aria-label={`Role for ${m.email}`} value={m.role} disabled={pending} onChange={(e) => run(() => grantStaffRole(m.email, e.target.value as AppRole))} className={cx(adminInput, "h-8 text-xs")}>
                    <option value="staff">Staff</option><option value="admin">Admin</option><option value="owner">Owner</option>
                  </select>
                  <button type="button" disabled={pending} onClick={() => window.confirm(`Remove ${m.email}'s admin access?`) && run(() => revokeStaffRole(m.user_id))} className="text-xs text-red-700 underline">Remove</button>
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
