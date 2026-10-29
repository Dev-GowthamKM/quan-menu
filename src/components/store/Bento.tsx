import Link from "next/link";
import type { Collection, Department } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";
import type { Figure } from "./Numbers";
import { SectionHeader } from "./SectionHeader";

/** A sixteen-point starburst, as a CSS clip-path, for price stickers. */
const BURST = `polygon(${Array.from({ length: 32 }, (_, i) => {
  const angle = (i / 32) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 40 : 50;
  return `${(50 + r * Math.cos(angle)).toFixed(1)}% ${(50 + r * Math.sin(angle)).toFixed(1)}%`;
}).join(", ")})`;

type Tile =
  | { kind: "product"; product: ProductCard }
  | { kind: "department"; department: Department }
  | { kind: "collection"; collection: Collection }
  | { kind: "figure"; figure: Figure }
  | { kind: "promise"; text: string };

// The grid's seven places: a big piece, a figure, a department, a tall piece, a wide collection,
// a promise and one more piece (on phones they pack into two columns).
const PLACES = [
  "col-span-2 row-span-2",
  "",
  "",
  "row-span-2 lg:col-start-4 lg:row-start-1",
  "col-span-2",
  "",
  "",
];
const TILT = ["", "-rotate-1", "rotate-1", "", "", "rotate-1", "-rotate-1"];

// Every tile is framed alike; the ones that lead somewhere lift off the page when pointed at.
const frame = "relative block h-full overflow-hidden rounded-card border-2 border-ink";
const tile = `${frame} group transition duration-200 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0_var(--color-ink)] focus-visible:-translate-x-1 focus-visible:-translate-y-1`;

function Sticker({ price, currency, big }: { price: number; currency: string; big: boolean }) {
  const text = formatMoney(price, currency);
  // Longer prices get smaller type, so they stay inside the star.
  const size = (big ? 18 : 12) * Math.min(1, 7 / text.length);
  return (
    <span
      className={cx("absolute grid rotate-12 place-items-center bg-accent text-center font-serif leading-none whitespace-nowrap text-ivory", big ? "top-4 right-4 size-28 md:size-32" : "top-2 right-2 size-[5.5rem]")}
      style={{ clipPath: BURST, fontSize: `${size.toFixed(1)}px` }}
    >
      <span className="-rotate-12">{text}</span>
    </span>
  );
}

/**
 * The bento: a bold grid of mixed tiles, a big piece with its price on a sticker, a figure, a
 * department, a collection and a promise, each in its own colour, lifting off the page when
 * pointed at. It fills its places from whatever the store has, so it works for any catalogue.
 */
export default function Bento({
  products,
  departments,
  collections,
  figures,
  promises,
  currency,
  title,
}: {
  products: ProductCard[];
  departments: Department[];
  collections: Collection[];
  figures: Figure[];
  promises: string[];
  currency: string;
  title: string;
}) {
  const pieces = [...products];
  const piece = (): Tile | null => {
    const p = pieces.shift();
    return p ? { kind: "product", product: p } : null;
  };
  const department = departments.find((d) => d.image_url);
  const collection = collections.find((c) => c.image_url || c.banner_url);
  const tiles = [
    piece(),
    figures[0] ? { kind: "figure", figure: figures[0] } : promises[1] ? { kind: "promise", text: promises[1] } : piece(),
    department ? { kind: "department", department } : piece(),
    piece(),
    collection ? { kind: "collection", collection } : piece(),
    promises[0] ? { kind: "promise", text: promises[0] } : piece(),
    piece(),
  ] as (Tile | null)[];
  if (tiles.filter(Boolean).length < 6 || tiles[0]?.kind !== "product") return null;

  const body = (t: Tile, i: number) => {
    switch (t.kind) {
      case "product": {
        const p = t.product;
        const big = i === 0;
        return (
          <Link href={`/products/${p.slug}`} className={cx(tile, "bg-paper")}>
            <CatalogImage src={p.image_url} alt="" fill sizes={big ? "(min-width: 1024px) 44vw, 100vw" : "(min-width: 1024px) 22vw, 50vw"} className="object-cover transition duration-500 group-hover:scale-105" />
            <Sticker price={p.price} currency={currency} big={big} />
            <span className={cx("absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] rounded-btn border-2 border-ink bg-paper font-bold uppercase", big ? "px-4 py-2 text-sm md:text-base" : "px-3 py-1.5 text-[11px]")}>
              <span className="line-clamp-2">{p.title}</span>
            </span>
          </Link>
        );
      }
      case "department":
        return (
          <Link href={`/category/${t.department.slug}`} className={cx(tile, "bg-sand")}>
            <CatalogImage src={t.department.image_url} alt="" fill sizes="(min-width: 1024px) 22vw, 50vw" className="object-cover transition duration-500 group-hover:scale-105" />
            <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-btn border-2 border-ink bg-brand px-3 py-1.5 text-[11px] font-bold text-on-brand uppercase">
              {t.department.name} <ArrowRight size={14} />
            </span>
          </Link>
        );
      case "collection": {
        const c = t.collection;
        return (
          <Link href={`/collections/${c.slug}`} className={cx(tile, "bg-ink")}>
            <CatalogImage src={c.image_url || c.banner_url} alt="" fill sizes="(min-width: 1024px) 44vw, 100vw" className="object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-70" />
            <span className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent" />
            <span className="absolute inset-y-0 left-0 flex max-w-[80%] flex-col justify-end p-4 text-white md:p-6">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase">{c.season || "The edit"}</span>
              <span className="mt-1 font-serif text-2xl leading-none md:text-4xl">{c.title}</span>
              <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase">Shop the edit <ArrowRight size={14} /></span>
            </span>
          </Link>
        );
      }
      case "figure":
        return (
          <Link href="/shop" className={cx(tile, "flex flex-col justify-between bg-brand p-4 text-on-brand md:p-5")}>
            <span aria-hidden className="text-2xl leading-none">✦</span>
            <span>
              <span className="block font-serif text-[clamp(2.25rem,5vw,3.75rem)] leading-none">{t.figure.value}</span>
              <span className="mt-2 block text-xs font-bold uppercase">{t.figure.label}</span>
            </span>
          </Link>
        );
      case "promise":
        return (
          <div className={cx(frame, "flex flex-col justify-between bg-ink p-4 text-ivory md:p-5")}>
            <span aria-hidden className="grid size-10 place-items-center rounded-full bg-accent text-lg text-ivory">✓</span>
            <span className="font-serif text-xl leading-tight md:text-2xl">{t.text}</span>
          </div>
        );
    }
  };

  return (
    <section aria-label={title} className="container-page mt-20 md:mt-28">
      <SectionHeader eyebrow="This week" title={title} href="/shop" linkLabel="Shop all" />
      <div className="grid auto-rows-[10.5rem] grid-flow-dense grid-cols-2 gap-3 sm:auto-rows-[13rem] md:gap-4 lg:grid-cols-4">
        {tiles.map((t, i) =>
          t ? (
            <div key={i} className={cx("relative transition-[rotate] duration-200 hover:rotate-0", PLACES[i], TILT[i])} data-reveal>
              {body(t, i)}
            </div>
          ) : null,
        )}
      </div>
    </section>
  );
}
