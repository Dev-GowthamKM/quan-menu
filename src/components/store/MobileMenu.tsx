"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Department } from "@/lib/catalog";
import { Dialog } from "../ui/Dialog";
import { ChevronDown, MenuIcon } from "../ui/icons";
import { useStore } from "./StoreProvider";

export default function MobileMenu({ departments, storeName }: { departments: Department[]; storeName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { session } = useStore();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="-ml-2 grid size-10 place-items-center" aria-label="Open menu" aria-expanded={open}>
        <MenuIcon />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} side="left" size="sm" title={<span className="tracking-[0.25em] uppercase">{storeName}</span>}>
        <nav aria-label="Mobile" className="grid gap-1 px-5 py-4">
          <Link href="/shop?sort=newest" className="py-3 font-serif text-2xl">New In</Link>
          {departments.map((d) => (
            <details key={d.id} className="group border-t border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3 font-serif text-2xl [&::-webkit-details-marker]:hidden">
                {d.name}
                <ChevronDown size={18} className="transition group-open:rotate-180" />
              </summary>
              <ul className="grid gap-2.5 pb-4 pl-1 text-sm">
                <li><Link href={`/category/${d.slug}`} className="underline underline-offset-4">Shop all {d.name}</Link></li>
                {d.children.map((c) => (
                  <li key={c.id}><Link href={`/category/${c.slug}`}>{c.name}</Link></li>
                ))}
              </ul>
            </details>
          ))}
          <Link href="/brands" className="border-t border-line py-3 font-serif text-2xl">Brands</Link>
          <Link href="/collections" className="border-t border-line py-3 font-serif text-2xl">Collections</Link>
          <Link href="/shop?sale=1" className="border-t border-line py-3 font-serif text-2xl text-sale">Sale</Link>
          <div className="mt-4 grid gap-3 border-t border-line pt-5 text-sm">
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
