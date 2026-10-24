import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { requestStore } from "@/lib/store";

export const metadata: Metadata = { title: "Back soon", robots: { index: false } };

/** Shown instead of the storefront while it's in maintenance mode, or while the platform has suspended the store. */
export default async function Maintenance() {
  const [s, store] = await Promise.all([getSettings(), requestStore()]);
  const suspended = store.status === "suspended";
  const email = (s.contact as { email?: string } | null)?.email;
  return (
    <main className="grid min-h-dvh place-items-center bg-ivory px-6 text-center">
      <div className="max-w-lg">
        <p className="font-serif text-3xl tracking-[0.3em] uppercase">{s.store_name}</p>
        <h1 className="mt-10 font-serif text-5xl">{suspended ? "Closed for now" : "Back soon"}</h1>
        <p className="mt-5 leading-relaxed text-taupe">
          {suspended ? "This store isn't open at the moment." : s.maintenance_message || "We are updating the store. Please check back soon."}
        </p>
        {email && (
          <p className="mt-8 text-sm text-stone">
            Questions about an order? Write to <a className="underline" href={`mailto:${email}`}>{email}</a>
          </p>
        )}
      </div>
    </main>
  );
}
