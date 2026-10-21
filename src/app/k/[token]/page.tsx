import type { Metadata } from "next";
import OwnerQuick, { type QuickData } from "@/components/OwnerQuick";
import { LangSwitch, UiProvider } from "@/components/Ui";
import { DEMO } from "@/lib/config";
import { serverT, uiLang } from "@/lib/server-ui";
import { supabasePublic } from "@/lib/supabase/public";
import { SIZE_KEYS, type SizeKey } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const ok = /^[0-9a-f]{32}$/.test(token);
  return {
    title: "Chủ quán · Quán",
    // The link is a key: keep it out of search engines and out of Referer headers.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    ...(ok ? { manifest: `/k/${token}/manifest.webmanifest` } : {}),
  };
}

type Row = Record<string, unknown>;
const obj = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** Reads the owner page's data, keeping only the fields it shows. */
async function load(token: string): Promise<QuickData | null> {
  if (DEMO || !/^[0-9a-f]{32}$/.test(token)) return null;
  const { data, error } = await supabasePublic().rpc("quick_menu", { p_token: token });
  // A database error isn't a bad link: show "try again" rather than "this link doesn't work".
  if (error) throw new Error(`Owner page could not be loaded: ${error.code} ${error.message}`);
  if (!data || typeof data !== "object") return null;
  const d = obj(data);
  const s = obj(d.stall);
  return {
    stall: { name: String(s.name ?? ""), slug: String(s.slug ?? ""), published: s.published === true },
    soldOut: list(s.sold_out).filter((n): n is string => typeof n === "string"),
    dishes: list(d.dishes).map(obj).map((x) => {
      const sizes = list(obj(x.opts).sizes).map(obj).filter((z) => SIZE_KEYS.includes(z.k as SizeKey));
      return {
        id: String(x.id),
        vi: String(x.vi ?? ""),
        price: Number(x.price) || 0,
        sizes: sizes.length >= 2 ? sizes.map((z) => ({ k: z.k as SizeKey, price: Number(z.price) || 0 })) : undefined,
      };
    }),
    views: { today: Number(obj(d.views).today) || 0, week: Number(obj(d.views).week) || 0 },
  };
}

export default async function OwnerPage({ params }: Params) {
  const { token } = await params;
  const [lang, t, data] = await Promise.all([uiLang(), serverT(), load(token)]);
  return (
    <UiProvider lang={lang}>
      <main className="page quick">
        <div className="wrap">
          <header className="top">
            <a className="logo" href="/">Quán<span>.</span></a>
            <LangSwitch />
          </header>
          {data ? (
            <OwnerQuick token={token} data={data} />
          ) : (
            <section className="card">
              <h1>{t.qBadTitle}</h1>
              <p>{t.qBadText}</p>
            </section>
          )}
        </div>
      </main>
    </UiProvider>
  );
}
