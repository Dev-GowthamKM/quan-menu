import Link from "next/link";
import type { ProductCard } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";
import Price from "./Price";
import { SectionHeader } from "./SectionHeader";

// Where each look sits in the spread and how its picture is cropped. On wide screens a big
// opening look, the words beside it, then smaller looks stepping down the page, as a magazine
// lays out a story; on phones, two columns, offset.
const SPOTS = [
  { place: "col-span-2 md:col-span-6 md:col-start-1 md:row-span-2 md:row-start-1", ratio: "aspect-[4/5]", sizes: "(min-width: 768px) 46vw, 100vw" },
  { place: "md:col-span-3 md:col-start-8 md:row-start-2", ratio: "aspect-[3/4]", sizes: "(min-width: 768px) 22vw, 50vw" },
  { place: "mt-14 md:col-span-2 md:col-start-11 md:row-start-2 md:mt-28", ratio: "aspect-[2/3]", sizes: "(min-width: 768px) 15vw, 50vw" },
  { place: "md:col-span-4 md:col-start-2 md:row-start-3 md:mt-20", ratio: "aspect-[3/4]", sizes: "(min-width: 768px) 30vw, 50vw" },
  { place: "mt-14 md:col-span-4 md:col-start-7 md:row-start-3 md:mt-44", ratio: "aspect-[4/5]", sizes: "(min-width: 768px) 30vw, 50vw" },
];

/**
 * The lookbook: up to five pieces laid out as a magazine spread, each a numbered look with its
 * name and price, its second photograph showing on hover. In moving designs each photograph is
 * uncovered from below as it comes into view (data-reveal="wipe", globals.css).
 */
export default function Lookbook({ products, eyebrow, many }: { products: ProductCard[]; eyebrow: string; many: string }) {
  const looks = products.slice(0, SPOTS.length);
  if (looks.length < 3) return null;
  return (
    <section aria-label="The lookbook" className="lookbook container-page mt-20 md:mt-32">
      <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-12 md:gap-x-6 md:gap-y-0">
        <div className="col-span-2 md:col-span-5 md:col-start-8 md:row-start-1 md:self-end md:pb-12">
          <SectionHeader eyebrow={eyebrow} title="The lookbook" className="mb-5" />
          <p className="max-w-sm text-sm leading-relaxed text-taupe" data-reveal>
            A closer look at the {many} we love this season, photographed as they&apos;re meant to be lived in.
          </p>
          <Link href="/shop" className="mt-6 inline-flex items-center gap-2 border-b border-ink pb-0.5 text-[12px] tracking-[0.18em] uppercase" data-reveal>
            Shop every look <ArrowRight size={14} />
          </Link>
        </div>
        {looks.map((p, i) => (
          <Link key={p.id} href={`/products/${p.slug}`} className={cx("lookbook-look group block", SPOTS[i].place)}>
            <span className={cx("block", SPOTS[i].ratio)} data-reveal="wipe">
              <span className="relative block size-full overflow-hidden rounded-img bg-bone">
                <CatalogImage src={p.image_url} alt="" fill sizes={SPOTS[i].sizes} className="object-cover transition duration-[1.2s] ease-out group-hover:scale-[1.03]" />
                {p.hover_image_url && (
                  <CatalogImage src={p.hover_image_url} alt="" fill sizes={SPOTS[i].sizes} className="object-cover opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                )}
              </span>
            </span>
            <span className="mt-4 flex items-baseline gap-3">
              <span className="shrink-0 text-[10px] tracking-[0.28em] text-taupe uppercase tabular-nums">Look {String(i + 1).padStart(2, "0")}</span>
              <span className="h-px flex-1 translate-y-[-0.2em] bg-line" aria-hidden />
            </span>
            <span className="mt-2 block font-serif text-lg leading-snug md:text-xl">{p.title}</span>
            <Price price={p.price} compareAt={p.compare_at_price} maxPrice={p.max_price} className="mt-1 text-sm" />
          </Link>
        ))}
      </div>
    </section>
  );
}
