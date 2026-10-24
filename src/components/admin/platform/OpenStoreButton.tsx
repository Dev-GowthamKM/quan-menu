"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchStore } from "@/server/admin/platform";
import { useToast } from "../Toaster";

/** Switches the admin panel to a store and opens its dashboard. */
export default function OpenStoreButton({ storeId, label = "Open admin", className = "text-sm underline" }: { storeId: string; label?: string; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() =>
        start(async () => {
          const res = await switchStore(storeId);
          if (!res.ok) return toast(res.error, "error");
          router.push("/admin");
          router.refresh();
        })
      }
    >
      {pending ? "Opening…" : label}
    </button>
  );
}
