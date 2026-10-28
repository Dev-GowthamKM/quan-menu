"use client";
import { useState, useTransition } from "react";
import { requestStockAlert } from "@/server/reminders";
import { Button } from "../../ui/controls";
import { useStore } from "../StoreProvider";

/** "Notify me when it's back" for the sold-out sizes (or whatever the product's first option is called) of the chosen colour. */
export default function BackInStock({ options, label = "Size", open: startOpen = false }: { options: { id: string; label: string }[]; label?: string; open?: boolean }) {
  const user = useStore().session?.user ?? null;
  const [open, setOpen] = useState(startOpen);
  const [variantId, setVariantId] = useState(options[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (!options.length) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm underline underline-offset-4">
        {label} sold out? Get an email when it&apos;s back
      </button>
    );
  }
  return (
    <form
      className="mt-4 border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await requestStockAlert(variantId, email || user?.email || "");
          setResult(res.ok ? { ok: true, text: res.message ?? "We'll let you know." } : { ok: false, text: res.error });
        });
      }}
    >
      <p className="text-sm font-medium">Notify me when it&apos;s back</p>
      {result?.ok ? (
        <p className="mt-2 text-sm text-ok" role="status">{result.text}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
            <label className="grid gap-1 text-xs text-taupe">
              {label}
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className="h-10 border border-line bg-ivory px-2 text-sm text-ink">
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-taupe">
              Email
              <input type="email" required value={email || user?.email || ""} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-10 border border-line bg-ivory px-3 text-sm text-ink" />
            </label>
            <Button type="submit" size="md" className="self-end h-10!" busy={pending}>Notify me</Button>
          </div>
          {result && <p className="mt-2 text-sm text-sale" role="alert">{result.text}</p>}
          <p className="mt-2 text-xs text-stone">One email when it&apos;s back in stock. Nothing else.</p>
        </>
      )}
    </form>
  );
}
