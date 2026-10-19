"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { reconcilePayments } from "@/server/admin/orders";
import { Button } from "../../ui/controls";
import { useToast } from "../Toaster";

/** Checks open Razorpay payments for any the webhooks missed (also runs every 5 minutes). */
export default function ReconcileButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      busy={pending}
      disabled={disabled}
      onClick={() =>
        start(async () => {
          const res = await reconcilePayments();
          toast(res.ok ? res.message ?? "Done." : res.error, res.ok ? "ok" : "error");
          router.refresh();
        })
      }
    >
      Check for missed payments
    </Button>
  );
}
