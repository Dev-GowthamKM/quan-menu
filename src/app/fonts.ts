import {
  Archivo,
  Bodoni_Moda,
  Bricolage_Grotesque,
  Cinzel,
  Cormorant_Garamond,
  DM_Sans,
  DM_Serif_Display,
  Figtree,
  Fraunces,
  Inter,
  Italiana,
  Josefin_Sans,
  Jost,
  Karla,
  Lora,
  Manrope,
  Marcellus,
  Nunito,
  Outfit,
  Playfair_Display,
  Space_Grotesk,
  Syne,
  Tenor_Sans,
  Unbounded,
  Work_Sans,
} from "next/font/google";

// Fonts the admin can choose in Settings › Appearance (listed in lib/theme.ts). All are
// self-hosted by next/font, and browsers download only the ones a store uses. None is preloaded
// for every page: the store layout preloads the store's own two (lib/font-files.ts). next/font
// needs each call's options written out.
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-cormorant", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-playfair", display: "swap", preload: false });
const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-bodoni", display: "swap", preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-dm-serif", display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-fraunces", display: "swap", preload: false });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap", preload: false });
const italiana = Italiana({ subsets: ["latin"], weight: "400", variable: "--font-italiana", display: "swap", preload: false });
const marcellus = Marcellus({ subsets: ["latin"], weight: "400", variable: "--font-marcellus", display: "swap", preload: false });
const syne = Syne({ subsets: ["latin"], variable: "--font-syne", display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap", preload: false });
const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", display: "swap", preload: false });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap", preload: false });
const archivo = Archivo({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-archivo", display: "swap", preload: false });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap", preload: false });
const josefin = Josefin_Sans({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-josefin", display: "swap", preload: false });
const tenor = Tenor_Sans({ subsets: ["latin"], weight: "400", variable: "--font-tenor", display: "swap", preload: false });
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap", preload: false });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap", preload: false });
const karla = Karla({ subsets: ["latin"], variable: "--font-karla", display: "swap", preload: false });
const workSans = Work_Sans({ subsets: ["latin"], variable: "--font-work-sans", display: "swap", preload: false });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap", preload: false });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });

const fonts = {
  cormorant, playfair, bodoni, "dm-serif": dmSerif, fraunces, cinzel, italiana, marcellus, syne, "space-grotesk": spaceGrotesk, unbounded, bricolage, archivo,
  outfit, josefin, tenor, jost, inter, manrope, "dm-sans": dmSans, karla, "work-sans": workSans, figtree, nunito, lora,
};

export const fontVariables = Object.values(fonts).map((f) => f.variable).join(" ");

/** Each font's family name in the built stylesheet, by its key in lib/theme.ts. */
export const fontFamilies: Record<keyof typeof fonts, string> = Object.fromEntries(
  Object.entries(fonts).map(([key, f]) => [key, f.style.fontFamily.split(",")[0].replace(/['"]/g, "").trim()]),
) as Record<keyof typeof fonts, string>;
