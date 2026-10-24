import type { Metadata } from "next";
import NewStoreForm from "@/components/admin/platform/NewStoreForm";
import { PageHeader } from "@/components/admin/ui";
import { requirePlatformPage } from "@/lib/auth";
import { freshLook } from "@/lib/designs";
import { takenLooks } from "@/lib/look";
import { vercelDomainsReady } from "@/lib/vercel";

export const metadata: Metadata = { title: "New store" };

export default async function NewStorePage() {
  await requirePlatformPage();
  // Worked out here, so the page and the form agree on the look before anyone shuffles.
  const taken = await takenLooks();
  return (
    <>
      <PageHeader
        title="New store"
        description="A new shop with its own products, customers, orders, settings and staff. It starts with a delivery zone for all of India and the usual couriers; its owner adds products and fine-tunes everything from its own admin."
        back={{ href: "/admin/stores", label: "All stores" }}
      />
      <NewStoreForm vercel={vercelDomainsReady()} taken={taken} initial={freshLook(taken)} />
    </>
  );
}
