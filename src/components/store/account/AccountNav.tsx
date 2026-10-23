"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/server/auth";
import { cx } from "../../ui/controls";

const LINKS = [
  { href: "/account", label: "Overview & profile" },
  { href: "/account/orders", label: "Orders & returns" },
  { href: "/account/wishlist", label: "Wishlist" },
  { href: "/account/addresses", label: "Addresses" },
];

export default function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="relative flex gap-1 overflow-x-auto border-b border-line pb-2 lg:flex-col lg:border-none lg:pb-0">
      {LINKS.map((l) => {
        const active = l.href === "/account" ? pathname === "/account" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cx("shrink-0 px-3 py-2 text-sm whitespace-nowrap", active ? "bg-brand text-on-brand" : "hover:bg-bone")}>
            {l.label}
          </Link>
        );
      })}
      <form action={signOut} className="shrink-0 lg:mt-4">
        <button type="submit" className="px-3 py-2 text-sm text-taupe underline-offset-4 hover:underline">Sign out</button>
      </form>
    </nav>
  );
}
