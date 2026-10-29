"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { signOut } from "@/server/auth";
import { switchStore } from "@/server/admin/platform";
import type { AppRole } from "@/lib/types";
import { cx } from "../ui/controls";
import {
  BoxIcon, CardIcon, ChartIcon, CheckIcon, ClipboardIcon, CloseIcon, HistoryIcon, HomeIcon, ImageIcon, LayersIcon, MailIcon, MenuIcon,
  PercentIcon, ReturnIcon, RulerIcon, SettingsIcon, StarIcon, TagIcon, TruckIcon, UsersIcon, ExternalIcon, ShieldIcon,
} from "../ui/icons";
import { useToast } from "./Toaster";

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number }>; count?: keyof Counts; min?: AppRole };
type Counts = { orders: number; returns: number; messages: number; reviews: number };

const GROUPS: { title: string; items: Item[] }[] = [
  { title: "Overview", items: [{ href: "/admin", label: "Dashboard", icon: ChartIcon }] },
  {
    title: "Catalog",
    items: [
      { href: "/admin/products", label: "Products", icon: TagIcon },
      { href: "/admin/inventory", label: "Inventory", icon: BoxIcon },
      { href: "/admin/brands", label: "Brands", icon: StarIcon },
      { href: "/admin/categories", label: "Categories", icon: LayersIcon },
      { href: "/admin/collections", label: "Collections", icon: ClipboardIcon },
      { href: "/admin/size-guides", label: "Size guides", icon: RulerIcon },
      { href: "/admin/media", label: "Media library", icon: ImageIcon },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/admin/orders", label: "Orders", icon: HomeIcon, count: "orders" },
      { href: "/admin/returns", label: "Returns", icon: ReturnIcon, count: "returns" },
      { href: "/admin/payments", label: "Payments", icon: CardIcon, min: "admin" },
      { href: "/admin/discounts", label: "Discounts", icon: PercentIcon },
      { href: "/admin/customers", label: "Customers", icon: UsersIcon },
      { href: "/admin/reviews", label: "Reviews", icon: StarIcon, count: "reviews" },
      { href: "/admin/messages", label: "Messages", icon: MailIcon, count: "messages" },
    ],
  },
  {
    title: "Store",
    items: [
      { href: "/admin/setup", label: "Setup", icon: CheckIcon, min: "admin" },
      { href: "/admin/shipping", label: "Shipping", icon: TruckIcon },
      { href: "/admin/settings", label: "Settings", icon: SettingsIcon, min: "admin" },
      { href: "/admin/staff", label: "Staff & roles", icon: ShieldIcon, min: "admin" },
      { href: "/admin/audit", label: "Audit log", icon: HistoryIcon, min: "admin" },
    ],
  },
];

const RANK: Record<AppRole, number> = { staff: 1, admin: 2, owner: 3 };

interface StoreChoice {
  id: string;
  name: string;
}

/** Which store the panel is working on; people who work at several stores switch here. */
function StorePicker({ store, stores }: { store: { id: string | null; name: string }; stores: StoreChoice[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (stores.length < 2 || !store.id) {
    return <p className="truncate px-3 text-sm font-semibold tracking-[0.18em] uppercase" title={store.name}>{store.name || "Store admin"}</p>;
  }
  return (
    <label className="grid gap-1 px-3">
      <span className="text-[11px] font-medium tracking-wider text-stone uppercase">Store</span>
      <select
        value={store.id}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            const res = await switchStore(id);
            if (!res.ok) return toast(res.error, "error");
            router.push("/admin");
            router.refresh();
          });
        }}
        className="h-9 rounded-md border border-black/15 bg-white px-2 text-sm font-medium"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </label>
  );
}

export default function AdminSidebar({
  email,
  role,
  counts,
  store,
  stores,
  platform,
}: {
  email: string;
  role: AppRole;
  counts: Counts;
  store: { id: string | null; name: string; view: string; preview: boolean; suspended: boolean };
  stores: StoreChoice[];
  /** The person runs the platform: show the Stores section. */
  platform: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const groups: { title: string; items: Item[] }[] = platform
    ? [...GROUPS, { title: "Platform", items: [{ href: "/admin/stores", label: "All stores", icon: LayersIcon }] }]
    : GROUPS;

  const nav = (
    <nav aria-label="Admin" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <div className="grid gap-1.5">
        <StorePicker store={store} stores={stores} />
        {store.suspended && <p className="px-3 text-xs text-red-700">Suspended: the storefront is closed.</p>}
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 text-[11px] font-medium tracking-wider text-stone uppercase">{g.title}</p>
          <ul className="mt-1.5 grid gap-0.5">
            {g.items
              .filter((i) => !i.min || RANK[role] >= RANK[i.min])
              .map((i) => {
                const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
                const n = i.count ? counts[i.count] : 0;
                const Icon = i.icon;
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={cx("flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm", active ? "bg-ink text-white" : "text-ink/80 hover:bg-black/5")}
                    >
                      <Icon size={16} />
                      <span className="flex-1">{i.label}</span>
                      {n > 0 && <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/20" : "bg-amber-100 text-amber-900")}>{n}</span>}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      <div className="mt-auto grid gap-2 border-t border-black/10 px-3 pt-4 text-xs">
        <a href={store.view} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-ink/80 hover:text-ink">
          {store.preview ? "Preview store" : "View store"} <ExternalIcon size={12} />
        </a>
        {store.preview && <p className="text-stone">No web address yet: customers can&apos;t visit it.</p>}
        <p className="truncate text-stone" title={email}>{email}</p>
        <p className="text-stone capitalize">Role: {role}</p>
        <form action={signOut}><button className="text-ink/80 underline hover:text-ink">Sign out</button></form>
      </div>
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-black/10 bg-white px-4 py-3 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open admin menu" className="-ml-1 p-1"><MenuIcon /></button>
        <span className="truncate px-2 text-sm font-semibold tracking-[0.2em] uppercase">{store.name || "Store admin"}</span>
        <span className="w-6" />
      </div>
      <aside className="sticky top-0 hidden h-dvh border-r border-black/10 bg-white lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <button className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="absolute top-3 right-3 p-1"><CloseIcon /></button>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
