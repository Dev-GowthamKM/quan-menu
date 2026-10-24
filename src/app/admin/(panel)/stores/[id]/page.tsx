import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OpenStoreButton from "@/components/admin/platform/OpenStoreButton";
import StoreDetail from "@/components/admin/platform/StoreDetail";
import { Card, PageHeader, Stat } from "@/components/admin/ui";
import { Badge, buttonClass, Notice } from "@/components/ui/controls";
import { requirePlatformPage } from "@/lib/auth";
import { storeOrigin } from "@/lib/store";
import { sessionClient } from "@/lib/supabase/session";
import { vercelDomainsReady } from "@/lib/vercel";

export const metadata: Metadata = { title: "Store" };

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requirePlatformPage();
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: s } = await (await sessionClient(null)).rpc("platform_stores").eq("id", id).maybeSingle();
  if (!s) notFound();
  const domains = (s.domains ?? []) as unknown as { hostname: string; is_primary: boolean }[];
  const owners = (s.owners ?? []) as unknown as string[];
  const host = domains[0]?.hostname ?? null;
  const vercel = vercelDomainsReady();
  return (
    <>
      <PageHeader
        title={<span className="inline-flex flex-wrap items-center gap-2">{s.name}{s.is_home && <Badge tone="neutral">Main store</Badge>}{s.status === "suspended" && <Badge tone="red">Suspended</Badge>}</span>}
        description={`${s.slug} · order numbers ${s.order_prefix}100001 onwards`}
        back={{ href: "/admin/stores", label: "All stores" }}
        actions={
          <>
            {(host || s.is_home) && <a href={`${storeOrigin({ host })}/`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm", "border-black/15! bg-white")}>Visit store</a>}
            <OpenStoreButton storeId={s.id} label="Open its admin" className={buttonClass("primary", "sm")} />
          </>
        }
      />
      {created === "1" && (
        <Notice tone="success" className="mb-5">
          <p className="font-medium">{s.name} is ready. Next:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open its admin to add products, or ask its owner to.</li>
            {host && !vercel && <li>Add <span className="font-mono">{host}</span> in Vercel › your project › Settings › Domains.</li>}
            {host && <li>Add <span className="font-mono">https://{host}/**</span> in Supabase › Authentication › URL Configuration › Redirect URLs, so sign-in emails come back to this store.</li>}
            <li>The owner saves the store&apos;s Razorpay keys in Settings › Payment accounts to take online payments (cash on delivery works straight away).</li>
          </ol>
        </Notice>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Products" value={s.products} />
        <Stat label="Orders" value={s.orders} />
        <Stat label="Web addresses" value={domains.length} />
        <Stat label="Owners" value={owners.length} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <StoreDetail
          store={{ id: s.id, name: s.name, status: s.status === "suspended" ? "suspended" : "active", isHome: s.is_home, products: Number(s.products) }}
          domains={domains}
          vercel={vercel}
        />
        <Card title="Owners">
          {owners.length ? (
            <ul className="grid gap-1 text-sm">{owners.map((o) => <li key={o} className="truncate">{o}</li>)}</ul>
          ) : (
            <p className="text-sm text-taupe">No owners yet.</p>
          )}
          <p className="mt-3 text-xs text-stone">Each store manages its own team: open its admin, then Staff &amp; roles. Platform administrators count as an owner everywhere.</p>
        </Card>
      </div>
    </>
  );
}
