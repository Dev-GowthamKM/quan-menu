import type { Review } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { StarIcon } from "../../ui/icons";
import ReviewForm from "./ReviewForm";

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="flex" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} size={size} filled={i <= Math.round(value)} />
      ))}
    </span>
  );
}

export default function Reviews({ productId, reviews, enabled }: { productId: string; reviews: Review[]; enabled: boolean }) {
  const count = reviews.length;
  const avg = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, n: reviews.filter((r) => r.rating === star).length }));

  return (
    <section id="reviews" className="container-page mt-20 scroll-mt-32 md:mt-28">
      <div className="grid gap-10 lg:grid-cols-[20rem_1fr] lg:gap-16">
        <div>
          <h2 className="font-serif text-3xl md:text-4xl">Reviews</h2>
          {count > 0 ? (
            <>
              <div className="mt-5 flex items-center gap-3">
                <span className="font-serif text-5xl">{avg.toFixed(1)}</span>
                <div>
                  <Stars value={avg} size={16} />
                  <p className="mt-1 text-sm text-taupe">{count} {count === 1 ? "review" : "reviews"}</p>
                </div>
              </div>
              <ul className="mt-6 grid gap-2">
                {dist.map((d) => (
                  <li key={d.star} className="flex items-center gap-3 text-xs text-taupe">
                    <span className="w-10">{d.star} star</span>
                    <span className="h-1 flex-1 bg-line">
                      <span className="block h-1 bg-ink" style={{ width: `${count ? (d.n / count) * 100 : 0}%` }} />
                    </span>
                    <span className="w-6 text-right tabular-nums">{d.n}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-sm text-taupe">No reviews yet.</p>
          )}
          {enabled && <ReviewForm productId={productId} />}
        </div>
        {count > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-6">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars value={r.rating} />
                  {r.title && <p className="font-medium">{r.title}</p>}
                </div>
                {r.body && <p className="mt-3 text-sm leading-relaxed text-taupe">{r.body}</p>}
                <p className="mt-3 text-xs text-stone">
                  {r.author_name} · {formatDate(r.created_at)}
                  {r.is_verified_purchase && <span className="ml-2 text-ok">Verified purchase</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
