"use client";
import { useState } from "react";
import { cx } from "../ui/controls";
import { HeartIcon } from "../ui/icons";
import { useStore } from "./StoreProvider";

export default function WishButton({ productId, title, className, withLabel }: { productId: string; title: string; className?: string; withLabel?: boolean }) {
  const { isWished, toggleWish } = useStore();
  const [busy, setBusy] = useState(false);
  const saved = isWished(productId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from wishlist` : `Save ${title} to wishlist`}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await toggleWish(productId);
        setBusy(false);
      }}
      className={cx(
        withLabel
          ? "inline-flex h-12 items-center justify-center gap-2 border border-line px-4 text-sm hover:border-ink"
          : "grid size-9 place-items-center rounded-full bg-paper/85 text-ink shadow-sm backdrop-blur-sm transition hover:bg-paper",
        className,
      )}
    >
      <HeartIcon filled={saved} size={withLabel ? 18 : 19} className={saved ? "text-sale" : undefined} />
      {withLabel && <span>{saved ? "Saved" : "Save"}</span>}
    </button>
  );
}
