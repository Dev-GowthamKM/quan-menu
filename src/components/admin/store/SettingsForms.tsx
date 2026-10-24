"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { deleteSampleData, saveSettings, type SettingsSection } from "@/server/admin/store";
import { formatMoney, fromMinor, toMinor } from "@/lib/money";
import type { ContactInfo, FaqItem, HeroSlide, Homepage, Policies, Promo, SocialLinks, StoreSettings } from "@/lib/types";
import { HEADING_WEIGHT, isHexColor, THEME_PRESETS, themeOf, themeTokens, themeWarnings, type BodyFont, type HeadingFont, type ThemePreset } from "@/lib/theme";
import { Button, buttonClass, cx, Notice } from "../../ui/controls";
import { CloseIcon, PlusIcon } from "../../ui/icons";
import { SelectField, TextArea, TextField, Toggle } from "../fields";
import { SingleImageField } from "../ImageManager";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

function useSave(section: SettingsSection) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (values: unknown) =>
    start(async () => {
      const res = await saveSettings(section, values);
      if (!res.ok) {
        setError(res.error);
        return toast(res.error, "error");
      }
      setError(null);
      toast("Settings saved.");
      router.refresh();
    });
  return { pending, error, save };
}

function Form({ children, onSubmit, pending, error, note }: { children: ReactNode; onSubmit: () => void; pending: boolean; error: string | null; note?: ReactNode }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="grid gap-5"
    >
      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}
      {children}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-black/10 bg-[#f5f5f3]/95 px-1 py-3 backdrop-blur">
        <Button type="submit" size="sm" busy={pending}>Save changes</Button>
        {note && <span className="text-xs text-stone">{note}</span>}
      </div>
    </form>
  );
}

export function GeneralForm({ s }: { s: StoreSettings }) {
  const { pending, error, save } = useSave("general");
  const [v, setV] = useState({ store_name: s.store_name, tagline: s.tagline, logo_url: s.logo_url, contact: (s.contact ?? {}) as ContactInfo, social: (s.social ?? {}) as SocialLinks });
  const contact = (k: keyof ContactInfo, val: string) => setV({ ...v, contact: { ...v.contact, [k]: val } });
  const social = (k: keyof SocialLinks, val: string) => setV({ ...v, social: { ...v.social, [k]: val } });
  return (
    <Form onSubmit={() => save(v)} pending={pending} error={error}>
      <Card title="Store">
        <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
          <div className="grid content-start gap-4">
            <TextField label="Store name" value={v.store_name} onChange={(e) => setV({ ...v, store_name: e.target.value })} maxLength={80} required />
            <TextField label="Tagline" value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} maxLength={160} hint="Shown in the footer and used for search results." />
          </div>
          <SingleImageField label="Logo (optional)" value={v.logo_url} onChange={(url) => setV({ ...v, logo_url: url })} folder="brand" aspect="aspect-[3/1]" />
        </div>
        <p className="mt-2 text-xs text-stone">Without a logo the store name is set in the heading font. Use your own artwork only.</p>
      </Card>
      <Card title="Contact details">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Email" type="email" value={v.contact.email ?? ""} onChange={(e) => contact("email", e.target.value)} />
          <TextField label="Phone" value={v.contact.phone ?? ""} onChange={(e) => contact("phone", e.target.value)} />
          <TextField label="WhatsApp" value={v.contact.whatsapp ?? ""} onChange={(e) => contact("whatsapp", e.target.value)} placeholder="+91…" />
          <TextField label="Hours" value={v.contact.hours ?? ""} onChange={(e) => contact("hours", e.target.value)} placeholder="Mon–Sat, 10am–7pm IST" />
          <TextArea label="Address (also printed on invoices)" value={v.contact.address ?? ""} onChange={(e) => contact("address", e.target.value)} rows={3} className="md:col-span-2" />
        </div>
      </Card>
      <Card title="Social links">
        <div className="grid gap-4 md:grid-cols-2">
          {(["instagram", "facebook", "x", "pinterest", "youtube"] as const).map((k) => (
            <TextField key={k} label={k === "x" ? "X (Twitter)" : k[0].toUpperCase() + k.slice(1)} type="url" value={v.social[k] ?? ""} onChange={(e) => social(k, e.target.value)} placeholder="https://" />
          ))}
        </div>
      </Card>
    </Form>
  );
}

const HEADING: Record<HeadingFont, string> = { cormorant: "Cormorant Garamond", playfair: "Playfair Display", bodoni: "Bodoni Moda", "dm-serif": "DM Serif Display" };
const BODY: Record<BodyFont, string> = { jost: "Jost", inter: "Inter", manrope: "Manrope", "dm-sans": "DM Sans" };
const FONT_VAR: Record<string, string> = {
  cormorant: "var(--font-cormorant)", playfair: "var(--font-playfair)", bodoni: "var(--font-bodoni)", "dm-serif": "var(--font-dm-serif)",
  jost: "var(--font-jost)", inter: "var(--font-inter)", manrope: "var(--font-manrope)", "dm-sans": "var(--font-dm-sans)",
};

interface Look {
  primary_color: string;
  brand_color: string;
  accent_color: string;
  background_color: string;
  heading_font: HeadingFont;
  heading_italic: boolean;
  body_font: BodyFont;
}

const lookOf = (p: ThemePreset): Look => ({
  primary_color: p.colors.text,
  brand_color: p.colors.brand,
  accent_color: p.colors.accent,
  background_color: p.colors.background,
  heading_font: p.heading_font,
  heading_italic: p.heading_italic,
  body_font: p.body_font,
});

const sameLook = (a: Look, b: Look) =>
  (Object.keys(a) as (keyof Look)[]).every((k) => String(a[k]).toLowerCase() === String(b[k]).toLowerCase());

export function AppearanceForm({ s }: { s: StoreSettings }) {
  const { pending, error, save } = useSave("appearance");
  // brand_color and heading_italic arrive with the theme database update; until then the
  // form starts from what the store shows (themeOf).
  const updated = s.brand_color != null && s.heading_italic != null;
  const current = themeOf(s);
  const [v, setV] = useState<Look>({
    primary_color: current.colors.text,
    brand_color: current.colors.brand,
    accent_color: current.colors.accent,
    background_color: current.colors.background,
    heading_font: s.heading_font as HeadingFont,
    heading_italic: current.italic,
    body_font: s.body_font as BodyFont,
  });
  const colors = { text: v.primary_color, brand: v.brand_color, accent: v.accent_color, background: v.background_color };
  const valid = Object.values(colors).every(isHexColor);
  const warnings = valid ? themeWarnings(colors) : [];
  const accentShown = valid ? themeTokens(colors)["--color-accent"] : v.accent_color;
  const color = (k: "primary_color" | "brand_color" | "accent_color" | "background_color", label: string, hint: string) => (
    <div className="grid content-start gap-1.5">
      <span className="text-xs font-medium text-taupe">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={isHexColor(v[k]) ? v[k] : "#000000"} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-label={label} className="size-9 cursor-pointer rounded border border-black/15 bg-white p-0.5" />
        <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.trim() })} aria-label={`${label} hex`} className={cx(adminInput, "w-28 font-mono")} maxLength={7} />
      </div>
      <span className="text-xs text-stone">{hint}</span>
    </div>
  );
  return (
    <Form onSubmit={() => save(v)} pending={pending} error={error} note={!updated ? "Saving needs the database update below." : undefined}>
      {!updated && (
        <Notice tone="warning">
          One more step before these can be saved: run the latest database update (the file <code className="font-mono text-xs">update-after-20261022000100.sql</code>) in Supabase › SQL Editor. Until then the store shows italic headings with your current colours.
        </Notice>
      )}
      <Card title="Themes">
        <p className="mb-3 text-sm text-taupe">Start from a theme, then adjust anything below. Nothing changes on the store until you save.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {THEME_PRESETS.map((p) => {
            const look = lookOf(p);
            const active = sameLook(look, v);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => setV(look)}
                className={cx("rounded-md border p-2.5 text-left transition", active ? "border-ink ring-1 ring-ink" : "border-black/10 hover:border-black/30")}
              >
                <span className="flex h-16 overflow-hidden rounded-sm border border-black/5" style={{ background: p.colors.background }}>
                  <span className="w-[30%]" style={{ background: p.colors.brand }} />
                  <span
                    className="grid flex-1 place-items-center text-3xl leading-none"
                    style={{ color: p.colors.text, fontFamily: FONT_VAR[p.heading_font], fontStyle: p.heading_italic ? "italic" : "normal", fontWeight: HEADING_WEIGHT[p.heading_font] }}
                  >
                    Aa
                  </span>
                  <span className="w-2.5" style={{ background: p.colors.accent }} />
                </span>
                <span className="mt-2 block text-sm font-medium">{p.name}</span>
                <span className="block text-xs text-stone">{HEADING[p.heading_font]}{p.heading_italic ? " italic" : ""} · {BODY[p.body_font]}</span>
              </button>
            );
          })}
        </div>
      </Card>
      <Card title="Colours">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {color("primary_color", "Text", "Words and outlines. Keep it dark.")}
          {color("brand_color", "Buttons and bands", "Buttons, the announcement bar and the footer.")}
          {color("accent_color", "Accent", "Section labels and highlights.")}
          {color("background_color", "Background", "A light paper tone suits photography.")}
        </div>
        {valid && accentShown !== v.accent_color.toLowerCase() && (
          <p className="mt-4 flex items-center gap-2 text-xs text-stone">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: accentShown }} aria-hidden />
            Accent text is shown a little deeper ({accentShown}) so it stays readable on the background.
          </p>
        )}
        {!valid && <p className="mt-4 text-xs text-sale">Colours are hex codes like #6b1d2e.</p>}
        {warnings.length > 0 && (
          <Notice tone="warning" className="mt-4">
            {warnings.map((w) => <span key={w} className="block">{w}</span>)}
          </Notice>
        )}
      </Card>
      <Card title="Typography">
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField label="Headings" value={v.heading_font} onChange={(e) => setV({ ...v, heading_font: e.target.value as HeadingFont })}>
            {Object.entries(HEADING).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </SelectField>
          <SelectField label="Body text" value={v.body_font} onChange={(e) => setV({ ...v, body_font: e.target.value as BodyFont })}>
            {Object.entries(BODY).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </SelectField>
          <Toggle label="Italic headings" hint="Page titles, section headings and banners in the italic of the heading font." checked={v.heading_italic} onChange={(heading_italic) => setV({ ...v, heading_italic })} />
        </div>
      </Card>
      <Card title="Preview">
        <ThemePreview look={v} storeName={s.store_name} />
      </Card>
    </Form>
  );
}

/** A small storefront in the chosen look, built from the same tokens as the real one. */
function ThemePreview({ look, storeName }: { look: Look; storeName: string }) {
  const colors = { text: look.primary_color, brand: look.brand_color, accent: look.accent_color, background: look.background_color };
  if (!Object.values(colors).every(isHexColor)) return <p className="text-sm text-stone">Enter every colour as a hex code to see the preview.</p>;
  const style = {
    ...themeTokens(colors),
    "--font-serif": `${FONT_VAR[look.heading_font]}, Georgia, serif`,
    "--font-sans": `${FONT_VAR[look.body_font]}, ui-sans-serif, system-ui, sans-serif`,
    "--heading-style": look.heading_italic ? "italic" : "normal",
    "--heading-weight": String(HEADING_WEIGHT[look.heading_font]),
  } as React.CSSProperties;
  return (
    <div style={style} className="overflow-hidden rounded-md border border-black/10 bg-ivory font-sans text-ink" aria-label="Preview of the store">
      <p className="bg-brand px-4 py-1.5 text-center text-[10px] tracking-[0.16em] text-on-brand uppercase">Free delivery on orders over ₹2,999</p>
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3">
        <span className="font-serif text-xl leading-none tracking-[0.28em] uppercase">{storeName}</span>
        <span className="hidden text-[11px] tracking-[0.12em] uppercase sm:inline">New in · Women · Men · <span className="text-sale">Sale</span></span>
      </div>
      <div className="grid sm:grid-cols-[1fr_10rem]">
        <div className="bg-bone px-6 py-8">
          <p className="label-caps text-accent">The autumn edit</p>
          <p className="mt-3 font-serif text-4xl leading-none">The quiet season</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-taupe">Wool, cashmere and soft tailoring for cooler days.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={buttonClass("primary", "sm")}>Add to bag</span>
            <span className={buttonClass("secondary", "sm")}>Explore</span>
          </div>
        </div>
        <div className="hidden bg-sand sm:block" aria-hidden />
      </div>
      <div className="grid gap-1 bg-brand px-6 py-5 text-on-brand">
        <p className="font-serif text-xl">Join the {storeName} list</p>
        <p className="text-xs text-on-brand-soft">The footer: links, contact details and the newsletter.</p>
      </div>
    </div>
  );
}

const blankSlide: HeroSlide = { image_url: "", heading: "", eyebrow: "", subheading: "", cta_label: "Shop now", cta_href: "/shop" };
const blankPromo: Promo = { image_url: "", heading: "", eyebrow: "", cta_label: "Shop", cta_href: "/shop" };

export function HomepageForm({ s }: { s: StoreSettings }) {
  const { pending, error, save } = useSave("homepage");
  const initial = (s.homepage ?? {}) as Homepage;
  const [v, setV] = useState<Required<Homepage>>({ announcement: initial.announcement ?? "", hero: initial.hero ?? [], promos: initial.promos ?? [] });
  const setSlide = (i: number, p: Partial<HeroSlide>) => setV({ ...v, hero: v.hero.map((x, j) => (j === i ? { ...x, ...p, sample: false } : x)) });
  const setPromo = (i: number, p: Partial<Promo>) => setV({ ...v, promos: v.promos.map((x, j) => (j === i ? { ...x, ...p, sample: false } : x)) });
  const move = <T,>(list: T[], i: number, d: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
    return next;
  };
  const valid = () => [...v.hero, ...v.promos].every((x) => x.image_url && x.heading.trim());
  return (
    <Form onSubmit={() => (valid() ? save({ homepage: v }) : undefined)} pending={pending} error={error ?? (valid() ? null : "Every banner needs an image and a heading.")} note="Departments, new arrivals, best sellers, brands and collections fill in from your catalog.">
      <Card title="Announcement bar">
        <TextField label="Text (leave empty to hide)" value={v.announcement} onChange={(e) => setV({ ...v, announcement: e.target.value })} maxLength={200} placeholder="Free delivery on orders over ₹1,999" />
      </Card>
      <Card title="Hero campaign" actions={v.hero.length < 6 && <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={() => setV({ ...v, hero: [...v.hero, { ...blankSlide }] })}><PlusIcon size={11} /> Add slide</button>}>
        {v.hero.length === 0 && <p className="text-sm text-stone">No hero slides. The homepage starts with your departments.</p>}
        <div className="grid gap-5">
          {v.hero.map((h, i) => (
            <div key={i} className="grid gap-4 rounded-md border border-black/10 p-3 md:grid-cols-[14rem_1fr]">
              <SingleImageField label={`Slide ${i + 1} image`} value={h.image_url || null} onChange={(url) => setSlide(i, { image_url: url ?? "" })} folder="homepage" aspect="aspect-[16/10]" />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Small heading" value={h.eyebrow ?? ""} onChange={(e) => setSlide(i, { eyebrow: e.target.value })} maxLength={80} placeholder="Autumn / Winter 2026" />
                <TextField label="Heading" value={h.heading} onChange={(e) => setSlide(i, { heading: e.target.value })} maxLength={120} required />
                <TextArea label="Text" value={h.subheading ?? ""} onChange={(e) => setSlide(i, { subheading: e.target.value })} rows={2} maxLength={300} className="sm:col-span-2" />
                <TextField label="Button label" value={h.cta_label ?? ""} onChange={(e) => setSlide(i, { cta_label: e.target.value })} maxLength={40} />
                <TextField label="Button link" value={h.cta_href ?? ""} onChange={(e) => setSlide(i, { cta_href: e.target.value })} maxLength={300} placeholder="/collections/autumn-winter-26" />
                <TextField label="Image description" value={h.image_alt ?? ""} onChange={(e) => setSlide(i, { image_alt: e.target.value })} maxLength={200} className="sm:col-span-2" hint="For screen readers." />
                <div className="flex gap-3 text-xs sm:col-span-2">
                  <button type="button" className="underline disabled:opacity-30" disabled={i === 0} onClick={() => setV({ ...v, hero: move(v.hero, i, -1) })}>Move up</button>
                  <button type="button" className="underline disabled:opacity-30" disabled={i === v.hero.length - 1} onClick={() => setV({ ...v, hero: move(v.hero, i, 1) })}>Move down</button>
                  <button type="button" className="ml-auto text-red-700 underline" onClick={() => setV({ ...v, hero: v.hero.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Promotional banners" actions={v.promos.length < 6 && <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={() => setV({ ...v, promos: [...v.promos, { ...blankPromo }] })}><PlusIcon size={11} /> Add banner</button>}>
        {v.promos.length === 0 && <p className="text-sm text-stone">No promotional banners.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {v.promos.map((p, i) => (
            <div key={i} className="grid gap-3 rounded-md border border-black/10 p-3">
              <SingleImageField label={`Banner ${i + 1}`} value={p.image_url || null} onChange={(url) => setPromo(i, { image_url: url ?? "" })} folder="homepage" aspect="aspect-[4/3]" />
              <TextField label="Small heading" value={p.eyebrow ?? ""} onChange={(e) => setPromo(i, { eyebrow: e.target.value })} maxLength={80} />
              <TextField label="Heading" value={p.heading} onChange={(e) => setPromo(i, { heading: e.target.value })} maxLength={120} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Link label" value={p.cta_label ?? ""} onChange={(e) => setPromo(i, { cta_label: e.target.value })} maxLength={40} />
                <TextField label="Link" value={p.cta_href ?? ""} onChange={(e) => setPromo(i, { cta_href: e.target.value })} maxLength={300} />
              </div>
              <button type="button" className="justify-self-end text-xs text-red-700 underline" onClick={() => setV({ ...v, promos: v.promos.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          ))}
        </div>
      </Card>
    </Form>
  );
}

interface Slab { up_to: number | null; rate_bps: number }

export function CheckoutForm({ s, razorpayReady, stripeReady, home }: { s: StoreSettings; razorpayReady: boolean; stripeReady: boolean; home: boolean }) {
  const { pending, error, save } = useSave("checkout");
  const [v, setV] = useState({
    tax_mode: s.tax_mode, tax_label: s.tax_label, gstin: s.gstin,
    slabs: ((s.tax_slabs ?? []) as unknown as Slab[]).map((x) => ({ up_to: fromMinor(x.up_to), rate: String(x.rate_bps / 100) })),
    free: fromMinor(s.free_shipping_threshold), low: String(s.low_stock_threshold), hold: String(s.reservation_minutes),
    razorpay: s.razorpay_enabled, stripe: s.stripe_enabled, cod: s.cod_enabled, cod_fee: fromMinor(s.cod_fee), cod_min: fromMinor(s.cod_min_order), cod_max: fromMinor(s.cod_max_order),
    cod_confirm: s.cod_confirmation, cod_hours: String(s.cod_confirm_hours), cod_open: s.cod_max_open_orders == null ? "" : String(s.cod_max_open_orders),
    cod_returned: s.cod_max_returned == null ? "" : String(s.cod_max_returned),
    return_days: String(s.return_window_days), return_shipping: s.return_shipping, return_fee: fromMinor(s.return_shipping_fee),
    reviews: s.reviews_enabled, reviews_purchase: s.reviews_require_purchase, reviews_auto: s.reviews_auto_publish,
  });
  const submit = () => {
    const slabs = v.slabs.map((x, i) => ({ up_to: i === v.slabs.length - 1 ? null : toMinor(x.up_to), rate_bps: Math.round(Number(x.rate) * 100) }));
    save({
      currency: "INR", tax_mode: v.tax_mode, tax_label: v.tax_label, gstin: v.gstin.trim().toUpperCase(), tax_slabs: slabs,
      free_shipping_threshold: v.free.trim() ? toMinor(v.free) : null, low_stock_threshold: Number(v.low) || 0, reservation_minutes: Number(v.hold) || 30,
      razorpay_enabled: v.razorpay, stripe_enabled: v.stripe, cod_enabled: v.cod, cod_fee: toMinor(v.cod_fee) ?? 0, cod_min_order: toMinor(v.cod_min) ?? 0,
      cod_max_order: toMinor(v.cod_max) ?? 0, return_window_days: Number(v.return_days) || 0, return_shipping: v.return_shipping, return_shipping_fee: toMinor(v.return_fee) ?? 0,
      cod_confirmation: v.cod_confirm, cod_confirm_hours: Number(v.cod_hours) || 24,
      cod_max_open_orders: v.cod_open.trim() ? Number(v.cod_open) : null, cod_max_returned: v.cod_returned.trim() ? Number(v.cod_returned) : null,
      reviews_enabled: v.reviews, reviews_require_purchase: v.reviews_purchase, reviews_auto_publish: v.reviews_auto,
    });
  };
  return (
    <Form onSubmit={submit} pending={pending} error={error} note="Prices, tax and shipping are always recalculated on the server at checkout.">
      <Card title="Tax">
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField label="Prices" value={v.tax_mode} onChange={(e) => setV({ ...v, tax_mode: e.target.value })}>
            <option value="inclusive">Include tax (MRP style)</option>
            <option value="exclusive">Exclude tax (added at checkout)</option>
            <option value="none">No tax</option>
          </SelectField>
          <TextField label="Tax name" value={v.tax_label} onChange={(e) => setV({ ...v, tax_label: e.target.value })} maxLength={20} />
          <TextField label="GSTIN" value={v.gstin} onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase() })} maxLength={15} placeholder="Printed on invoices" className="font-mono" />
        </div>
        <p className="mt-4 text-xs font-medium text-taupe">Rate by selling price per piece</p>
        <ul className="mt-2 grid gap-2">
          {v.slabs.map((slab, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              {i === v.slabs.length - 1 ? <span className="w-44 text-taupe">{i === 0 ? "Every price" : "Above that"}</span> : (
                <span className="flex items-center gap-1.5">Up to ₹<input aria-label={`Slab ${i + 1} upper limit`} value={slab.up_to} onChange={(e) => setV({ ...v, slabs: v.slabs.map((x, j) => (j === i ? { ...x, up_to: e.target.value } : x)) })} inputMode="decimal" className={cx(adminInput, "w-28")} /></span>
              )}
              <span className="flex items-center gap-1.5">at <input aria-label={`Slab ${i + 1} rate`} value={slab.rate} onChange={(e) => setV({ ...v, slabs: v.slabs.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)) })} inputMode="decimal" className={cx(adminInput, "w-20")} />%</span>
              {v.slabs.length > 1 && <button type="button" aria-label="Remove slab" onClick={() => setV({ ...v, slabs: v.slabs.filter((_, j) => j !== i) })} className="text-stone hover:text-red-700"><CloseIcon size={13} /></button>}
            </li>
          ))}
        </ul>
        {v.slabs.length < 6 && <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs underline" onClick={() => setV({ ...v, slabs: [{ up_to: "1000", rate: "5" }, ...v.slabs] })}><PlusIcon size={11} /> Add slab</button>}
        <p className="mt-3 text-xs text-stone">Defaults follow GST on apparel and footwear from 22 Sep 2025: 5% up to ₹2,500 per piece, 18% above. Check with your tax adviser; products can also set a fixed rate.</p>
      </Card>
      <Card title="Payment methods">
        <div className="grid gap-3">
          <Toggle
            label="Razorpay (UPI, cards, netbanking, wallets)"
            hint={razorpayReady ? "API keys are set." : <>Add the store&apos;s Razorpay keys in <a href="/admin/settings?tab=payments" className="underline">Payment accounts</a> to take online payments.</>}
            checked={v.razorpay}
            onChange={(x) => setV({ ...v, razorpay: x })}
          />
          {home && <Toggle label="Stripe (international cards)" hint={stripeReady ? "API keys are set." : "Optional. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable."} checked={v.stripe} onChange={(x) => setV({ ...v, stripe: x })} />}
          <Toggle label="Cash on delivery" checked={v.cod} onChange={(x) => setV({ ...v, cod: x })} />
          {v.cod && (
            <div className="grid gap-4 pl-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField label="COD fee (₹)" value={v.cod_fee} onChange={(e) => setV({ ...v, cod_fee: e.target.value })} inputMode="decimal" />
                <TextField label="Minimum order (₹)" value={v.cod_min} onChange={(e) => setV({ ...v, cod_min: e.target.value })} inputMode="decimal" />
                <TextField label="Maximum order (₹)" value={v.cod_max} onChange={(e) => setV({ ...v, cod_max: e.target.value })} inputMode="decimal" />
              </div>
              <Toggle
                label="Ask customers to confirm cash-on-delivery orders"
                hint="The order page and confirmation email ask them to confirm; nothing can be packed until they do (or you confirm it for them)."
                checked={v.cod_confirm}
                onChange={(x) => setV({ ...v, cod_confirm: x })}
              />
              <div className="grid gap-3 sm:grid-cols-3">
                {v.cod_confirm && (
                  <TextField label="Cancel if not confirmed within (hours)" value={v.cod_hours} onChange={(e) => setV({ ...v, cod_hours: e.target.value })} inputMode="numeric" hint="Stock goes back on sale." />
                )}
                <TextField label="Most cash orders waiting per customer" value={v.cod_open} onChange={(e) => setV({ ...v, cod_open: e.target.value })} inputMode="numeric" placeholder="No limit" hint="Counted by account, email or phone." />
                <TextField label="No COD after this many returned parcels" value={v.cod_returned} onChange={(e) => setV({ ...v, cod_returned: e.target.value })} inputMode="numeric" placeholder="Never" hint="Parcels that came back undelivered." />
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card title="Shipping and stock">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Free delivery over (₹)" value={v.free} onChange={(e) => setV({ ...v, free: e.target.value })} inputMode="decimal" placeholder="Off" hint={v.free ? `Orders from ${formatMoney(toMinor(v.free) ?? 0)} ship free.` : "Rates may still offer their own."} />
          <TextField label="Low stock alert at" value={v.low} onChange={(e) => setV({ ...v, low: e.target.value })} inputMode="numeric" hint="Units available, per variant." />
          <TextField label="Hold stock for unpaid orders (minutes)" value={v.hold} onChange={(e) => setV({ ...v, hold: e.target.value })} inputMode="numeric" hint="Between 10 and 180." />
        </div>
      </Card>
      <Card title="Returns">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Return window (days after delivery)" value={v.return_days} onChange={(e) => setV({ ...v, return_days: e.target.value })} inputMode="numeric" />
          <SelectField label="Return shipping" value={v.return_shipping} onChange={(e) => setV({ ...v, return_shipping: e.target.value })}>
            <option value="free">Free for the customer</option>
            <option value="customer_pays">Customer sends it back</option>
            <option value="deducted">Fee taken from the refund</option>
          </SelectField>
          {v.return_shipping === "deducted" && <TextField label="Return fee (₹)" value={v.return_fee} onChange={(e) => setV({ ...v, return_fee: e.target.value })} inputMode="decimal" />}
        </div>
      </Card>
      <Card title="Reviews">
        <div className="grid gap-3">
          <Toggle label="Customers can review products" checked={v.reviews} onChange={(x) => setV({ ...v, reviews: x })} />
          <Toggle label="Only customers who bought the product" checked={v.reviews_purchase} onChange={(x) => setV({ ...v, reviews_purchase: x })} />
          <Toggle label="Publish reviews without approval" checked={v.reviews_auto} onChange={(x) => setV({ ...v, reviews_auto: x })} />
        </div>
      </Card>
    </Form>
  );
}

export function ContentForm({ s }: { s: StoreSettings }) {
  const { pending, error, save } = useSave("content");
  const [policies, setPolicies] = useState((s.policies ?? {}) as Policies);
  const [faq, setFaq] = useState(((s.faq ?? []) as unknown as FaqItem[]).map((f) => ({ ...f })));
  const PAGES: { key: keyof Policies; label: string }[] = [
    { key: "shipping", label: "Shipping policy" }, { key: "returns", label: "Returns and refunds" }, { key: "privacy", label: "Privacy policy" },
    { key: "terms", label: "Terms of service" }, { key: "about", label: "About us" },
  ];
  return (
    <Form onSubmit={() => save({ policies, faq: faq.filter((f) => f.q.trim() && f.a.trim()) })} pending={pending} error={error} note="Shown at /pages/… and in the footer. Blank lines start new paragraphs.">
      <Card title="Policy pages">
        <div className="grid gap-4">
          {PAGES.map((p) => <TextArea key={p.key} label={p.label} value={policies[p.key] ?? ""} onChange={(e) => setPolicies({ ...policies, [p.key]: e.target.value })} rows={6} maxLength={20000} />)}
        </div>
      </Card>
      <Card title="FAQ" actions={<button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={() => setFaq([...faq, { q: "", a: "" }])}><PlusIcon size={11} /> Add question</button>}>
        <ul className="grid gap-4">
          {faq.map((f, i) => (
            <li key={i} className="grid gap-2 rounded-md border border-black/10 p-3">
              <TextField label={`Question ${i + 1}`} value={f.q} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} maxLength={300} />
              <TextArea label="Answer" value={f.a} onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} rows={3} maxLength={3000} />
              <button type="button" className="justify-self-end text-xs text-red-700 underline" onClick={() => setFaq(faq.filter((_, j) => j !== i))}>Remove</button>
            </li>
          ))}
        </ul>
      </Card>
    </Form>
  );
}

export function SeoForm({ s }: { s: StoreSettings }) {
  const { pending, error, save } = useSave("seo");
  const [v, setV] = useState({ seo_title: s.seo_title, seo_description: s.seo_description, og_image_url: s.og_image_url });
  return (
    <Form onSubmit={() => save(v)} pending={pending} error={error} note="Products, categories, brands and collections have their own SEO fields.">
      <Card title="Homepage search listing">
        <div className="grid gap-4">
          <TextField label={<span className="flex justify-between">Title <span className="font-normal text-stone">{v.seo_title.length}/70</span></span>} value={v.seo_title} onChange={(e) => setV({ ...v, seo_title: e.target.value })} maxLength={120} />
          <TextArea label={<span className="flex justify-between">Description <span className="font-normal text-stone">{v.seo_description.length}/160</span></span>} value={v.seo_description} onChange={(e) => setV({ ...v, seo_description: e.target.value })} rows={3} maxLength={320} />
          <div className="max-w-sm"><SingleImageField label="Social sharing image (1200×630)" value={v.og_image_url} onChange={(url) => setV({ ...v, og_image_url: url })} folder="brand" aspect="aspect-[1200/630]" /></div>
        </div>
      </Card>
    </Form>
  );
}

const TEMPLATES: { key: string; label: string; vars: string }[] = [
  { key: "order_confirmation", label: "Order confirmed", vars: "{{customer_name}}, {{order_number}}, {{order_total}}, {{order_url}}, {{store_name}}" },
  { key: "order_shipped", label: "Order shipped", vars: "{{customer_name}}, {{order_number}}, {{carrier}}, {{tracking_number}}, {{tracking_url}}, {{order_url}}" },
  { key: "order_delivered", label: "Order delivered", vars: "{{customer_name}}, {{order_number}}, {{order_url}}" },
  { key: "order_cancelled", label: "Order cancelled", vars: "{{customer_name}}, {{order_number}}, {{order_url}}" },
  { key: "refund_processed", label: "Refund processed", vars: "{{customer_name}}, {{order_number}}, {{refund_amount}}, {{order_url}}" },
  { key: "return_update", label: "Return update", vars: "{{customer_name}}, {{order_number}}, {{return_status}}, {{order_url}}" },
  { key: "back_in_stock", label: "Back in stock", vars: "{{product_title}}, {{variant}} (\" in Black, size M\"), {{product_url}}, {{store_name}}" },
  { key: "cart_reminder", label: "Bag reminder", vars: "{{store_name}}, {{cart_url}}" },
  { key: "price_drop", label: "Wishlist price drop", vars: "{{store_name}}, {{wishlist_url}}" },
];

export function RemindersForm({ s, waiting }: { s: StoreSettings; waiting: number }) {
  const { pending, error, save } = useSave("reminders");
  const [v, setV] = useState({ stock: s.stock_alerts_enabled, cart: s.cart_reminders_enabled, hours: String(s.cart_reminder_hours), price: s.price_alerts_enabled });
  return (
    <Form
      onSubmit={() => save({ stock_alerts_enabled: v.stock, cart_reminders_enabled: v.cart, cart_reminder_hours: Number(v.hours) || 3, price_alerts_enabled: v.price })}
      pending={pending}
      error={error}
      note="Bag and price emails include an unsubscribe link; back-in-stock emails go once to people who asked."
    >
      <Card title="Reminders">
        <div className="grid gap-4">
          <Toggle
            label="Back-in-stock alerts"
            hint={`Product pages offer "Notify me" for sold-out sizes; one email goes out when the size is back. ${waiting} ${waiting === 1 ? "request is" : "requests are"} waiting.`}
            checked={v.stock}
            onChange={(x) => setV({ ...v, stock: x })}
          />
          <Toggle
            label="Remind shoppers about a bag left behind"
            hint="One email to signed-in customers, or guests who reached checkout, with a link that restores the bag on any device."
            checked={v.cart}
            onChange={(x) => setV({ ...v, cart: x })}
          />
          {v.cart && (
            <div className="pl-6 sm:w-64">
              <TextField label="Send after (hours without changes)" value={v.hours} onChange={(e) => setV({ ...v, hours: e.target.value })} inputMode="numeric" />
            </div>
          )}
          <Toggle
            label="Wishlist price-drop emails"
            hint="For customers who turn them on on their wishlist page: products at least 5% cheaper, at most one email every three days."
            checked={v.price}
            onChange={(x) => setV({ ...v, price: x })}
          />
        </div>
      </Card>
    </Form>
  );
}

export function EmailsForm({ s, emailReady }: { s: StoreSettings; emailReady: boolean }) {
  const { pending, error, save } = useSave("emails");
  const [t, setT] = useState(((s.email_templates ?? {}) as Record<string, { subject: string; body: string }>));
  const set = (key: string, p: Partial<{ subject: string; body: string }>) => setT({ ...t, [key]: { subject: t[key]?.subject ?? "", body: t[key]?.body ?? "", ...p } });
  return (
    <Form onSubmit={() => save({ email_templates: Object.fromEntries(Object.entries(t).filter(([, x]) => x.subject.trim())) })} pending={pending} error={error} note="Order emails get a button to the order page (the confirmation also lists the items); reminders list their products.">
      {!emailReady && <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">Emails are queued but not sent until RESEND_API_KEY and EMAIL_FROM are set on the server (see the README).</p>}
      {TEMPLATES.map((x) => (
        <Card key={x.key} title={x.label}>
          <div className="grid gap-3">
            <TextField label="Subject" value={t[x.key]?.subject ?? ""} onChange={(e) => set(x.key, { subject: e.target.value })} maxLength={200} placeholder="Leave empty to use the built-in text" />
            <TextArea label="Message" value={t[x.key]?.body ?? ""} onChange={(e) => set(x.key, { body: e.target.value })} rows={5} maxLength={5000} hint={`You can use ${x.vars}.`} />
          </div>
        </Card>
      ))}
    </Form>
  );
}

export function MaintenanceForm({ s, sampleCount }: { s: StoreSettings; sampleCount: number }) {
  const { pending, error, save } = useSave("maintenance");
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState({ maintenance_mode: s.maintenance_mode, maintenance_message: s.maintenance_message });
  const [deleting, startDelete] = useTransition();
  return (
    <div className="grid gap-5">
      <Form onSubmit={() => save(v)} pending={pending} error={error}>
        <Card title="Maintenance mode">
          <Toggle label="Show a maintenance page to customers" hint="Staff who are signed in can still browse and test the store. Takes up to 30 seconds to apply." checked={v.maintenance_mode} onChange={(x) => setV({ ...v, maintenance_mode: x })} />
          <TextArea className="mt-3" label="Message" value={v.maintenance_message} onChange={(e) => setV({ ...v, maintenance_message: e.target.value })} rows={2} maxLength={500} />
        </Card>
      </Form>
      <Card title="Sample data">
        <p className="text-sm">{sampleCount ? `The store includes ${sampleCount} sample products, plus sample brands, categories, collections, discount codes and homepage banners, all marked "Sample" in the admin.` : "There is no sample catalog data left."}</p>
        {sampleCount > 0 && (
          <>
            <p className="mt-2 text-sm text-taupe">Remove them before launch. Sample items that appear in orders are archived instead, so order history stays intact. Your own products are never touched.</p>
            <Button
              size="sm"
              variant="danger"
              className="mt-3"
              busy={deleting}
              onClick={() => {
                if (!window.confirm("Delete all sample products and content? This can't be undone.")) return;
                startDelete(async () => {
                  const res = await deleteSampleData();
                  toast(res.ok ? res.message ?? "Done." : res.error, res.ok ? "ok" : "error");
                  router.refresh();
                });
              }}
            >
              Delete sample data
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
