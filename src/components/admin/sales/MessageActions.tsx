"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setMessageStatus } from "@/server/admin/sales";
import { Button } from "../../ui/controls";
import { useToast } from "../Toaster";

export default function MessageActions({ id, email, subject, status }: { id: string; email: string; subject: string; status: "new" | "open" | "closed" }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const set = (s: "new" | "open" | "closed") =>
    start(async () => {
      const res = await setMessageStatus(id, s);
      if (!res.ok) return toast(res.error, "error");
      router.refresh();
    });
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <a
        href={`mailto:${email}?subject=${encodeURIComponent(`Re: ${subject || "your message"}`)}`}
        onClick={() => status === "new" && set("open")}
        className="inline-flex h-8 items-center rounded-md bg-ink px-3 text-xs text-white"
      >
        Reply by email
      </a>
      {status !== "closed" ? (
        <Button size="sm" variant="ghost" busy={pending} onClick={() => set("closed")}>Mark done</Button>
      ) : (
        <Button size="sm" variant="ghost" busy={pending} onClick={() => set("open")}>Reopen</Button>
      )}
    </div>
  );
}
