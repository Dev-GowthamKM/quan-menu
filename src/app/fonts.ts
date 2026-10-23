import { Bodoni_Moda, Cormorant_Garamond, DM_Sans, DM_Serif_Display, Inter, Jost, Manrope, Playfair_Display } from "next/font/google";

// Fonts the admin can choose in Settings › Appearance. All are self-hosted by next/font;
// only the defaults are preloaded, and browsers download the others only if chosen.
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap", preload: false });
const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-bodoni", display: "swap", preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-dm-serif", display: "swap", preload: false });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", preload: false });

export const fontVariables = [cormorant, playfair, bodoni, dmSerif, jost, inter, manrope, dmSans].map((f) => f.variable).join(" ");

export const HEADING_FONTS = {
  cormorant: { label: "Cormorant Garamond", css: "var(--font-cormorant)" },
  playfair: { label: "Playfair Display", css: "var(--font-playfair)" },
  bodoni: { label: "Bodoni Moda", css: "var(--font-bodoni)" },
  "dm-serif": { label: "DM Serif Display", css: "var(--font-dm-serif)" },
} as const;

export const BODY_FONTS = {
  jost: { label: "Jost", css: "var(--font-jost)" },
  inter: { label: "Inter", css: "var(--font-inter)" },
  manrope: { label: "Manrope", css: "var(--font-manrope)" },
  "dm-sans": { label: "DM Sans", css: "var(--font-dm-sans)" },
} as const;
