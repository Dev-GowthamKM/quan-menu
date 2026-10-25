import Link from "next/link";
import { discountPercent } from "@/lib/money";
import type { ProductCard as Card } from "@/lib/types";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import Price from "./Price";
import WishButton from "./WishButton";

const NEW_DAYS = 30;

/**
 * A product in a grid or row. The pc-* class names are hooks for the store's card style
 * (data-card on the store's root, styled in globals.css): the same markup becomes a classic,
 * minimal, outlined, soft, framed or photo-overlay card.
 */
export default function ProductCard({
  product,
  priority,
  sizes = "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 46vw",
  className,
}: {
  product: Card;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  const soldOut = product.available_stock <= 0;
  const isNew = Date.now() - new Date(product.published_at).getTime() < NEW_DAYS * 86_400_000;
  const swatches = product.swatches ?? [];
  const pct = product.on_sale ? discountPercent(product.price, product.compare_at_price) : 0;

  return (
    <article className={cx("pc group relative", className)} data-reveal>
      <div className="pc-media relative aspect-[4/5] overflow-hidden rounded-img bg-bone">
        <Link href={`/products/${product.slug}`} aria-label={product.title} className="absolute inset-0">
          <CatalogImage
            src={product.image_url}
            alt={product.image_alt || product.title}
            fill
            sizes={sizes}
            priority={priority}
            className={cx(
              "object-cover transition duration-700 ease-out group-hover:scale-[1.03]",
              product.hover_image_url && "group-hover:opacity-0",
              soldOut && "opacity-60",
            )}
          />
          {product.hover_image_url && (
            <CatalogImage
              src={product.hover_image_url}
              alt=""
              fill
              sizes={sizes}
              className="object-cover opacity-0 transition duration-700 ease-out group-hover:scale-[1.03] group-hover:opacity-100"
            />
          )}
        </Link>
        <div className="pc-badges pointer-events-none absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5">
          {soldOut ? (
            <span className="pc-badge label-caps rounded-badge bg-paper/90 px-2 py-1 text-ink">Sold out</span>
          ) : product.on_sale && product.compare_at_price ? (
            <span className="pc-badge label-caps rounded-badge bg-sale-fill px-2 py-1 text-white">
              <span className="pc-sale-word">Sale</span>
              {pct > 0 && <span className="pc-sale-pct">−{pct}%</span>}
            </span>
          ) : isNew ? (
            <span className="pc-badge label-caps rounded-badge bg-paper/90 px-2 py-1 text-ink">New</span>
          ) : null}
          {!soldOut && product.available_stock > 0 && product.available_stock <= 3 && (
            <span className="pc-badge label-caps rounded-badge bg-paper/90 px-2 py-1 text-sale">Few left</span>
          )}
        </div>
        <WishButton productId={product.id} title={product.title} className="pc-wish absolute top-1.5 right-1.5" />
      </div>
      <div className="pc-info mt-3 grid gap-1">
        {product.brand_name && <p className="pc-brand label-caps text-stone">{product.brand_name}</p>}
        <h3 className="pc-title text-sm leading-snug">
          <Link href={`/products/${product.slug}`} className="hover:underline hover:underline-offset-4">{product.title}</Link>
        </h3>
        <Price price={product.price} compareAt={product.compare_at_price} maxPrice={product.max_price} className="pc-price" />
        {swatches.length > 1 && (
          <div className="pc-swatches mt-1 flex items-center gap-1.5" role="img" aria-label={`${swatches.length} colours`}>
            {swatches.slice(0, 5).map((s) => (
              <span
                key={s.name}
                title={s.name}
                className="size-3 rounded-full ring-1 ring-black/15 ring-offset-1 ring-offset-ivory"
                style={{ background: s.hex || "#ccc" }}
              />
            ))}
            {swatches.length > 5 && <span className="text-xs text-stone">+{swatches.length - 5}</span>}
          </div>
        )}
      </div>
    </article>
  );
}
