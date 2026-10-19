import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Back soon", robots: { index: false } };

export default async function Maintenance() {
  const s = await getSettings();
  return (
    <main className="grid min-h-dvh place-items-center bg-ivory px-6 text-center">
      <div className="max-w-lg">
        <p className="font-serif text-3xl tracking-[0.3em] uppercase">{s.store_name}</p>
        <h1 className="mt-10 font-serif text-5xl">Back soon</h1>
        <p className="mt-5 leading-relaxed text-taupe">{s.maintenance_message || "We are updating the store. Please check back soon."}</p>
        {s.contact && (s.contact as { email?: string }).email && (
          <p className="mt-8 text-sm text-stone">
            Questions about an order? Write to <a className="underline" href={`mailto:${(s.contact as { email: string }).email}`}>{(s.contact as { email: string }).email}</a>
          </p>
        )}
      </div>
    </main>
  );
}
