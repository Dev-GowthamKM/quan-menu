"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "../Toaster";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** Runs an action, shows the outcome and refreshes the page data. */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error, "error");
      toast(res.message ?? "Done.");
      after?.();
      router.refresh();
    });
  return { pending, run };
}
