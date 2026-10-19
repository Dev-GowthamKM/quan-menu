import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/store/listing/ProductListing";
import ContactForm from "@/components/store/ContactForm";
import { contactOf, getSettings } from "@/lib/settings";

export const revalidate = 300;
export const metadata: Metadata = { title: "Contact us", description: "Get in touch about an order, sizing or anything else.", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const contact = contactOf(await getSettings());
  return (
    <div className="container-page pt-8 md:pt-12">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Contact" }]} />
      <div className="mt-10 grid gap-14 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <h1 className="font-serif text-5xl">Contact us</h1>
          <p className="mt-5 max-w-md leading-relaxed text-taupe">
            Questions about an order, sizing or a return? Write to us and a real person will reply within one working day.
          </p>
          <dl className="mt-10 grid gap-6 text-sm">
            {contact.email && (
              <div><dt className="label-caps text-stone">Email</dt><dd className="mt-1"><a href={`mailto:${contact.email}`} className="underline underline-offset-4">{contact.email}</a></dd></div>
            )}
            {contact.phone && (
              <div><dt className="label-caps text-stone">Phone</dt><dd className="mt-1">{contact.phone}</dd></div>
            )}
            {contact.whatsapp && (
              <div><dt className="label-caps text-stone">WhatsApp</dt><dd className="mt-1">{contact.whatsapp}</dd></div>
            )}
            {contact.hours && (
              <div><dt className="label-caps text-stone">Hours</dt><dd className="mt-1">{contact.hours}</dd></div>
            )}
            {contact.address && (
              <div><dt className="label-caps text-stone">Studio</dt><dd className="mt-1 whitespace-pre-line">{contact.address}</dd></div>
            )}
          </dl>
        </div>
        <ContactForm />
      </div>
    </div>
  );
}
