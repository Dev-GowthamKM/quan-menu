"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createStore } from "@/server/admin/platform";
import { describeLook, DESIGN_LIST, freshLook, type Look, type TakenLook } from "@/lib/designs";
import { paletteOf } from "@/lib/theme";
import { Button, cx } from "../../ui/controls";
import { TextField, Toggle } from "../fields";
import { useToast } from "../Toaster";
import DesignThumb from "../store/DesignThumb";
import { Card } from "../ui";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

/**
 * Platform › New store: name, web address, owner and a starting look. The look starts as one
 * no other store has (initial, worked out on the server); Shuffle finds another.
 */
export default function NewStoreForm({ vercel, taken, initial }: { vercel: boolean; taken: TakenLook[]; initial: Look }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ name: "", slug: "", order_prefix: "", hostname: "", owner_email: "", tagline: "", samples: false });
  const [look, setLook] = useState<Look>(initial);
  const palette = paletteOf(look.colors);
  const unique = !taken.some((t) => t.design === look.design && t.brand?.toLowerCase() === look.colors.brand.toLowerCase());
  const slug = v.slug || slugify(v.name);
  const prefix = v.order_prefix || slug.replace(/[^a-z]/g, "").slice(0, 2).toUpperCase();

  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createStore({ ...v, look });
          if (!res.ok) {
            setError(res.error);
            return toast(res.error, "error");
          }
          setError(null);
          toast([res.message ?? "Store created.", res.data.samples, res.data.domain].filter(Boolean).join(" "));
          router.push(`/admin/stores/${res.data.id}?created=1`);
        });
      }}
    >
      <Card title="The store">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField label="Store name" required maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Kesar Studio" />
          <TextField label="Tagline" maxLength={160} value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} placeholder="Shown on the home page" />
          <TextField
            label="Short name"
            maxLength={40}
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase() })}
            placeholder={slug || "kesar-studio"}
            hint="Used in the admin to tell stores apart. Lowercase letters, numbers and hyphens."
            inputClassName="font-mono"
          />
          <TextField
            label="Order numbers start with"
            maxLength={4}
            value={v.order_prefix}
            onChange={(e) => setV({ ...v, order_prefix: e.target.value.toUpperCase() })}
            placeholder={prefix || "KS"}
            hint={`2 to 4 letters: orders will be ${prefix || "KS"}100001, ${prefix || "KS"}100002…`}
            inputClassName="font-mono"
          />
        </div>
      </Card>

      <Card title="Web address">
        <div className="grid gap-3">
          <TextField
            label="Address customers will visit"
            value={v.hostname}
            onChange={(e) => setV({ ...v, hostname: e.target.value.trim().toLowerCase() })}
            placeholder="kesar-studio.vercel.app or shop.kesar.in"
            hint={
              vercel
                ? "It's added to the Vercel project for you. A free name ending in .vercel.app works straight away; your own domain also needs its DNS pointed at Vercel."
                : "After creating the store, add the same address in Vercel › your project › Settings › Domains. A free name ending in .vercel.app works straight away."
            }
            inputClassName="font-mono"
          />
          <p className="text-xs text-stone">
            So that sign-in emails link back to this store, also add <span className="font-mono">https://{v.hostname || "its-address"}/**</span> to Supabase › Authentication ›
            URL Configuration › Redirect URLs. You can add more addresses later.
          </p>
        </div>
      </Card>

      <Card title="Owner">
        <TextField
          label="Owner's email"
          type="email"
          value={v.owner_email}
          onChange={(e) => setV({ ...v, owner_email: e.target.value.trim() })}
          placeholder="Leave empty to own it yourself"
          hint="They need an account first (they can sign up on any store). Owners manage the store's staff, settings and payment account."
        />
      </Card>

      <Card title="Starting look">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <DesignThumb design={DESIGN_LIST.find((d) => d.key === look.design)!} colors={look.colors} heading={look.heading_font} italic={look.heading_italic} storeName={v.name || "Your store"} />
            <p className="mt-3 text-sm font-medium" aria-live="polite">{describeLook(look, palette?.name)}</p>
            <p className="mt-0.5 text-xs text-stone">{unique ? "No other store on the platform looks like this." : "Another store shares this design and colours; Shuffle for a look of its own."}</p>
          </div>
          <div className="grid content-start gap-3">
            <Button variant="secondary" onClick={() => setLook(freshLook(taken, Math.random, { avoid: look }))}>Shuffle</Button>
            <div role="radiogroup" aria-label="Design" className="grid grid-cols-2 gap-2">
              {DESIGN_LIST.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="radio"
                  aria-checked={look.design === d.key}
                  onClick={() => setLook(freshLook(taken, Math.random, { design: d.key, avoid: look }))}
                  className={cx("rounded-md border px-3 py-2 text-left text-sm transition", look.design === d.key ? "border-ink ring-2 ring-ink" : "border-black/15 hover:border-black/40")}
                >
                  {d.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone">Each design builds the store differently: header, home page, product cards, buttons and footer.</p>
          </div>
        </div>
        <p className="mt-4 text-xs text-stone">The owner can change the design, colours, fonts and everything else in the store&apos;s Settings › Appearance.</p>
      </Card>

      <Card title="Products">
        <Toggle
          label="Start with the sample catalog"
          hint="45 example products from six made-up labels, with photos, sizes, collections, discount codes and homepage banners, so the store looks complete straight away. They're marked as samples: remove them all in one click from the store's Settings › Maintenance and data."
          checked={v.samples}
          onChange={(x) => setV({ ...v, samples: x })}
        />
      </Card>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div>
        <Button type="submit" busy={pending}>Create store</Button>
      </div>
    </form>
  );
}
