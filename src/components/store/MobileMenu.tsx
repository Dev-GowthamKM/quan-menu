"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Department } from "@/lib/catalog";
import { Dialog } from "../ui/Dialog";
import { cx } from "../ui/controls";
import { ChevronDown, MenuIcon } from "../ui/icons";
import { useStore } from "./StoreProvider";

/**
 * The menu behind the menu button: a drawer on phones, or (variant "full") a full-screen
 * menu on every screen, for headers that show no links of their own.
 */
export default function MobileMenu({ departments, storeName, variant = "drawer" }: { departments: Department[]; storeName: string; variant?: "drawer" | "full" }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { session } = useStore();
  const full = variant === "full";

  useEffect(() => setOpen(false), [pathname]);

  const big = cx("font-serif", full ? "py-2 text-4xl md:text-6xl" : "py-3 text-2xl");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={full ? "-ml-1 inline-flex h-10 items-center gap-2.5 text-[11px] tracking-[0.3em] uppercase" : "-ml-2 grid size-10 place-items-center"}
        aria-label="Open menu"
        aria-expanded={open}
      >
        <MenuIcon />
        {full && <span aria-hidden className="hidden sm:inline">Menu</span>}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} side="left" size={full ? "full" : "sm"} title={<span className="tracking-[0.25em] uppercase">{storeName}</span>}>
        <nav aria-label={full ? "Main" : "Mobile"} className={full ? "container-page grid gap-12 py-8 md:grid-cols-[2fr_1fr] md:py-14" : "grid gap-1 px-5 py-4"}>
          <div className="grid content-start gap-1">
            <Link href="/shop?sort=newest" className={big}>New In</Link>
            {departments.map((d) => (
              <details key={d.id} className="group border-t border-line">
                <summary className={cx("flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden", big)}>
                  {d.name}
                  <ChevronDown size={full ? 28 : 18} className="transition group-open:rotate-180" />
                </summary>
                <ul className={cx("grid gap-2.5 pb-4 pl-1", full ? "text-base md:grid-cols-3" : "text-sm")}>
                  <li><Link href={`/category/${d.slug}`} className="underline underline-offset-4">Shop all {d.name}</Link></li>
                  {d.children.map((c) => (
                    <li key={c.id}><Link href={`/category/${c.slug}`}>{c.name}</Link></li>
                  ))}
                </ul>
              </details>
            ))}
            <Link href="/brands" className={cx("border-t border-line", big)}>Brands</Link>
            <Link href="/collections" className={cx("border-t border-line", big)}>Collections</Link>
            <Link href="/shop?sale=1" className={cx("border-t border-line text-sale", big)}>Sale</Link>
          </div>
          <div className={cx("grid content-start gap-3 text-sm", full ? "md:border-l md:border-line md:pl-10" : "mt-4 border-t border-line pt-5")}>
            <Link href={session?.user ? "/account" : "/login"}>{session?.user ? "My account" : "Sign in / Create account"}</Link>
            <Link href="/account/wishlist">Wishlist</Link>
            <Link href="/orders/lookup">Track an order</Link>
            <Link href="/contact">Contact us</Link>
            {session?.role && <Link href="/admin">Admin dashboard</Link>}
          </div>
        </nav>
      </Dialog>
    </>
  );
}
