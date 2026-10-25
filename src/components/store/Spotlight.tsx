"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx } from "../ui/controls";

export interface Chapter {
  title: string;
  text?: string | null;
  image?: string | null;
  href: string;
  eyebrow: string;
}

/**
 * The store's collections one at a time as the shopper scrolls: on wide screens the picture
 * stays pinned while each chapter's words pass by, and the background takes each chapter's
 * colour (colours from theme.ts chapterColors, so text stays readable); on phones, chapter
 * after chapter.
 */
export default function Spotlight({ chapters, colors }: { chapters: Chapter[]; colors: string[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [chapters.length]);

  const count = String(chapters.length).padStart(2, "0");
  return (
    <section aria-label="Spotlight" className="relative mt-20 transition-colors duration-700 motion-reduce:transition-none md:mt-28" style={{ backgroundColor: colors[active] }}>
      <div className="container-page grid lg:grid-cols-2 lg:gap-16">
        <div className="relative hidden lg:block">
          <div className="sticky top-0 flex h-[100svh] items-center justify-center pt-28 pb-12">
            <div className="relative aspect-[4/5] h-full max-w-full overflow-hidden rounded-img bg-bone shadow-2xl">
              {chapters.map((c, i) => (
                <CatalogImage
                  key={c.href}
                  src={c.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 45vw, 1px"
                  className={cx("object-cover transition-[opacity,scale] duration-700 motion-reduce:transition-none", i === active ? "scale-100 opacity-100" : "scale-105 opacity-0")}
                />
              ))}
            </div>
          </div>
        </div>
        <div>
          {chapters.map((c, i) => (
            <article
              key={c.href}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-index={i}
              className="flex min-h-[80svh] flex-col justify-center py-16 lg:min-h-[100svh]"
            >
              <div className="relative mb-8 aspect-[4/5] overflow-hidden rounded-img bg-bone lg:hidden">
                <CatalogImage src={c.image} alt="" fill sizes="100vw" className="object-cover" />
              </div>
              <p className="label-caps text-accent">
                {c.eyebrow} · {String(i + 1).padStart(2, "0")} / {count}
              </p>
              <h2 className="mt-4 font-serif text-4xl leading-[1.02] md:text-6xl">{c.title}</h2>
              {c.text && <p className="mt-5 max-w-md leading-relaxed text-taupe">{c.text}</p>}
              <Link href={c.href} className={buttonClass("secondary", "md", "mt-8 self-start")}>
                Explore {c.title}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
