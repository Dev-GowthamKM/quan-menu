"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createStore } from "@/server/admin/platform";
import { THEME_PRESETS } from "@/lib/theme";
import { Button, cx } from "../../ui/controls";
import { TextField } from "../fields";
import { useToast } from "../Toaster";
import { Card } from "../ui";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");

/** Platform › New store: name, web address, owner and a starting look. */
export default function NewStoreForm({ vercel }: { vercel: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ name: "", slug: "", order_prefix: "", hostname: "", owner_email: "", tagline: "", theme: THEME_PRESETS[0].key });
  const slug = v.slug || slugify(v.name);
  const prefix = v.order_prefix || slug.replace(/[^a-z]/g, "").slice(0, 2).toUpperCase();

  return (
    <form
      className="grid max-w-3xl gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createStore(v);
          if (!res.ok) {
            setError(res.error);
            return toast(res.error, "error");
          }
          setError(null);
          toast(res.data.domain ? `${res.message} ${res.data.domain}` : res.message ?? "Store created.");
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
        <div role="radiogroup" aria-label="Starting look" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {THEME_PRESETS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={v.theme === t.key}
              onClick={() => setV({ ...v, theme: t.key })}
              className={cx("rounded-lg border p-3 text-left transition", v.theme === t.key ? "border-ink ring-2 ring-ink" : "border-black/15 hover:border-black/40")}
            >
              <span className="flex h-12 overflow-hidden rounded-md" style={{ background: t.colors.background }}>
                <span className="w-1/3" style={{ background: t.colors.brand }} />
                <span className="grid flex-1 place-items-center text-lg" style={{ color: t.colors.text, fontStyle: t.heading_italic ? "italic" : "normal", fontFamily: "Georgia, serif" }}>Aa</span>
                <span className="w-3" style={{ background: t.colors.accent }} />
              </span>
              <span className="mt-2 block text-sm font-medium">{t.name}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone">The owner can change colours, fonts and everything else in the store&apos;s Settings › Appearance.</p>
      </Card>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div>
        <Button type="submit" busy={pending}>Create store</Button>
      </div>
    </form>
  );
}
