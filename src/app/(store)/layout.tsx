import type { Metadata, Viewport } from "next";
import { fontFamilies } from "@/app/fonts";
import ChatButton from "@/components/store/ChatButton";
import Footer from "@/components/store/Footer";
import Header from "@/components/store/Header";
import Intro from "@/components/store/Intro";
import Motion from "@/components/store/Motion";
import SetupNotice from "@/components/store/SetupNotice";
import StoreProvider from "@/components/store/StoreProvider";
import { getDepartments, searchProducts } from "@/lib/catalog";
import { headingWeight, homeSections, radiusTokens } from "@/lib/designs";
import { storefrontLook } from "@/lib/look";
import { fontFile } from "@/lib/font-files";
import { contactOf, getSettings, homepageOf } from "@/lib/settings";
import { BODY_FONTS, fontStack, HEADING_FONTS, isLight, themeTokens } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  // The store's own icon (store-icon.svg); the version changes when its name or look does.
  const version = [s.store_name, s.brand_color ?? s.primary_color, s.design ?? "", s.heading_font].join("|");
  let hash = 0;
  for (const ch of version) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return {
    title: { default: s.seo_title || s.store_name, template: `%s | ${s.store_name}` },
    description: s.seo_description || s.tagline,
    openGraph: { siteName: s.store_name, type: "website", images: s.og_image_url ? [s.og_image_url] : undefined },
    twitter: { card: "summary_large_image" },
    icons: { icon: [{ url: `/store-icon.svg?v=${(hash >>> 0).toString(36)}`, type: "image/svg+xml" }] },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getSettings();
  return { themeColor: s.background_color };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [settings, departments] = await Promise.all([getSettings(), getDepartments()]);
  const home = homepageOf(settings);
  const contact = contactOf(settings);
  const { look, design, preview } = await storefrontLook(settings);
  const heading = HEADING_FONTS[look.heading_font];
  const body = BODY_FONTS[look.body_font];
  const headingItalic = look.heading_italic && heading.italic;
  const weight = headingWeight(design, look.heading_font);
  // The store's own two fonts arrive with the page (lib/font-files.ts).
  const fontFiles = [fontFile(fontFamilies[look.heading_font], weight, headingItalic), fontFile(fontFamilies[look.body_font], 400)].filter((f) => f !== null);
  const light = isLight(look.colors);
  // Custom properties resolve where they are declared, so every colour and the font stacks
  // themselves are declared here (setting only --font-heading would not reach .font-serif).
  const theme = {
    ...themeTokens(look.colors),
    ...radiusTokens(design),
    "--font-heading": heading.css,
    "--font-body": body.css,
    "--font-serif": fontStack(heading),
    "--font-sans": fontStack(body),
    "--heading-style": headingItalic ? "italic" : "normal",
    "--heading-weight": String(weight),
    "--heading-case": design.headingCase,
    "--heading-tracking": design.headingTracking,
    colorScheme: light ? "light" : "dark",
  } as React.CSSProperties;

  // See-through and floating headers sit over the home page's opening full-screen banner (a
  // photograph, or Neon's glowing scene), when the home page opens with one.
  const overlayHero =
    ["overlay", "floating", "glass"].includes(design.header) &&
    ["cinema", "film", "glow"].includes(design.hero) &&
    homeSections(design, home.sections)[0] === "hero" &&
    (design.hero === "glow" || !!home.hero?.[0]?.image_url) &&
    (await searchProducts({ sort: "newest", limit: 12 })).items.length > 0;

  return (
    <div
      style={theme}
      data-design={design.key}
      data-motion={design.motion}
      data-card={design.card}
      data-title={design.title}
      data-scheme={light ? "light" : "dark"}
      className="flex min-h-dvh flex-col bg-ivory font-sans text-ink"
    >
      {/* First, so it decides before the header is drawn whether this visit opens with the curtain. */}
      {design.intro === "name" && design.motion !== "none" && <Intro name={settings.store_name} />}
      {[...new Set(fontFiles)].map((href) => <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />)}
      {/* The page behind the store (overscroll, the bottom of short pages) in the store's background. */}
      <style href="store-background" precedence="default">{`body{background:${look.colors.background}}`}</style>
      <a href="#main" className="sr-only z-50 bg-ink px-4 py-2 text-ivory focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <StoreProvider currency={settings.currency} storeType={settings.store_type}>
        {settings.unavailable && <div data-above-header><SetupNotice /></div>}
        {preview && (
          <div data-above-header className="relative z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-100 px-4 py-2 text-center text-xs text-amber-950">
            <span>Preview of a look that isn&apos;t saved yet. Customers still see the store as it was.</span>
            {/* A full page load, so the cookie is cleared before the page is drawn again. */}
            <a href="/?look=exit" className="font-semibold underline underline-offset-2">End preview</a>
          </div>
        )}
        <Header settings={settings} departments={departments} announcement={home.announcement} design={design} overlayHero={overlayHero} />
        <main id="main" className="flex-1">{children}</main>
        <Footer settings={settings} departments={departments} variant={design.footer} />
        {contact.chat_button && contact.whatsapp && <ChatButton number={contact.whatsapp} storeName={settings.store_name} />}
        <Motion level={design.motion} />
      </StoreProvider>
    </div>
  );
}
