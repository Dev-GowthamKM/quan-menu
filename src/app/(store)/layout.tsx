import type { Metadata } from "next";
import Footer from "@/components/store/Footer";
import Header from "@/components/store/Header";
import StoreProvider from "@/components/store/StoreProvider";
import { getDepartments } from "@/lib/catalog";
import { getSettings, homepageOf } from "@/lib/settings";
import { BODY_FONTS, HEADING_FONTS } from "../fonts";
import SetupNotice from "@/components/store/SetupNotice";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: s.seo_title || s.store_name, template: `%s | ${s.store_name}` },
    description: s.seo_description || s.tagline,
    openGraph: { siteName: s.store_name, type: "website", images: s.og_image_url ? [s.og_image_url] : undefined },
    twitter: { card: "summary_large_image" },
  };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, departments] = await Promise.all([getSettings(), getDepartments()]);
  const home = homepageOf(settings);
  const heading = HEADING_FONTS[settings.heading_font as keyof typeof HEADING_FONTS]?.css ?? HEADING_FONTS.cormorant.css;
  const body = BODY_FONTS[settings.body_font as keyof typeof BODY_FONTS]?.css ?? BODY_FONTS.jost.css;
  // Custom properties resolve where they are declared, so the font stacks themselves are
  // redeclared here (setting only --font-heading would not reach .font-serif).
  const theme = {
    "--color-ink": settings.primary_color,
    "--color-accent": settings.accent_color,
    "--color-ivory": settings.background_color,
    "--font-heading": heading,
    "--font-body": body,
    "--font-serif": `${heading}, Georgia, "Times New Roman", serif`,
    "--font-sans": `${body}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
  } as React.CSSProperties;

  return (
    <div style={theme} className="flex min-h-dvh flex-col bg-ivory font-sans text-ink">
      <a href="#main" className="sr-only z-50 bg-ink px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <StoreProvider currency={settings.currency}>
        {settings.unavailable && <SetupNotice />}
        <Header settings={settings} departments={departments} announcement={home.announcement} />
        <main id="main" className="flex-1">{children}</main>
        <Footer settings={settings} departments={departments} />
      </StoreProvider>
    </div>
  );
}
