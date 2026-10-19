import { discountPercent, formatMoney } from "@/lib/money";
import { cx } from "../ui/controls";

export default function Price({
  price,
  compareAt,
  maxPrice,
  currency = "INR",
  size = "sm",
  showPercent = true,
  className,
}: {
  price: number;
  compareAt?: number | null;
  maxPrice?: number | null;
  currency?: string;
  size?: "sm" | "lg";
  showPercent?: boolean;
  className?: string;
}) {
  const pct = discountPercent(price, compareAt);
  return (
    <p className={cx("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", size === "lg" ? "text-xl" : "text-sm", className)}>
      <span className={cx("tabular-nums", pct > 0 && "text-sale")}>
        {maxPrice && maxPrice > price ? `From ${formatMoney(price, currency)}` : formatMoney(price, currency)}
      </span>
      {pct > 0 && (
        <>
          <span className={cx("text-stone line-through tabular-nums", size === "lg" ? "text-base" : "text-xs")}>
            <span className="sr-only">Was </span>
            {formatMoney(compareAt!, currency)}
          </span>
          {showPercent && <span className={cx("text-sale", size === "lg" ? "text-sm" : "text-xs")}>{pct}% off</span>}
        </>
      )}
    </p>
  );
}
