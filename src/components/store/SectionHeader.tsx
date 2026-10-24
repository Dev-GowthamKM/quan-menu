import Link from "next/link";
import { cx } from "../ui/controls";
import { ArrowRight } from "../ui/icons";

/** A section's title. Its look follows the store's design (data-title, styled in globals.css). */
export function SectionHeader({ eyebrow, title, href, linkLabel = "View all", className }: { eyebrow?: string; title: string; href?: string; linkLabel?: string; className?: string }) {
  return (
    <div className={cx("sh mb-8 flex items-end justify-between gap-6", className)}>
      <div className="sh-text">
        {eyebrow && <p className="sh-eyebrow label-caps text-accent">{eyebrow}</p>}
        <h2 className="sh-title mt-2 font-serif text-3xl leading-tight md:text-4xl"><span>{title}</span></h2>
      </div>
      {href && (
        <Link href={href} className="sh-link group inline-flex shrink-0 items-center gap-2 text-[13px] tracking-wide underline-offset-4 hover:underline">
          {linkLabel} <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
