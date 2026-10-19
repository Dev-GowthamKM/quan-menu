"use client";
// Small labelled form fields for admin editors. The hint is linked with aria-describedby
// so screen readers announce it after the label, not as part of it.
import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "../ui/controls";
import { adminInput } from "./ui";

export function TextField({ label, hint, className, ...rest }: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-taupe">{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={adminInput} {...rest} />
      {hint && <p id={`${id}-hint`} className="text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, className, ...rest }: ComponentProps<"textarea"> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-taupe">{label}</label>
      <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm focus:border-ink focus:outline-none" {...rest} />
      {hint && <p id={`${id}-hint`} className="text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, className, children, ...rest }: ComponentProps<"select"> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={id} className="text-xs font-medium text-taupe">{label}</label>
      <select id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={adminInput} {...rest}>{children}</select>
      {hint && <p id={`${id}-hint`} className="text-xs text-stone">{hint}</p>}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} className="mt-0.5 size-4 accent-ink" />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm">{label}</label>
        {hint && <p id={`${id}-hint`} className="text-xs text-stone">{hint}</p>}
      </div>
    </div>
  );
}

/** Page title and meta description with counters and the store's fallback shown as placeholder. */
export function SeoFields({ title, description, fallbackTitle, fallbackDescription, onChange }: {
  title: string;
  description: string;
  fallbackTitle: string;
  fallbackDescription: string;
  onChange: (patch: { seo_title?: string; seo_description?: string }) => void;
}) {
  return (
    <div className="grid gap-3">
      <TextField label={<span className="flex justify-between">Page title <span className="font-normal text-stone">{title.length}/70</span></span>} value={title} maxLength={120} placeholder={fallbackTitle} onChange={(e) => onChange({ seo_title: e.target.value })} />
      <TextArea label={<span className="flex justify-between">Meta description <span className="font-normal text-stone">{description.length}/160</span></span>} value={description} maxLength={320} rows={2} placeholder={fallbackDescription} onChange={(e) => onChange({ seo_description: e.target.value })} />
    </div>
  );
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
