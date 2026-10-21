import type { Metadata } from "next";
import UnsubscribeForm from "@/components/store/UnsubscribeForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ e?: string; s?: string }> }) {
  const { e = "", s = "" } = await searchParams;
  return (
    <div className="container-page max-w-xl py-16">
      <h1 className="font-serif text-4xl">Email reminders</h1>
      <p className="mt-3 text-taupe">
        Stop emails about bags left behind and price drops on your wishlist{e ? <> for <span className="text-ink">{e}</span></> : null}. Order
        emails (confirmations, shipping and refunds) still arrive.
      </p>
      <UnsubscribeForm email={e} signature={s} />
    </div>
  );
}
