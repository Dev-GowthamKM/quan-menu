import Link from "next/link";
import type { HeroStyle } from "@/lib/designs";
import type { HeroSlide } from "@/lib/types";
import { safeHref } from "@/lib/urls";
import CatalogImage from "../ui/CatalogImage";
import { buttonClass, cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";
import HeroMedia from "./HeroMedia";
import Rise from "./Rise";

// The home page's main banner, in each design's hero style (lib/designs.ts). Each works from
// the same banner (Settings › Homepage), plays its film where the style has room for one, and
// has a version for stores without a banner yet. The full-screen styles open the page with a
// zoom in cinematic designs (data-zoom, Motion.tsx): as the shopper scrolls, the banner moves at
// half speed under the page while its picture zooms in and its words float away.

interface HeroProps {
  variant: HeroStyle;
  slide?: HeroSlide;
  storeName: string;
  tagline: string;
  /** More pictures for styles that use several (promotions, departments). */
  extras?: (string | null | undefined)[];
  /** A line under the heading while the store has no banner yet, in the words of what it sells. */
  text?: string;
}

function Ctas({ slide, primary, secondary, className }: { slide: HeroSlide; primary: string; secondary: string; className?: string }) {
  const main = safeHref(slide.cta_href);
  const other = safeHref(slide.secondary_href);
  if (!main && !other) return null;
  return (
    <div className={cx("flex flex-wrap gap-3", className)}>
      {main && <Link href={main} className={primary}>{slide.cta_label || "Shop now"}</Link>}
      {other && <Link href={other} className={secondary}>{slide.secondary_label || "Explore"}</Link>}
    </div>
  );
}

/** A slowly turning round sticker with words around its edge (Bazaar). */
function SpinBadge({ text, className }: { text: string; className?: string }) {
  const words = `${text} ✦ `.repeat(Math.max(1, Math.ceil(30 / (text.length + 3)))).slice(0, 34);
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cx("animate-spin-slow", className)}>
      <defs>
        <path id="spin-badge-path" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
      </defs>
      <circle cx="50" cy="50" r="49" className="fill-brand stroke-ink" strokeWidth="2" />
      <text className="fill-on-brand" style={{ fontSize: 9.5, letterSpacing: 1.6, fontWeight: 700, textTransform: "uppercase" }}>
        <textPath href="#spin-badge-path">{words}</textPath>
      </text>
      <path d="M50 38l3.5 8.5L62 50l-8.5 3.5L50 62l-3.5-8.5L38 50l8.5-3.5z" className="fill-on-brand" />
    </svg>
  );
}

export default function Hero({ variant, slide, storeName, tagline, extras = [], text = "New pieces every season, made to be worn for many more." }: HeroProps) {
  const image = slide?.image_url || null;
  const video = slide?.video_url || null;
  const heading = slide?.heading || tagline || storeName;

  switch (variant) {
    case "full":
      if (!slide || !image) {
        return (
          <section className="container-page grid gap-8 py-20 md:grid-cols-[2fr_1fr] md:items-end md:py-32">
            <h1 className="font-serif text-5xl leading-[1.02] md:text-7xl">{heading}</h1>
            <div>
              <p className="text-sm leading-relaxed text-taupe">{text}</p>
              <Link href="/shop?sort=newest" className="mt-5 inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-medium">Shop new arrivals <ArrowRight size={14} /></Link>
            </div>
          </section>
        );
      }
      return (
        <section className="relative">
          <div className="relative h-[72svh] min-h-[26rem] overflow-hidden bg-bone md:h-[86svh]">
            <HeroMedia image={image} video={video} alt={slide.image_alt || ""} priority sizes="100vw" parallax={0.12} />
          </div>
          <div className="container-page relative -mt-24 md:absolute md:inset-x-0 md:bottom-10 md:mt-0">
            <div className="max-w-md bg-ivory p-6 md:p-9">
              {slide.eyebrow && <p className="text-[11px] tracking-[0.18em] text-taupe uppercase">{slide.eyebrow}</p>}
              <h1 className="mt-3 font-serif text-4xl leading-[1.05] md:text-5xl">{slide.heading}</h1>
              {slide.subheading && <p className="mt-3 text-sm leading-relaxed text-taupe">{slide.subheading}</p>}
              <Ctas
                slide={slide}
                className="mt-6 gap-x-6"
                primary="inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-medium"
                secondary="inline-flex items-center pb-0.5 text-sm text-taupe underline-offset-4 hover:underline"
              />
            </div>
          </div>
        </section>
      );

    case "type": {
      const pictures = [image, ...extras].filter((x): x is string => !!x).slice(0, 2);
      return (
        <section className="relative overflow-hidden border-b-2 border-ink bg-sand">
          <div className="container-page grid items-center gap-12 py-12 md:grid-cols-[1.15fr_1fr] md:py-20">
            <div className="relative z-10">
              <p className="inline-block rounded-btn bg-ink px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-ivory uppercase">{slide?.eyebrow || "New drop"}</p>
              <h1 className="mt-5 font-serif text-[clamp(2.6rem,7.5vw,6.25rem)] leading-[0.95]">{heading}</h1>
              {slide?.subheading && <p className="mt-5 max-w-md text-base leading-relaxed text-taupe">{slide.subheading}</p>}
              {slide ? (
                <Ctas slide={slide} className="mt-8" primary={buttonClass("primary", "lg", "font-bold")} secondary={buttonClass("secondary", "lg", "font-bold")} />
              ) : (
                <Link href="/shop?sort=newest" className={buttonClass("primary", "lg", "mt-8 font-bold")}>Shop new arrivals</Link>
              )}
            </div>
            <div className="relative mx-auto aspect-square w-full max-w-md">
              {pictures[0] ? (
                <div className="absolute inset-[4%_16%_12%_6%] -rotate-3 overflow-hidden rounded-card border-2 border-ink bg-bone shadow-[8px_8px_0_var(--color-ink)]">
                  <CatalogImage src={pictures[0]} alt={slide?.image_alt || ""} fill priority fetchPriority="high" sizes="(min-width: 768px) 30vw, 70vw" className="object-cover" />
                </div>
              ) : (
                <div aria-hidden className="absolute inset-[8%] grid place-items-center rounded-full border-2 border-ink bg-brand font-serif text-[clamp(2rem,6vw,4rem)] text-on-brand">
                  {storeName.slice(0, 1)}
                </div>
              )}
              {pictures[1] && (
                <div className="absolute right-0 bottom-0 aspect-[3/4] w-[42%] rotate-[5deg] overflow-hidden rounded-card border-2 border-ink bg-bone shadow-[6px_6px_0_var(--color-ink)]">
                  <CatalogImage src={pictures[1]} alt="" fill sizes="(min-width: 768px) 14vw, 36vw" className="object-cover" />
                </div>
              )}
              <SpinBadge text={slide?.eyebrow || storeName} className="absolute -top-3 -left-3 size-24 md:size-28" />
            </div>
          </div>
        </section>
      );
    }

    case "framed":
      return (
        <section className="container-page pt-4 md:pt-6">
          <div className="relative overflow-hidden rounded-[calc(var(--radius-card)*1.5)] bg-bone">
            {image && slide ? (
              <>
                <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[16/10] md:aspect-auto md:h-[min(78svh,44rem)]">
                  <HeroMedia image={image} video={video} alt={slide.image_alt || ""} priority sizes="(min-width: 1408px) 84rem, 100vw" parallax={0.08} />
                </div>
                <div className="absolute inset-x-3 bottom-3 md:inset-x-auto md:bottom-10 md:left-10 md:max-w-md">
                  <div className="rounded-card bg-paper/90 p-6 shadow-lg backdrop-blur md:p-8">
                    {slide.eyebrow && <p className="text-sm text-accent italic">{slide.eyebrow}</p>}
                    <h1 className="mt-2 font-serif text-4xl leading-tight md:text-5xl">{slide.heading}</h1>
                    {slide.subheading && <p className="mt-3 text-sm leading-relaxed text-taupe">{slide.subheading}</p>}
                    <Ctas slide={slide} className="mt-6" primary={buttonClass("primary", "md")} secondary={buttonClass("secondary", "md")} />
                  </div>
                </div>
              </>
            ) : (
              <div className="px-6 py-24 text-center md:py-32">
                <p className="text-sm text-accent italic">Welcome to {storeName}</p>
                <h1 className="mx-auto mt-4 max-w-3xl font-serif text-5xl leading-tight md:text-6xl">{heading}</h1>
                <Link href="/shop?sort=newest" className={buttonClass("primary", "lg", "mt-8")}>Shop new arrivals</Link>
              </div>
            )}
          </div>
        </section>
      );

    case "arch":
      return (
        <section className="relative overflow-hidden bg-bone">
          <div className={cx("container-page grid items-center gap-10 py-14 md:py-20", image && "md:grid-cols-2")}>
            <div className="order-2 text-center md:order-1">
              <p className="label-caps text-accent">{slide?.eyebrow || storeName}</p>
              <span aria-hidden className="ornament mt-4 text-accent" />
              <h1 className="mx-auto mt-4 max-w-2xl font-serif text-4xl leading-tight md:text-6xl">{heading}</h1>
              {slide?.subheading && <p className="mx-auto mt-5 max-w-md leading-relaxed text-taupe">{slide.subheading}</p>}
              {slide ? (
                <Ctas slide={slide} className="mt-8 justify-center" primary={buttonClass("primary", "lg")} secondary={buttonClass("secondary", "lg")} />
              ) : (
                <Link href="/shop?sort=newest" className={buttonClass("primary", "lg", "mt-8")}>Shop new arrivals</Link>
              )}
            </div>
            {image && (
              <div className="order-1 md:order-2">
                <div className="relative mx-auto aspect-[3/4] w-full max-w-sm">
                  <div aria-hidden className="absolute -inset-3 rounded-t-full border border-accent" />
                  <div className="relative size-full overflow-hidden rounded-t-full bg-sand">
                    <HeroMedia image={image} video={video} alt={slide?.image_alt || ""} priority sizes="(min-width: 768px) 24rem, 90vw" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      );

    case "cinema":
      if (!slide || !image) {
        return (
          <section className="container-page py-28 md:py-40">
            <p className="text-[11px] tracking-[0.4em] text-taupe uppercase">{storeName}</p>
            <h1 className="mt-5 max-w-5xl font-serif text-[clamp(2.75rem,8vw,7.5rem)] leading-[0.92]">{heading}</h1>
            <Link href="/shop?sort=newest" className={buttonClass("primary", "lg", "mt-10")}>Shop new arrivals</Link>
          </section>
        );
      }
      return (
        <section data-hero="cinema" data-zoom className="relative h-[100svh] min-h-[32rem] overflow-hidden bg-black text-white">
          <div className="zoom-stage absolute inset-0">
            <HeroMedia image={image} video={video} alt={slide.image_alt || ""} priority sizes="100vw" parallax={0.15} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/45" />
            <div className="zoom-copy container-page absolute inset-x-0 bottom-0 pb-14 md:pb-20">
              {slide.eyebrow && <p className="text-[11px] tracking-[0.4em] uppercase opacity-80">{slide.eyebrow}</p>}
              <h1 data-rise="load" className="mt-4 max-w-5xl font-serif text-[clamp(2.6rem,8vw,7.5rem)] leading-[0.92]"><Rise text={slide.heading} /></h1>
              {slide.subheading && <p className="mt-5 max-w-lg text-sm leading-relaxed opacity-85">{slide.subheading}</p>}
              <Ctas
                slide={slide}
                className="mt-8"
                primary="inline-flex h-12 items-center rounded-btn bg-white px-7 text-[12px] tracking-[0.2em] text-black uppercase transition-colors hover:bg-white/85"
                secondary="inline-flex h-12 items-center rounded-btn border border-white/70 px-7 text-[12px] tracking-[0.2em] text-white uppercase transition-colors hover:bg-white hover:text-black"
              />
            </div>
            <span aria-hidden className="absolute right-6 bottom-8 hidden text-[10px] tracking-[0.4em] uppercase opacity-70 [writing-mode:vertical-rl] md:block">Scroll</span>
          </div>
        </section>
      );

    case "film":
      if (!slide || !image) {
        return (
          <section className="relative grid min-h-[80svh] place-items-center overflow-hidden bg-bone px-6 py-28 text-center">
            <div>
              <p className="text-[11px] tracking-[0.35em] text-taupe uppercase">{storeName}</p>
              <h1 className="mx-auto mt-6 max-w-5xl font-serif text-[clamp(2.75rem,8vw,7.5rem)] leading-[0.98]">{heading}</h1>
              <Link href="/shop?sort=newest" className={buttonClass("primary", "lg", "mt-10")}>Shop new arrivals</Link>
            </div>
          </section>
        );
      }
      return (
        <section data-hero="film" data-zoom className="relative h-[100svh] min-h-[34rem] overflow-hidden bg-neutral-900 text-white">
          <div className="zoom-stage absolute inset-0">
            <HeroMedia image={image} video={video} alt={slide.image_alt || ""} priority sizes="100vw" parallax={0.18} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/50" />
            <div className="zoom-copy absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                {slide.eyebrow && <p className="animate-fade-in text-[11px] tracking-[0.35em] uppercase opacity-90">{slide.eyebrow}</p>}
                <h1 data-rise="load" className="mt-5 animate-fade-in font-serif text-[clamp(3rem,9vw,8.5rem)] leading-[0.95] [animation-delay:150ms]"><Rise text={slide.heading} /></h1>
                {slide.subheading && <p className="mx-auto mt-6 max-w-md animate-fade-in text-sm leading-relaxed opacity-90 [animation-delay:300ms]">{slide.subheading}</p>}
                <Ctas
                  slide={slide}
                  className="mt-9 animate-fade-in justify-center [animation-delay:450ms]"
                  primary="inline-flex h-12 items-center rounded-btn bg-white/90 px-7 text-[12px] tracking-[0.2em] text-black uppercase backdrop-blur transition-colors hover:bg-white"
                  secondary="inline-flex h-12 items-center rounded-btn border border-white/70 px-7 text-[12px] tracking-[0.2em] text-white uppercase transition-colors hover:bg-white hover:text-black"
                />
              </div>
            </div>
            <span aria-hidden className="absolute bottom-7 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 text-[10px] tracking-[0.4em] uppercase opacity-80">
              Scroll
              <span className="h-10 w-px bg-white/70" />
            </span>
          </div>
        </section>
      );

    case "glow": {
      const picture = image ?? extras.find((x): x is string => !!x) ?? null;
      const glow = "shadow-[0_0_36px_-6px_var(--color-brand)]";
      return (
        <section data-hero="glow" data-zoom className="relative overflow-hidden bg-ivory">
          <div className="zoom-stage relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(60% 50% at 50% 50%, color-mix(in oklab, var(--color-brand) 55%, transparent), transparent 72%)" }}
            />
            <p aria-hidden data-drift="0.25" className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-serif text-[clamp(4.5rem,19vw,17rem)] leading-none whitespace-nowrap text-ink/10">
              {heading}
            </p>
            {/* The heading, the glowing picture and the buttons: stacked on phones, side by side on wide screens. */}
            <div className="container-page relative grid min-h-[100svh] content-center items-center gap-8 pt-28 pb-14 text-center lg:grid-cols-[1fr_auto_1fr] lg:gap-12 lg:text-left">
              <div className="zoom-copy">
                <p className="inline-block rounded-btn border border-line px-3 py-1 text-[11px] tracking-[0.2em] uppercase">{slide?.eyebrow || "New drop"}</p>
                <h1 data-rise="load" className="mt-5 font-serif text-[clamp(2.4rem,5vw,5.5rem)] leading-[0.95]"><Rise text={heading} /></h1>
              </div>
              {picture ? (
                <div className="zoom-media relative mx-auto aspect-[3/4] w-[min(52vw,15rem)] animate-float overflow-hidden rounded-card shadow-[0_34px_120px_-24px_var(--color-brand)] lg:w-[min(26vw,22rem)]">
                  <CatalogImage src={picture} alt={slide?.image_alt || ""} fill priority fetchPriority="high" sizes="(min-width: 1024px) 22rem, 52vw" className="object-cover" />
                </div>
              ) : (
                <div aria-hidden className="mx-auto size-40 animate-float rounded-full bg-brand/40 blur-2xl lg:size-72" />
              )}
              <div className="zoom-copy lg:max-w-xs lg:justify-self-end">
                {slide?.subheading && <p className="mx-auto max-w-md text-sm leading-relaxed text-taupe lg:mx-0">{slide.subheading}</p>}
                {slide ? (
                  <Ctas
                    slide={slide}
                    className="mt-6 justify-center lg:justify-start"
                    primary={buttonClass("primary", "lg", `font-bold ${glow}`)}
                    secondary={buttonClass("secondary", "lg", "font-bold")}
                  />
                ) : (
                  <Link href="/shop?sort=newest" className={buttonClass("primary", "lg", `mt-6 font-bold ${glow}`)}>Shop new arrivals</Link>
                )}
              </div>
            </div>
          </div>
        </section>
      );
    }

    default:
      if (!slide) {
        return (
          <section className="container-page py-24 text-center md:py-36">
            <p className="label-caps text-accent">New season</p>
            <h1 className="mx-auto mt-6 max-w-4xl font-serif text-5xl leading-[1.05] md:text-7xl">{tagline || storeName}</h1>
            <div className="mt-10 flex justify-center gap-3">
              <Link href="/shop?sort=newest" className={buttonClass("primary", "lg")}>Shop new arrivals</Link>
            </div>
          </section>
        );
      }
      return (
        <section className="relative">
          <div className="grid md:grid-cols-2">
            <div className="relative order-1 aspect-[4/5] overflow-hidden bg-bone md:order-2 md:aspect-auto md:min-h-[min(88vh,56rem)]">
              <HeroMedia image={slide.image_url} video={video} alt={slide.image_alt || ""} priority sizes="(min-width: 768px) 50vw, 100vw" />
            </div>
            <div className="order-2 flex items-center bg-bone md:order-1">
              <div className="w-full px-6 py-14 md:px-12 lg:px-20 xl:px-28">
                {slide.eyebrow && <p className="label-caps animate-fade-in text-accent">{slide.eyebrow}</p>}
                <h1 className="mt-5 animate-fade-in font-serif text-5xl leading-[1.02] [animation-delay:80ms] md:text-6xl xl:text-[5.5rem]">{slide.heading}</h1>
                {slide.subheading && <p className="mt-6 max-w-md animate-fade-in leading-relaxed text-taupe [animation-delay:160ms]">{slide.subheading}</p>}
                <Ctas slide={slide} className="mt-10 animate-fade-in [animation-delay:240ms]" primary={buttonClass("primary", "lg")} secondary={buttonClass("secondary", "lg")} />
              </div>
            </div>
          </div>
        </section>
      );
  }
}
