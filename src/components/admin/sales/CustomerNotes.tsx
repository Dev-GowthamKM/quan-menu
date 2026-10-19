"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCustomerNote, deleteCustomerNote } from "@/server/admin/orders";
import { formatDateTime } from "@/lib/format";
import { Button } from "../../ui/controls";
import { useToast } from "../Toaster";

export default function CustomerNotes({ customerId, notes }: { customerId: string; notes: { id: string; body: string; author: string; created_at: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? "Failed.", "error");
      toast(res.message ?? "Saved.");
      after?.();
      router.refresh();
    });
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) run(() => addCustomerNote(customerId, text), () => setText("")); }} className="grid gap-2">
        <label htmlFor="cust-note" className="sr-only">New note</label>
        <textarea id="cust-note" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Sizing preferences, a phone call, a special request… (only staff see these)" className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none" />
        <Button type="submit" size="sm" variant="secondary" busy={pending} disabled={!text.trim()} className="justify-self-start">Save note</Button>
      </form>
      <ul className="mt-4 grid gap-3">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md bg-amber-50/70 px-3 py-2 text-sm">
            <p className="whitespace-pre-line">{n.body}</p>
            <p className="mt-1 flex justify-between text-xs text-stone">
              <span>{n.author} · {formatDateTime(n.created_at)}</span>
              <button type="button" className="underline" onClick={() => window.confirm("Delete this note?") && run(() => deleteCustomerNote(n.id, customerId))}>Delete</button>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
