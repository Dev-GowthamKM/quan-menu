import Link from "next/link";
import type { Metadata } from "next";
import OpenStoreButton from "@/components/admin/platform/OpenStoreButton";
import PlatformAdmins from "@/components/admin/platform/PlatformAdmins";
import { PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { Badge, buttonClass, Notice } from "@/components/ui/controls";
import { PlusIcon } from "@/components/ui/icons";
import { requirePlatformPage } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { storeOrigin } from "@/lib/store";
import { sessionClient } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "All stores" };

interface Domain {
  hostname: string;
  is_primary: boolean;
}

/** The platform: every store it runs, and the people who run it. */
export default async function StoresPage() {
  const { user } = await requirePlatformPage();
  const sb = await sessionClient(null);
  const [{ data: stores, error }, { data: admins }] = await Promise.all([sb.rpc("platform_stores"), sb.rpc("platform_admin_list")]);
  return (
    <>
      <PageHeader
        title="All stores"
        description="Every shop this platform runs. Each has its own products, customers, orders, settings, staff and web address."
        actions={<Link href="/admin/stores/new" className={buttonClass("primary", "sm")}><PlusIcon size={14} /> New store</Link>}
      />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <Table className="mb-8">
        <thead>
          <tr><Th>Store</Th><Th>Web address</Th><Th>Owners</Th><Th className="text-right">Products</Th><Th className="text-right">Orders</Th><Th><span className="sr-only">Actions</span></Th></tr>
        </thead>
        <tbody>
          {(stores ?? []).map((s) => {
            const domains = (s.domains ?? []) as unknown as Domain[];
            const owners = (s.owners ?? []) as unknown as string[];
            const host = domains[0]?.hostname ?? null;
            return (
              <tr key={s.id}>
                <Td>
                  <Link href={`/admin/stores/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {s.is_home && <Badge tone="neutral">Main store</Badge>}
                    {s.status === "suspended" && <Badge tone="red">Suspended</Badge>}
                  </span>
                  <span className="block text-xs text-stone">{s.slug} · since {formatDate(s.created_at)}</span>
                </Td>
                <Td className="text-sm">
                  {host ? (
                    <a href={`${storeOrigin({ host })}/`} target="_blank" rel="noreferrer" className="hover:underline">{host}</a>
                  ) : s.is_home ? (
                    <span className="text-taupe">This site&apos;s address</span>
                  ) : (
                    <span className="text-amber-700">None yet</span>
                  )}
                  {domains.length > 1 && <span className="block text-xs text-stone">+{domains.length - 1} more</span>}
                </Td>
                <Td className="max-w-44 truncate text-xs text-taupe" title={owners.join(", ")}>{owners.join(", ") || "—"}</Td>
                <Td className="text-right tabular-nums">{s.products}</Td>
                <Td className="text-right tabular-nums">{s.orders}</Td>
                <Td className="text-right whitespace-nowrap">
                  <OpenStoreButton storeId={s.id} />
                  <Link href={`/admin/stores/${s.id}`} className="ml-3 text-sm underline">Details</Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <PlatformAdmins admins={admins ?? []} currentUserId={user.id} />
    </>
  );
}
