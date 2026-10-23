import type { Metadata, Viewport } from "next";
import Footer from "@/components/store/Footer";
import Header from "@/components/store/Header";
import StoreProvider from "@/components/store/StoreProvider";
import { getDepartments } from "@/lib/catalog";
import { getSettings, homepageOf } from "@/lib/settings";
import { HEADING_WEIGHT, themeOf, themeTokens, type HeadingFont } from "@/lib/theme";
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

export async function generateViewport(): Promise<Viewport> {
  const s = await getSettings();
  return { themeColor: s.background_color };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, departments] = await Promise.all([getSettings(), getDepartments()]);
  const home = homepageOf(settings);
  const { colors, italic } = themeOf(settings);
  const headingKey = (settings.heading_font in HEADING_FONTS ? settings.heading_font : "cormorant") as HeadingFont;
  const heading = HEADING_FONTS[headingKey];
  const body = BODY_FONTS[settings.body_font as keyof typeof BODY_FONTS]?.css ?? BODY_FONTS.jost.css;
  // Custom properties resolve where they are declared, so every colour and the font stacks
  // themselves are declared here (setting only --font-heading would not reach .font-serif).
  const theme = {
    ...themeTokens(colors),
    "--font-heading": heading.css,
    "--font-body": body,
    "--font-serif": `${heading.css}, Georgia, "Times New Roman", serif`,
    "--font-sans": `${body}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`,
    "--heading-style": italic ? "italic" : "normal",
    "--heading-weight": String(HEADING_WEIGHT[headingKey]),
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
