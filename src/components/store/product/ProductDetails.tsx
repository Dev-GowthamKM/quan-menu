import Link from "next/link";
import type { StoreKind } from "@/lib/store-types";
import type { ProductPage } from "@/lib/types";
import { ChevronDown } from "../../ui/icons";
import Paragraphs from "../Paragraphs";

function Item({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-b border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between py-5 [&::-webkit-details-marker]:hidden">
        <span className="label-caps">{title}</span>
        <ChevronDown size={16} className="transition group-open:rotate-180" />
      </summary>
      <div className="pb-6 text-sm leading-relaxed text-taupe">{children}</div>
    </details>
  );
}

/** The product's description and details, under the names its kind of store gives them (fabric and fit, ingredients and nutrition...). */
export default function ProductDetails({ product, shippingNote, kind }: { product: ProductPage; shippingNote: string; kind: StoreKind }) {
  const d = kind.details;
  return (
    <div className="border-t border-line">
      <Item title="Description" open>
        <Paragraphs text={product.description} />
      </Item>
      {(product.fabric || product.care) && (
        <Item title={d.materialTitle}>
          {product.fabric && <p><span className="text-ink">{d.material}:</span> {product.fabric}</p>}
          {product.care && <p className="mt-2"><span className="text-ink">{d.care}:</span> {product.care}</p>}
        </Item>
      )}
      {product.fit && (
        <Item title={d.fitTitle}>
          <p>{product.fit}</p>
        </Item>
      )}
      <Item title="Shipping & returns">
        <Paragraphs text={shippingNote} />
        <p className="mt-3">
          {product.is_returnable
            ? `Returns are accepted within ${product.return_window_days ?? 15} days of delivery for ${kind.returnCondition}.`
            : "This item cannot be returned."}{" "}
          <Link href="/pages/returns" className="underline underline-offset-4">Returns policy</Link>
        </p>
      </Item>
    </div>
  );
}
