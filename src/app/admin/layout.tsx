import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/** The admin is a separate application from the storefront: its own shell, quieter type. */
export default function AdminRoot({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-surface min-h-dvh bg-[#f5f5f3] text-ink" style={{ "--font-body": "var(--font-inter)", "--font-heading": "var(--font-inter)" } as React.CSSProperties}>
      {children}
    </div>
  );
}
