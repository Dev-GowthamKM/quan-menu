import Link from "next/link";
import { ProductGrid } from "@/components/store/sections";
import { productCardsByIds } from "@/lib/catalog";
import { supabaseServer } from "@/lib/supabase/server";

export default async function WishlistPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("wishlist_items").select("product_id, created_at").order("created_at", { ascending: false });
  const products = await productCardsByIds((data ?? []).map((r) => r.product_id));
  return (
    <div>
      <h2 className="font-serif text-2xl">Wishlist</h2>
      {products.length ? (
        <div className="mt-6"><ProductGrid products={products} /></div>
      ) : (
        <p className="mt-4 text-taupe">Nothing saved yet. Tap the heart on any product to keep it here. <Link href="/shop" className="underline">Browse the store</Link>.</p>
      )}
    </div>
  );
}
