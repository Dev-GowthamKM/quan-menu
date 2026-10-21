import Link from "next/link";
import PriceAlertsToggle from "@/components/store/account/PriceAlertsToggle";
import { ProductGrid } from "@/components/store/sections";
import { getUser } from "@/lib/auth";
import { productCardsByIds } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { supabaseServer } from "@/lib/supabase/server";

export default async function WishlistPage() {
  const sb = await supabaseServer();
  const user = await getUser();
  const [{ data }, profile, settings] = await Promise.all([
    sb.from("wishlist_items").select("product_id, created_at").order("created_at", { ascending: false }),
    user ? sb.from("profiles").select("price_alerts").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    getSettings(),
  ]);
  const products = await productCardsByIds((data ?? []).map((r) => r.product_id));
  return (
    <div>
      <h2 className="font-serif text-2xl">Wishlist</h2>
      {settings.price_alerts_enabled && <PriceAlertsToggle initial={!!profile.data?.price_alerts} hasEmail={!!user?.email} />}
      {products.length ? (
        <div className="mt-6"><ProductGrid products={products} /></div>
      ) : (
        <p className="mt-4 text-taupe">Nothing saved yet. Tap the heart on any product to keep it here. <Link href="/shop" className="underline">Browse the store</Link>.</p>
      )}
    </div>
  );
}
