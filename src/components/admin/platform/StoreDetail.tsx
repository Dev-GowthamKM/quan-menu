"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addStoreDomain, removeStoreDomain, updateStore } from "@/server/admin/platform";
import { Badge, Button, cx } from "../../ui/controls";
import { TextField } from "../fields";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

interface Domain {
  hostname: string;
  is_primary: boolean;
}

/** A store's name, status and web addresses, for the platform's administrators. */
export default function StoreDetail({ store, domains, vercel }: { store: { id: string; name: string; status: "active" | "suspended"; isHome: boolean }; domains: Domain[]; vercel: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [name, setName] = useState(store.name);
  const [host, setHost] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) return toast(res.error ?? "Something went wrong.", "error");
      const vercelNote = (res.data as { vercel?: string | null } | undefined)?.vercel;
      toast(vercelNote ? `${res.message} ${vercelNote}` : res.message ?? "Saved.");
      after?.();
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      <Card title="Details">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateStore(store.id, { name }));
          }}
        >
          <TextField label="Store name (in the admin)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required className="w-72" />
          <Button type="submit" size="sm" variant="secondary" disabled={pending || name.trim() === store.name}>Rename</Button>
        </form>
        <p className="mt-2 text-xs text-stone">The name customers see is set in the store&apos;s own Settings › Store details.</p>
        {!store.isHome && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4">
            <p className="flex-1 text-sm text-taupe">
              {store.status === "suspended"
                ? "The storefront is closed: visitors see a closed page and orders can't be placed. Its staff can still sign in."
                : "Suspending closes the storefront and stops new orders. Nothing is deleted, and you can open it again any time."}
            </p>
            {store.status === "suspended" ? (
              <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateStore(store.id, { status: "active" }))}>Open the store again</Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={pending}
                onClick={() => confirm(`Suspend ${store.name}? Its storefront closes until you open it again.`) && run(() => updateStore(store.id, { status: "suspended" }))}
              >
                Suspend store
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card title="Web addresses">
        <p className="mb-3 text-sm text-taupe">
          Visitors to any of these see this store. The main one is used in emails, links and search results.
          {store.isHome && " Addresses that no store claims (like this site's own Vercel address) also open the main store."}
        </p>
        {domains.length > 0 && (
          <ul className="mb-4 divide-y divide-black/5 rounded-md border border-black/10">
            {domains.map((d) => (
              <li key={d.hostname} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 truncate font-mono">{d.hostname}</span>
                {d.is_primary ? (
                  <Badge tone="green">Main</Badge>
                ) : (
                  <button type="button" className="text-xs underline" disabled={pending} onClick={() => run(() => addStoreDomain(store.id, d.hostname, true))}>Make main</button>
                )}
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  disabled={pending}
                  onClick={() => confirm(`Stop opening this store at ${d.hostname}?`) && run(() => removeStoreDomain(store.id, d.hostname))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addStoreDomain(store.id, host, domains.length === 0), () => setHost(""));
          }}
        >
          <input
            value={host}
            onChange={(e) => setHost(e.target.value.trim().toLowerCase())}
            placeholder="shop.example.com"
            aria-label="New web address"
            required
            className={cx(adminInput, "w-72 font-mono")}
          />
          <Button type="submit" size="sm" busy={pending}>Add address</Button>
        </form>
        <p className="mt-2 text-xs text-stone">
          {vercel
            ? "New addresses are added to the Vercel project for you."
            : "Also add each address in Vercel › your project › Settings › Domains."}{" "}
          For sign-in emails, add <span className="font-mono">https://address/**</span> to Supabase › Authentication › URL Configuration › Redirect URLs.
        </p>
      </Card>
    </div>
  );
}
