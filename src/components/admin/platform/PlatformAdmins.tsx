"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { grantPlatformAdmin, revokePlatformAdmin } from "@/server/admin/platform";
import { formatDate } from "@/lib/format";
import { Button, cx } from "../../ui/controls";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

/** The people who can create stores, and who count as an owner in every store. */
export default function PlatformAdmins({ admins, currentUserId }: { admins: { user_id: string; email: string; created_at: string }[]; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? "Something went wrong.", "error");
      toast(res.message ?? "Saved.");
      after?.();
      router.refresh();
    });
  return (
    <Card title="Platform administrators">
      <p className="mb-3 text-sm text-taupe">
        They can create stores, change their web addresses and suspend them, and they act as an owner in every store. Give this only to people who run the
        whole platform; each store&apos;s own team is managed in that store&apos;s Staff &amp; roles.
      </p>
      <ul className="mb-4 divide-y divide-black/5 rounded-md border border-black/10">
        {admins.map((a) => (
          <li key={a.user_id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1 truncate">{a.email}</span>
            <span className="text-xs text-stone">since {formatDate(a.created_at)}</span>
            {a.user_id !== currentUserId && (
              <button
                type="button"
                className="text-xs text-red-700 underline"
                disabled={pending}
                onClick={() => confirm(`Remove ${a.email}'s platform access?`) && run(() => revokePlatformAdmin(a.user_id))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => grantPlatformAdmin(email), () => setEmail(""));
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Their account's email"
          aria-label="Email of the new platform administrator"
          className={cx(adminInput, "w-72")}
        />
        <Button type="submit" size="sm" busy={pending}>Add</Button>
      </form>
    </Card>
  );
}
