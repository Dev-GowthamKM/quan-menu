import { AdminStoreProvider } from "@/components/admin/AdminStore";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { Toaster } from "@/components/admin/Toaster";
import { requireStaffPage } from "@/lib/auth";
import { adminStore, isPlatformAdmin, myStores, storeOrigin } from "@/lib/store";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, role } = await requireStaffPage();
  const sb = await supabaseServer();
  const head = { count: "exact" as const, head: true };
  const [toFulfil, openReturns, newMessages, pendingReviews, store, stores, platform] = await Promise.all([
    sb.from("orders").select("id", head).eq("status", "confirmed").in("fulfillment_status", ["unfulfilled", "processing", "packed"]),
    sb.from("return_requests").select("id", head).in("status", ["requested", "approved"]),
    sb.from("contact_messages").select("id", head).eq("status", "new"),
    sb.from("product_reviews").select("id", head).eq("status", "pending"),
    adminStore(),
    myStores(),
    isPlatformAdmin(),
  ]);
  const origin = store.host || store.isHome ? storeOrigin(store) : null;
  return (
    <AdminStoreProvider value={{ id: store.id, name: store.name, isHome: store.isHome, origin }}>
      <Toaster>
        <div className="lg:grid lg:min-h-dvh lg:grid-cols-[15rem_1fr]">
          <AdminSidebar
            email={user.email ?? ""}
            role={role}
            counts={{ orders: toFulfil.count ?? 0, returns: openReturns.count ?? 0, messages: newMessages.count ?? 0, reviews: pendingReviews.count ?? 0 }}
            store={{ id: store.id, name: store.name, origin, suspended: store.status === "suspended" }}
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            platform={platform}
          />
          <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </Toaster>
    </AdminStoreProvider>
  );
}
