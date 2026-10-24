"use client";
import Link from "next/link";
import { useState } from "react";
import { cx } from "../ui/controls";
import { BagIcon, HeartIcon, SearchIcon, UserIcon } from "../ui/icons";
import SearchDialog from "./SearchDialog";
import { useStore } from "./StoreProvider";

/** Search, account, wishlist and bag. searchOnWide: false when the header has its own search box. */
export default function HeaderActions({ searchOnWide = true }: { searchOnWide?: boolean }) {
  const { session, cartCount, openCart } = useStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const signedIn = !!session?.user;

  return (
    <div className="flex items-center justify-self-end gap-0.5 sm:gap-1.5">
      <button type="button" onClick={() => setSearchOpen(true)} className={cx("grid size-10 place-items-center hover:text-accent", !searchOnWide && "lg:hidden")} aria-label="Search">
        <SearchIcon />
      </button>
      <Link
        href={signedIn ? "/account" : "/login"}
        className="hidden size-10 place-items-center hover:text-accent sm:grid"
        aria-label={signedIn ? "Your account" : "Sign in"}
        title={signedIn ? session?.user?.email || session?.user?.name || "Your account" : "Sign in"}
      >
        <UserIcon />
      </Link>
      <Link href="/account/wishlist" className="hidden size-10 place-items-center hover:text-accent sm:grid" aria-label="Wishlist">
        <HeartIcon />
      </Link>
      <button type="button" onClick={openCart} className="relative grid size-10 place-items-center hover:text-accent" aria-label={`Bag, ${cartCount} items`}>
        <BagIcon />
        {cartCount > 0 && (
          <span className="absolute top-1 right-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] leading-4 text-on-brand tabular-nums">
            {cartCount}
          </span>
        )}
      </button>
      {session?.role && (
        <Link href="/admin" className="ml-2 hidden rounded-btn border border-current px-2.5 py-1 text-[11px] tracking-wider uppercase hover:border-brand hover:bg-brand hover:text-on-brand xl:inline-block">
          Admin
        </Link>
      )}
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
