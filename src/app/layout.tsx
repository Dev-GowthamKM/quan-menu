import type { Metadata, Viewport } from "next";
import { contextOrigin } from "@/lib/store";
import { fontVariables } from "./fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    // Relative links in metadata (canonical, Open Graph) resolve against the store's own address.
    metadataBase: new URL(await contextOrigin()),
    formatDetection: { telephone: false },
    // The admin's icon; each storefront has its own (see (store)/layout.tsx).
    icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f3ec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The storefront marks <html> before it hydrates (the opening curtain, components/store/Intro.tsx).
    <html lang="en-IN" className={fontVariables} suppressHydrationWarning>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
