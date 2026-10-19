import Link from "next/link";
import type { Department } from "@/lib/catalog";
import type { Settings } from "@/lib/settings";
import CatalogImage from "../ui/CatalogImage";
import { ChevronDown } from "../ui/icons";
import HeaderActions from "./HeaderActions";
import MobileMenu from "./MobileMenu";

export function Logo({ settings, className }: { settings: Settings; className?: string }) {
  return (
    <Link href="/" className={className} aria-label={`${settings.store_name} home`}>
      {settings.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={settings.logo_url} alt={settings.store_name} className="h-8 w-auto" />
      ) : (
        <span className="font-serif text-[1.65rem] leading-none tracking-[0.32em] uppercase">{settings.store_name}</span>
      )}
    </Link>
  );
}

export default function Header({ settings, departments, announcement }: { settings: Settings; departments: Department[]; announcement?: string }) {
  return (
    <>
      {announcement && (
        <div className="bg-ink px-4 py-2 text-center text-[11px] tracking-[0.16em] text-ivory uppercase">{announcement}</div>
      )}
      <header className="sticky top-0 z-40 border-b border-line bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
        <div className="container-page grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 lg:h-20">
          <div className="flex items-center gap-1 lg:hidden">
            <MobileMenu departments={departments} storeName={settings.store_name} />
          </div>
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-7 text-[13px] tracking-wide">
              <li>
                <Link href="/shop?sort=newest" className="py-7 hover:text-accent">New In</Link>
              </li>
              {departments.map((d) => (
                <li key={d.id} className="group static">
                  <Link
                    href={`/category/${d.slug}`}
                    className="inline-flex items-center gap-1 py-7 hover:text-accent"
                    aria-haspopup={d.children.length > 0 ? "true" : undefined}
                  >
                    {d.name}
                    {d.children.length > 0 && <ChevronDown size={12} className="opacity-50" />}
                  </Link>
                  {d.children.length > 0 && (
                    <div className="invisible absolute inset-x-0 top-full border-y border-line bg-ivory opacity-0 shadow-sm transition duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                      <div className="container-page grid grid-cols-[1fr_1fr_18rem] gap-10 py-10">
                        <div>
                          <p className="label-caps text-stone">Shop {d.name}</p>
                          <ul className="mt-4 grid gap-2.5 font-serif text-xl">
                            <li><Link href={`/category/${d.slug}`} className="hover:text-accent">All {d.name}</Link></li>
                            {d.children.map((c) => (
                              <li key={c.id}><Link href={`/category/${c.slug}`} className="hover:text-accent">{c.name}</Link></li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="label-caps text-stone">Discover</p>
                          <ul className="mt-4 grid gap-2.5 text-sm">
                            <li><Link href={`/shop?category=${d.slug}&sort=newest`} className="hover:text-accent">New arrivals</Link></li>
                            <li><Link href={`/shop?category=${d.slug}&sort=popular`} className="hover:text-accent">Best sellers</Link></li>
                            <li><Link href={`/shop?category=${d.slug}&sale=1`} className="hover:text-accent">On sale</Link></li>
                            <li><Link href="/brands" className="hover:text-accent">All brands</Link></li>
                          </ul>
                        </div>
                        {d.image_url && (
                          <Link href={`/category/${d.slug}`} className="group/tile relative block aspect-[4/5] overflow-hidden bg-bone">
                            <CatalogImage src={d.image_url} alt={d.name} fill sizes="18rem" className="object-cover transition duration-700 group-hover/tile:scale-105" />
                            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent p-4 font-serif text-2xl text-white">{d.name}</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              <li><Link href="/brands" className="py-7 hover:text-accent">Brands</Link></li>
              <li><Link href="/collections" className="py-7 hover:text-accent">Collections</Link></li>
              <li><Link href="/shop?sale=1" className="py-7 text-sale hover:opacity-80">Sale</Link></li>
            </ul>
          </nav>
          <Logo settings={settings} className="justify-self-center" />
          <HeaderActions />
        </div>
      </header>
    </>
  );
}
