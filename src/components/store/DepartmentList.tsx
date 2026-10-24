"use client";
import Link from "next/link";
import { useState } from "react";
import type { Department } from "@/lib/catalog";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";

/** Nordic's departments: a numbered list of big names, with the picture of the one under the pointer. */
export default function DepartmentList({ departments }: { departments: Department[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_20rem] lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
      <ul>
        {departments.map((d, i) => (
          <li key={d.id} className="border-b border-line first:border-t">
            <Link
              href={`/category/${d.slug}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              className="group flex items-center justify-between gap-6 py-5 md:py-6"
            >
              <span className="flex min-w-0 items-baseline gap-5">
                <span className="text-xs text-stone tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-serif text-3xl leading-tight transition-transform duration-300 group-hover:translate-x-2 md:text-5xl">{d.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-4">
                <span className="relative size-14 overflow-hidden rounded-img bg-bone md:hidden">
                  <CatalogImage src={d.image_url} alt="" fill sizes="56px" className="object-cover" />
                </span>
                <ArrowRight size={20} className="transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="relative hidden aspect-[3/4] overflow-hidden rounded-img bg-bone md:block" aria-hidden>
        {departments.map((d, i) => (
          <CatalogImage
            key={d.id}
            src={d.image_url}
            alt=""
            fill
            sizes="24rem"
            className={cx("object-cover transition-opacity duration-500", i === active ? "opacity-100" : "opacity-0")}
          />
        ))}
      </div>
    </div>
  );
}
