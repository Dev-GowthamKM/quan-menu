import AccountMenu from "@/components/AccountMenu";
import { LangSwitch, UiProvider } from "@/components/Ui";
import { uiLang } from "@/lib/server-ui";
import { STRINGS } from "@/lib/strings";
import { DEMO } from "@/lib/config";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** The signed-in vendor (if any) and their live menu address, for the header. */
async function currentVendor() {
  if (DEMO) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  // An account can run several stalls: link the most recently edited live one.
  const { data: stalls } = await supabase.from("stalls").select("slug").eq("owner_id", data.user.id).eq("published", true)
    .order("updated_at", { ascending: false }).limit(1);
  return { email: data.user.email ?? "", liveSlug: stalls?.[0]?.slug as string | undefined };
}

export default async function Home() {
  const me = await currentVendor();
  const lang = await uiLang();
  const t = STRINGS[lang];
  const start = DEMO || me ? "/dashboard" : "/login";
  return (
    <UiProvider lang={lang}>
    <main className="page">
      <div className="wrap">
        <header className="top">
          <a className="logo" href="/">Quán<span>.</span></a>
          <div className="row">
            <LangSwitch />
            {me ? <AccountMenu email={me.email} liveSlug={me.liveSlug} /> : <a className="btn" href={start}>{DEMO ? t.homeOpenEditor : t.homeSignIn}</a>}
          </div>
        </header>
        <section className="hero">
          <h1>{t.heroTitle}</h1>
          <p>{t.heroText}</p>
          <div className="row">
            <a className="btn primary" href={start}>{me ? t.heroMine : t.heroStart}</a>
            <a className="btn" href="/m/demo">{t.heroExample}</a>
          </div>
        </section>
        <section className="how" aria-label={t.howLabel}>
          {t.how.map(([b, span]) => <div key={b}><b>{b}</b><span>{span}</span></div>)}
        </section>
      </div>
    </main>
    </UiProvider>
  );
}
