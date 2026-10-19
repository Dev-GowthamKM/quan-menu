// Form controls and buttons shared by the storefront and the admin. Native elements
// underneath, so keyboard support, autofill and screen readers work as expected.
import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-ivory hover:bg-ink/85 border border-ink",
  secondary: "border border-ink text-ink bg-transparent hover:bg-ink hover:text-ivory",
  ghost: "text-ink hover:bg-ink/5 border border-transparent",
  danger: "bg-sale text-white hover:bg-sale/90 border border-sale",
  link: "text-ink underline underline-offset-4 decoration-ink/30 hover:decoration-ink px-0! h-auto!",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-13 px-8 text-sm tracking-wide uppercase",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; busy?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", busy, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "size-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const fieldBase =
  "w-full min-w-0 border border-line bg-white text-sm text-ink placeholder:text-stone/70 transition-colors focus:border-ink focus:outline-none disabled:bg-bone/50 aria-[invalid=true]:border-sale";

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input">>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, "h-11 px-3", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, "px-3 py-2.5 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, ComponentProps<"select"> & { wrapperClassName?: string }>(function Select(
  { className, wrapperClassName, children, ...rest },
  ref,
) {
  return (
    <span className={cx("relative block", wrapperClassName)}>
      <select ref={ref} className={cx(fieldBase, "h-11 appearance-none pl-3 pr-9", className)} {...rest}>
        {children}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
});

export function Field({
  label,
  hint,
  error,
  htmlFor,
  required,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-taupe">
        {label}
        {required && <span className="text-sale" aria-hidden> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-sale" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-stone">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2.5 text-sm", className)}>
      <input type="checkbox" className="size-4 shrink-0 accent-ink" {...rest} />
      <span>{label}</span>
    </label>
  );
}

const tones = {
  neutral: "bg-bone text-taupe",
  dark: "bg-ink text-ivory",
  green: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-1 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
  sale: "bg-sale text-white",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "error" | "success" | "warning"; children: ReactNode; className?: string }) {
  const styles = {
    neutral: "border-line bg-paper text-taupe",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("border px-4 py-3 text-sm leading-relaxed", styles, className)}>
      {children}
    </div>
  );
}
