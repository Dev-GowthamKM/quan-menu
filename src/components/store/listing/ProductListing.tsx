import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getDepartments, getFacets, PAGE_SIZE, searchProducts, type SearchParams } from "@/lib/catalog";
import { listingQuery, type ListingParams, type RawParams } from "@/lib/listing";
import CatalogImage from "../../ui/CatalogImage";
import { ChevronLeft, ChevronRight } from "../../ui/icons";
import { ProductGrid } from "../sections";
import { ActiveFilters, FilterPanel, MobileFilters, SortSelect, type CategoryLink } from "./Filters";

export interface Crumb {
  name: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-stone">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((c, i) => (
          <li key={`${c.name}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="hover:text-ink">{c.name}</Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="text-taupe">{c.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Category tree for the filter sidebar, highlighting the current one. */
export async function categoryLinks(activeSlug: string | null | undefined, base: (slug: string) => string): Promise<CategoryLink[]> {
  const departments = await getDepartments();
  const links: CategoryLink[] = [];
  for (const d of departments) {
    links.push({ name: d.name, href: base(d.slug), active: d.slug === activeSlug, depth: 0 });
    const open = d.slug === activeSlug || d.children.some((c) => c.slug === activeSlug);
    if (open) for (const c of d.children) links.push({ name: c.name, href: base(c.slug), active: c.slug === activeSlug, depth: 1 });
  }
  return links;
}

function Pagination({ page, total, basePath, query }: { page: number; total: number; basePath: string; query: RawParams }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) if (typeof v === "string" && k !== "page") q[k] = v;
    return `${basePath}${listingQuery({ ...q, page: p > 1 ? p : null })}`;
  };
  const window = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <nav aria-label="Pagination" className="mt-16 flex items-center justify-center gap-1">
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className="grid size-10 place-items-center border border-line hover:border-ink" aria-label="Previous page">
          <ChevronLeft size={16} />
        </Link>
      )}
      {window.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 && p - window[i - 1] > 1 && <span className="px-1 text-stone">…</span>}
          <Link
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={p === page ? "grid size-10 place-items-center bg-ink text-sm text-ivory" : "grid size-10 place-items-center border border-line text-sm hover:border-ink"}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} rel="next" className="grid size-10 place-items-center border border-line hover:border-ink" aria-label="Next page">
          <ChevronRight size={16} />
        </Link>
      )}
    </nav>
  );
}

export default async function ProductListing({
  title,
  eyebrow,
  description,
  banner,
  crumbs,
  basePath,
  scope,
  params,
  raw,
  categories,
  hide,
  emptyAction,
}: {
  title: string;
  eyebrow?: string;
  description?: string | null;
  banner?: string | null;
  crumbs: Crumb[];
  basePath: string;
  scope: Pick<SearchParams, "category" | "collection" | "brands" | "q">;
  params: ListingParams;
  raw: RawParams;
  categories?: CategoryLink[];
  hide?: ("brand" | "category")[];
  emptyAction?: ReactNode;
}) {
  const query: SearchParams = {
    ...params,
    category: scope.category ?? params.category,
    collection: scope.collection ?? null,
    q: scope.q ?? params.q,
    brands: scope.brands?.length ? scope.brands : params.brands,
  };
  const [results, facets] = await Promise.all([
    searchProducts(query),
    getFacets(query.q ?? null, query.category ?? null, query.collection ?? null),
  ]);

  return (
    <div>
      {banner ? (
        <section className="relative h-[42vh] min-h-72 overflow-hidden bg-bone md:h-[52vh]">
          <CatalogImage src={banner} alt="" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <div className="container-page absolute inset-x-0 bottom-0 pb-10 text-white">
            {eyebrow && <p className="label-caps opacity-90">{eyebrow}</p>}
            <h1 className="mt-3 font-serif text-5xl leading-none md:text-6xl">{title}</h1>
            {description && <p className="mt-4 max-w-xl text-sm leading-relaxed opacity-90 md:text-base">{description}</p>}
          </div>
        </section>
      ) : null}
      <div className="container-page">
        <div className={banner ? "pt-6" : "pt-8 md:pt-12"}>
          <Breadcrumbs items={crumbs} />
          {!banner && (
            <div className="mt-6 max-w-3xl">
              {eyebrow && <p className="label-caps text-stone">{eyebrow}</p>}
              <h1 className="mt-2 font-serif text-4xl leading-tight md:text-6xl">{title}</h1>
              {description && <p className="mt-4 leading-relaxed text-taupe">{description}</p>}
            </div>
          )}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[15rem_1fr] xl:grid-cols-[16rem_1fr]">
          <aside aria-label="Filters" className="hidden lg:block">
            <Suspense>
              <FilterPanel facets={facets} hide={hide} categories={categories} />
            </Suspense>
          </aside>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <p className="text-sm text-taupe" aria-live="polite">
                {results.total} {results.total === 1 ? "product" : "products"}
              </p>
              <div className="flex items-center gap-3">
                <Suspense>
                  <MobileFilters facets={facets} hide={hide} categories={categories} total={results.total} />
                  <SortSelect className="hidden lg:flex" />
                </Suspense>
              </div>
            </div>
            <div className="mt-4">
              <Suspense>
                <ActiveFilters facets={facets} />
              </Suspense>
            </div>
            <div className="mt-6">
              {results.items.length > 0 ? (
                <ProductGrid products={results.items} priorityCount={4} />
              ) : (
                <div className="py-24 text-center">
                  <p className="font-serif text-3xl">Nothing matches just yet</p>
                  <p className="mt-3 text-taupe">Try removing a filter or searching for something else.</p>
                  <div className="mt-6">{emptyAction ?? <Link href={basePath} className="underline underline-offset-4">Clear all filters</Link>}</div>
                </div>
              )}
            </div>
            <Pagination page={params.page} total={results.total} basePath={basePath} query={raw} />
          </div>
        </div>
      </div>
    </div>
  );
}
