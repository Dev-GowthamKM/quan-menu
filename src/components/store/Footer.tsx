import Link from "next/link";
import type { Department } from "@/lib/catalog";
import { contactOf, socialOf, type Settings } from "@/lib/settings";
import NewsletterForm from "./NewsletterForm";

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  pinterest: "Pinterest",
  youtube: "YouTube",
};

export default function Footer({ settings, departments }: { settings: Settings; departments: Department[] }) {
  const contact = contactOf(settings);
  const social = Object.entries(socialOf(settings)).filter(([, url]) => url && /^https?:\/\//.test(url));
  const year = new Date().getFullYear();

  return (
    <footer className="on-brand mt-24 bg-brand text-on-brand">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <p className="font-serif text-3xl">Join the {settings.store_name} list</p>
          <p className="mt-3 text-sm leading-relaxed text-on-brand-soft">
            New collections, early access to the sale and stories from the makers. No more than twice a month.
          </p>
          <NewsletterForm dark />
        </div>
        <FooterColumn title="Shop">
          <FooterLink href="/shop?sort=newest">New arrivals</FooterLink>
          {departments.map((d) => (
            <FooterLink key={d.id} href={`/category/${d.slug}`}>{d.name}</FooterLink>
          ))}
          <FooterLink href="/brands">Brands</FooterLink>
          <FooterLink href="/collections">Collections</FooterLink>
          <FooterLink href="/shop?sale=1">Sale</FooterLink>
        </FooterColumn>
        <FooterColumn title="Customer care">
          <FooterLink href="/contact">Contact us</FooterLink>
          <FooterLink href="/faq">FAQs</FooterLink>
          <FooterLink href="/orders/lookup">Track your order</FooterLink>
          <FooterLink href="/pages/shipping">Shipping &amp; delivery</FooterLink>
          <FooterLink href="/pages/returns">Returns &amp; refunds</FooterLink>
          <FooterLink href="/account">My account</FooterLink>
        </FooterColumn>
        <FooterColumn title={settings.store_name}>
          <FooterLink href="/pages/about">Our story</FooterLink>
          <FooterLink href="/pages/privacy">Privacy policy</FooterLink>
          <FooterLink href="/pages/terms">Terms of service</FooterLink>
          {contact.email && <FooterLink href={`mailto:${contact.email}`}>{contact.email}</FooterLink>}
          {contact.phone && <li className="text-sm text-on-brand-soft">{contact.phone}</li>}
          {contact.hours && <li className="text-xs text-on-brand-soft">{contact.hours}</li>}
        </FooterColumn>
      </div>
      <div className="border-t border-on-brand/15">
        <div className="container-page flex flex-col gap-4 py-6 text-xs text-on-brand-soft md:flex-row md:items-center md:justify-between">
          <p>
            © {year} {settings.store_name}. All prices in {settings.currency}
            {settings.tax_mode === "inclusive" ? `, inclusive of ${settings.tax_label}` : ""}.
            {settings.gstin ? ` GSTIN ${settings.gstin}.` : ""}
          </p>
          <p>Secure payments: UPI · Cards · Net banking · Wallets{settings.cod_enabled ? " · Cash on delivery" : ""}</p>
          {social.length > 0 && (
            <ul className="flex gap-4">
              {social.map(([key, url]) => (
                <li key={key}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-on-brand">{SOCIAL_LABELS[key] ?? key}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-caps text-on-brand">{title}</p>
      <ul className="mt-4 grid gap-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-sm text-on-brand-soft hover:text-on-brand">{children}</Link>
    </li>
  );
}
