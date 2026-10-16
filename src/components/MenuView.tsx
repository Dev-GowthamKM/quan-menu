"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALLERGENS, LANGS, foreign, guessLang, vnd } from "@/lib/i18n";
import { ICE, OPT_UI, SUGAR, hasOpts, lineVi, sameLine, unitPrice, type Line } from "@/lib/drinks";
import type { Rates } from "@/lib/rates";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { LANG_KEYS, isTranslated, type Dish, type Lang, type Media, type Topping } from "@/lib/types";

interface Props {
  name: string;
  area: string;
  dishes: Dish[];
  /** Full-page public menu (true) or the phone preview inside the dashboard (false). */
  full?: boolean;
  /** The shop's topping list, for drinks that allow toppings. */
  toppings?: Topping[];
  /** Live exchange rates (VND per unit); fixed rates are used for any missing. */
  rates?: Rates;
  /** Public menus count a view once per visit, for the vendor's scan counter. */
  countSlug?: string;
}

function useViVoice() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => setVoice(speechSynthesis.getVoices().find((v) => /^vi/i.test(v.lang)) ?? null);
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    return () => speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);
  return voice;
}

export default function MenuView({ name, area, dishes, full, toppings = [], rates = {}, countSlug }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  const [cart, setCart] = useState<Line[]>([]);
  // The drink whose options are being chosen, with the choices so far.
  const [pick, setPick] = useState<Line | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [viewer, setViewer] = useState<{ items: Media[]; at: number; title: string } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const voice = useViVoice();
  const L = LANGS[lang];

  useEffect(() => {
    if (full) setLang(guessLang());
  }, [full]);

  // One view per visit for the vendor's counter. Best effort: a failure never affects the menu.
  useEffect(() => {
    if (!countSlug || !SUPABASE_URL) return;
    const key = "quan-viewed-" + countSlug;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    fetch(`${SUPABASE_URL}/rest/v1/rpc/count_view`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_slug: countSlug }),
      keepalive: true,
    }).catch(() => {});
  }, [countSlug]);

  // Drop cart lines for dishes that no longer exist (the vendor edited the preview).
  useEffect(() => {
    setCart((c) => c.filter((l) => l.i < dishes.length));
    setPick(null);
  }, [dishes.length]);

  useEffect(() => {
    if (showOrder) closeRef.current?.focus();
  }, [showOrder]);

  useEffect(() => {
    if (!viewer) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewer(null);
      if (e.key === "ArrowRight") setViewer((v) => v && { ...v, at: (v.at + 1) % v.items.length });
      if (e.key === "ArrowLeft") setViewer((v) => v && { ...v, at: (v.at - 1 + v.items.length) % v.items.length });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [viewer]);

  const O = OPT_UI[lang];
  const count = useMemo(() => cart.reduce((a, l) => a + l.q, 0), [cart]);
  const total = useMemo(
    () => cart.reduce((t, l) => t + (dishes[l.i] ? unitPrice(dishes[l.i], l, toppings) * l.q : 0), 0),
    [cart, dishes, toppings],
  );
  const qtyOf = (i: number) => cart.reduce((a, l) => a + (l.i === i ? l.q : 0), 0);

  const addLine = (line: Line) =>
    setCart((c) => {
      const k = c.findIndex((l) => sameLine(l, line));
      return k >= 0 ? c.map((l, j) => (j === k ? { ...l, q: l.q + line.q } : l)) : [...c, line];
    });

  // "+" on a drink with options opens the chooser; on anything else it adds one straight away.
  const plus = (i: number) => {
    const d = dishes[i];
    if (!hasOpts(d)) return addLine({ i, q: 1 });
    setPick({ i, q: 1, size: d.opts?.sizes?.[0]?.k, sugar: d.opts?.sugar ? 100 : undefined, ice: d.opts?.ice ? "normal" : undefined, tops: [] });
  };
  // "−" takes one away from the most recently added line for that dish.
  const minus = (i: number) =>
    setCart((c) => {
      const k = c.map((l) => l.i).lastIndexOf(i);
      if (k < 0) return c;
      return c[k].q > 1 ? c.map((l, j) => (j === k ? { ...l, q: l.q - 1 } : l)) : c.filter((_, j) => j !== k);
    });

  const speak = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "vi-VN";
      u.rate = 0.8;
      if (voice) u.voice = voice;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {}
  };

  return (
    <div className={"menu" + (full ? " full" : "")} lang={lang}>
      <div className="m-head">
        <div>
          <h1 className="stall">{name || "Your stall"}</h1>
          {area && <div className="meta">{area}</div>}
        </div>
        <div className="langbar" role="group" aria-label="Language">
          {LANG_KEYS.map((k) => (
            <button key={k} aria-pressed={k === lang} onClick={() => setLang(k)} lang={k}>
              {LANGS[k].label}
            </button>
          ))}
        </div>
      </div>

      <div className="m-list">
        {!dishes.length && <div className="empty">{L.empty}</div>}
        {dishes.map((d, i) => {
          const done = isTranslated(d);
          const title = done ? d.name![lang] || d.name!.en : d.vi;
          const desc = d.desc ? d.desc[lang] || d.desc.en : "";
          const q = qtyOf(i);
          return (
            <div key={i} className={"dish" + (q ? " on" : "")}>
              <div className="dish-top">
                <h2 className="tn">{title}</h2>
                <div className="pr">
                  {d.opts?.sizes?.length ? (
                    d.opts.sizes.map((z) => <b key={z.k} className="sz"><span>{z.k}</span> {vnd(z.price)}</b>)
                  ) : (
                    <b>{vnd(d.price)}</b>
                  )}
                  <small>{foreign(d.opts?.sizes?.[0]?.price || d.price, lang, rates[lang])}</small>
                </div>
              </div>
              <div className="vn" lang="vi">
                {done && <span>{d.vi}</span>}
                <button
                  className="say"
                  onClick={() => speak(d.vi)}
                  aria-label={`${L.say}: ${d.vi}`}
                  title={voice ? undefined : "No Vietnamese voice on this device. Read the guide aloud."}
                >
                  🔊 {L.say} {d.pron && <i>“{d.pron}”</i>}
                </button>
              </div>
              {desc && <p>{desc}</p>}
              {hasOpts(d) && (
                <div className="opt-hint">
                  {[d.opts?.sizes?.length && O.size, d.opts?.sugar && O.sugar, d.opts?.ice && O.ice, d.opts?.tops && toppings.length && O.toppings].filter(Boolean).join(" · ")}
                </div>
              )}
              {!!d.media?.length && (
                <div className="m-media">
                  {d.media.map((m, k) => (
                    <button key={m.url} className="m-thumb" onClick={() => setViewer({ items: d.media!, at: k, title })}
                      aria-label={`${title}: ${m.type === "video" ? "video" : "photo"} ${k + 1} of ${d.media!.length}`}>
                      {m.type === "video" ? (
                        <video src={m.url + "#t=0.1"} muted playsInline preload="metadata" tabIndex={-1} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" loading="lazy" />
                      )}
                      {m.type === "video" && <span className="media-play" aria-hidden>▶</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="dish-top">
                <div className="tags">
                  {d.spice > 0 && (
                    <span className="chili" title="Spicy" aria-label={`Spicy ${d.spice} of 3`}>
                      {"🌶".repeat(d.spice)}
                    </span>
                  )}
                  {d.alg.map((a) => (
                    <span key={a} className="tag">
                      {ALLERGENS[a][lang]}
                    </span>
                  ))}
                </div>
                <div className="qty">
                  <button aria-label="Remove one" disabled={!q} onClick={() => minus(i)}>
                    −
                  </button>
                  <span aria-live="polite">{q}</span>
                  <button aria-label={hasOpts(d) ? O.choose : "Add one"} onClick={() => plus(i)}>
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="m-foot">
        <button className="btn primary" disabled={!count} onClick={() => setShowOrder(true)}>
          {count ? L.show(count) : L.show0}
        </button>
        <small>{L.note}{rates[lang] ? <> · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by Exchange Rate API</a></> : null}</small>
      </div>

      {viewer && (
        <div className="viewer" role="dialog" aria-modal="true" aria-label={viewer.title} onClick={() => setViewer(null)}>
          <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
            <span>{viewer.title}{viewer.items.length > 1 && ` · ${viewer.at + 1}/${viewer.items.length}`}</span>
            <button className="btn" onClick={() => setViewer(null)} autoFocus>{L.close}</button>
          </div>
          <div className="viewer-stage" onClick={(e) => e.stopPropagation()}>
            {viewer.items[viewer.at].type === "video" ? (
              <video key={viewer.items[viewer.at].url} src={viewer.items[viewer.at].url} controls autoPlay muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={viewer.items[viewer.at].url} alt={viewer.title} />
            )}
          </div>
          {viewer.items.length > 1 && (
            <div className="viewer-nav" onClick={(e) => e.stopPropagation()}>
              <button className="btn" aria-label="Previous" onClick={() => setViewer({ ...viewer, at: (viewer.at - 1 + viewer.items.length) % viewer.items.length })}>‹</button>
              <button className="btn" aria-label="Next" onClick={() => setViewer({ ...viewer, at: (viewer.at + 1) % viewer.items.length })}>›</button>
            </div>
          )}
        </div>
      )}

      {pick && dishes[pick.i] && (() => {
        const d = dishes[pick.i];
        const o = d.opts ?? {};
        const title = isTranslated(d) ? d.name![lang] || d.name!.en : d.vi;
        const set = (patch: Partial<Line>) => setPick({ ...pick, ...patch });
        const tops = pick.tops ?? [];
        return (
          <div className="sheet" role="dialog" aria-modal="true" aria-label={O.options} onClick={() => setPick(null)}>
            <div className="sheet-card" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-h"><h3>{title}</h3><button className="icon" aria-label={L.close} onClick={() => setPick(null)}>✕</button></div>
              {!!o.sizes?.length && (
                <fieldset><legend>{O.size}</legend><div className="pills">
                  {o.sizes.map((z) => <button key={z.k} type="button" aria-pressed={pick.size === z.k} onClick={() => set({ size: z.k })}>{z.k} · {vnd(z.price)}</button>)}
                </div></fieldset>
              )}
              {o.sugar && (
                <fieldset><legend>{O.sugar}</legend><div className="pills">
                  {SUGAR.map((v) => <button key={v} type="button" aria-pressed={pick.sugar === v} onClick={() => set({ sugar: v })}>{O.sugarLv(v)}</button>)}
                </div></fieldset>
              )}
              {o.ice && (
                <fieldset><legend>{O.ice}</legend><div className="pills">
                  {ICE.map((v) => <button key={v} type="button" aria-pressed={pick.ice === v} onClick={() => set({ ice: v })}>{O.iceLv[v]}</button>)}
                </div></fieldset>
              )}
              {o.tops && toppings.length > 0 && (
                <fieldset><legend>{O.toppings}</legend><div className="pills">
                  {toppings.map((tp, k) => {
                    const on = tops.includes(k);
                    return (
                      <button key={k} type="button" aria-pressed={on} onClick={() => set({ tops: on ? tops.filter((x) => x !== k) : [...tops, k] })}>
                        {(tp.name?.[lang] || tp.name?.en || tp.vi)} +{vnd(tp.price)}
                      </button>
                    );
                  })}
                </div></fieldset>
              )}
              <button className="btn primary" onClick={() => { addLine(pick); setPick(null); }}>{O.add(vnd(unitPrice(d, pick, toppings)))}</button>
            </div>
          </div>
        );
      })()}

      {showOrder && (
        <div className="order" role="dialog" aria-modal="true" aria-label={L.head} lang="vi">
          <h3 lang={lang}>{L.head}</h3>
          <div className="big">Cho tôi:</div>
          <ul>
            {cart.map((l, k) => {
              const d = dishes[l.i];
              if (!d) return null;
              return <li key={k}>{l.q} × {lineVi(d, l, toppings)}</li>;
            })}
          </ul>
          <div className="tot">Tổng: {vnd(total)}</div>
          <button ref={closeRef} className="btn" onClick={() => setShowOrder(false)} lang={lang}>
            {L.close}
          </button>
        </div>
      )}
    </div>
  );
}
