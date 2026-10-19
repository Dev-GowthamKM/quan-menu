import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

const stack = "var(--font-inter), ui-sans-serif, system-ui, -apple-system, \"Segoe UI\", sans-serif";
const ADMIN_FONTS = { "--font-body": "var(--font-inter)", "--font-heading": "var(--font-inter)", "--font-sans": stack, "--font-serif": stack } as React.CSSProperties;

/** The admin is a separate application from the storefront: its own shell, quieter type. */
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-surface min-h-dvh bg-[#f5f5f3] font-sans text-ink" style={ADMIN_FONTS}>
      {children}
    </div>
  );
}
