"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALLERGENS, LANGS, foreign, guessLang, vnd } from "@/lib/i18n";
import { ICE, OPT_UI, SUGAR, hasOpts, lineVi, sameLine, unitPrice, type Line } from "@/lib/drinks";
import type { Rates } from "@/lib/rates";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/config";
import { LANG_KEYS, isTranslated, soldToday, vnToday, type Dish, type Lang, type Media, type Pay, type SoldOut, type Topping } from "@/lib/types";
import { bankName, vietQr } from "@/lib/vietqr";
import QrImage from "./QrImage";

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
  /** Dishes sold out today. */
  soldOut?: SoldOut;
  /** Bank account for paying the order total by VietQR transfer. */
  pay?: Pay | null;
  /** The stall's Google Maps link, for the review button. */
  maps?: string;
  /** Editor preview only: notes for the vendor where the payment and review buttons will appear. */
  hints?: { pay: string; review: string; lang: string };
}

/** The phone's own Vietnamese voice, a woman's where there is a choice. Only used when the recorded voice can't load. */
function useViVoice() {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const vi = speechSynthesis.getVoices().filter((v) => /^vi/i.test(v.lang));
      setVoice(vi.find((v) => /hoaimy|hoài my|linh|female|nữ/i.test(v.name)) ?? vi[0] ?? null);
    };
    pick();
    speechSynthesis.addEventListener("voiceschanged", pick);
    return () => speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);
  return voice;
}

/** An order line as speech: "Trà sữa (L) · 50% đường · + Trân châu" → "Trà sữa size L, 50% đường, thêm Trân châu". */
const spoken = (line: string) => line.replace(/ \((S|M|L)\)/, " size $1").replace(/ · \+ /g, ", thêm ").replace(/ · /g, ", ");

/** Joins short sentences into parts of at most `max` characters. Each part is one recording. */
function pack(sentences: string[], max = 120): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    const last = out[out.length - 1];
    if (last && last.length + s.length + 2 <= max) out[out.length - 1] = `${last}. ${s}`;
    else out.push(s.slice(0, 150));
  }
  return out;
}

/** For search: lower case, no tone marks, so "pho" finds "Phở". */
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

export default function MenuView({ name, area, dishes, full, toppings = [], rates = {}, countSlug, soldOut, pay, maps, hints }: Props) {
  const [lang, setLang] = useState<Lang>("en");
  const [cart, setCart] = useState<Line[]>([]);
  // The drink whose options are being chosen, with the choices so far.
  const [pick, setPick] = useState<Line | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [viewer, setViewer] = useState<{ items: Media[]; at: number; title: string } | null>(null);
  // Short code shown on the order screen and sent as the transfer note, so the vendor can match payments.
  const [orderNo, setOrderNo] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [copied, setCopied] = useState(false);
  // Sold-out lists from the server are for one day only: a page cached overnight must not keep yesterday's.
  const [today, setToday] = useState(soldOut?.day ?? "");
  useEffect(() => setToday(vnToday()), []);
  const out = useMemo(() => new Set(soldToday(soldOut, today)), [soldOut, today]);
  const closeRef = useRef<HTMLButtonElement>(null);
  const voice = useViVoice();
  // What is being read aloud ("d3" for dish 3, "order"), and the player, so a new tap stops the last one.
  const [saying, setSaying] = useState("");
  const player = useRef<{ audio: HTMLAudioElement | null; run: number }>({ audio: null, run: 0 });
  // The table this menu was opened at (its QR code adds ?b=3), shown to the vendor with the order.
  const [table, setTable] = useState("");
  const [find, setFind] = useState("");
  const L = LANGS[lang];

  useEffect(() => {
    if (!full) return;
    const b = new URLSearchParams(window.location.search).get("b") ?? "";
    if (/^[0-9A-Za-z]{1,4}$/.test(b)) setTable(b.toUpperCase());
  }, [full]);

  useEffect(() => () => { player.current.run++; player.current.audio?.pause(); }, []);

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
    setCart((c) => (c.some((l) => out.has(dishes[l.i]?.vi)) ? c.filter((l) => !out.has(dishes[l.i]?.vi)) : c));
  }, [out, dishes]);

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

  /** The phone's own voice, for when the recording can't load. Gives up quietly if the phone can't speak. */
  const deviceSay = (text: string, done: () => void) => {
    const stop = setTimeout(done, Math.min(20_000, 2000 + text.length * 120));
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "vi-VN";
      u.rate = 0.85;
      if (voice) u.voice = voice;
      u.onend = u.onerror = () => { clearTimeout(stop); done(); };
      speechSynthesis.speak(u);
    } catch {
      clearTimeout(stop);
      done();
    }
  };

  /**
   * Reads Vietnamese aloud in a recorded woman's voice (/api/say), part after part. One audio element
   * is reused, so phones that only allow sound after a tap keep playing the later parts too.
   */
  const say = (parts: string[], key: string) => {
    const run = ++player.current.run;
    player.current.audio?.pause();
    try { speechSynthesis.cancel(); } catch {}
    const live = () => player.current.run === run;
    const done = () => { if (live()) setSaying(""); };
    const a = new Audio();
    a.defaultPlaybackRate = a.playbackRate = 0.9;
    player.current.audio = a;
    setSaying(key);
    let k = 0;
    let failed = false;
    const fail = () => {
      if (failed || !live()) return;
      failed = true;
      deviceSay(parts.slice(k).join(". "), done);
    };
    const next = () => {
      if (!live()) return;
      if (k >= parts.length) return done();
      a.src = `/api/say?t=${encodeURIComponent(parts[k])}`;
      a.play().catch(fail);
    };
    a.onended = () => { k++; next(); };
    a.onerror = fail;
    next();
  };

  const orderParts = () => pack([
    (table ? `Bàn ${table}. ` : "") + "Cho tôi",
    ...cart.flatMap((l) => (dishes[l.i] ? [`${l.q} ${spoken(lineVi(dishes[l.i], l, toppings))}`] : [])),
    `Tổng ${total} đồng`,
  ]);

  return (
    <div className={"menu" + (full ? " full" : "")} lang={lang}>
      <div className="m-head">
        <div>
          <h1 className="stall">{name || "Your stall"}</h1>
          {area && <div className="meta">{area}</div>}
          {table && <div className="meta tbl">🪑 {L.table(table)}</div>}
        </div>
        <div className="langbar" role="group" aria-label="Language">
          {LANG_KEYS.map((k) => (
            <button key={k} aria-pressed={k === lang} onClick={() => setLang(k)} lang={k}>
              {LANGS[k].label}
            </button>
          ))}
        </div>
        {dishes.length >= 10 && (
          <input className="find" type="search" value={find} placeholder={`🔎 ${L.search}`} aria-label={L.search}
            onChange={(e) => setFind(e.target.value)} />
        )}
      </div>

      <div className="m-list">
        {!dishes.length && <div className="empty">{L.empty}</div>}
        {!!find.trim() && !dishes.some((d) => [d.vi, d.name?.[lang], d.name?.en].some((x) => x && fold(x).includes(fold(find.trim())))) && (
          <div className="empty">{L.noMatch}</div>
        )}
        {dishes.map((d, i) => {
          const done = isTranslated(d);
          const title = done ? d.name![lang] || d.name!.en : d.vi;
          if (find.trim() && ![d.vi, title, d.name?.en].some((x) => x && fold(x).includes(fold(find.trim())))) return null;
          const desc = d.desc ? d.desc[lang] || d.desc.en : "";
          const q = qtyOf(i);
          const gone = out.has(d.vi);
          return (
            <div key={i} className={"dish" + (q ? " on" : "") + (gone ? " gone" : "")}>
              {(d.special || gone) && (
                <div className="badges">
                  {gone && <span className="badge out">{L.soldOut}</span>}
                  {d.special && !gone && <span className="badge star">⭐ {L.mustTry}</span>}
                </div>
              )}
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
                  className={"say" + (saying === "d" + i ? " on" : "")}
                  onClick={() => say([d.vi], "d" + i)}
                  aria-label={`${L.say}: ${d.vi}`}
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
                  <button aria-label={hasOpts(d) ? O.choose : "Add one"} disabled={gone} onClick={() => plus(i)}>
                    +
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {maps && dishes.length > 0 && (
          <div className="review">
            <span>{L.reviewAsk}</span>
            <a className="btn" href={maps} target="_blank" rel="noreferrer noopener">⭐ {L.review}</a>
          </div>
        )}
        {!maps && hints && dishes.length > 0 && <p className="vhint" lang={hints.lang}>⭐ {hints.review}</p>}
      </div>

      <div className="m-foot">
        <button className="btn primary" disabled={!count} onClick={() => { setOrderNo(String(1000 + Math.floor(Math.random() * 9000))); setShowPay(false); setShowOrder(true); }}>
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
          {table && <div className="tno">Bàn {table} <span lang={lang}>· {L.table(table)}</span></div>}
          <div className="big">Cho tôi:</div>
          <ul>
            {cart.map((l, k) => {
              const d = dishes[l.i];
              if (!d) return null;
              return <li key={k}>{l.q} × {lineVi(d, l, toppings)}</li>;
            })}
          </ul>
          <div className="tot">Tổng: {vnd(total)} <small lang={lang}>{foreign(total, lang, rates[lang])}</small></div>
          <button className={"btn readout" + (saying === "order" ? " on" : "")} onClick={() => say(orderParts(), "order")} lang={lang}>🔊 {L.readOrder}</button>
          <div className="ono">Mã đơn #{orderNo} <span lang={lang}>· {L.order} #{orderNo}</span></div>
          {pay && total > 0 && (
            showPay ? (
              <div className="paybox" lang={lang}>
                <QrImage text={vietQr({ bank: pay.bank, acct: pay.acct, amount: total, note: `QUAN ${table ? `B${table} ` : ""}${orderNo}` })} size={220} label={`VietQR ${vnd(total)}`} />
                <div className="paywho">
                  <b>{vnd(total)}</b>
                  <span>{bankName(pay.bank)} · {pay.acct}</span>
                  {pay.name && <span>{pay.name}</span>}
                </div>
                <small>{L.payHint}</small>
                <button className="btn" onClick={async () => {
                  try { await navigator.clipboard.writeText(pay.acct); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
                }}>{copied ? L.copied : L.copyAcct}</button>
              </div>
            ) : (
              <button className="btn paybtn" onClick={() => setShowPay(true)} lang={lang}>💳 {L.pay}</button>
            )
          )}
          {!pay && hints && <p className="vhint" lang={hints.lang}>💳 {hints.pay}</p>}
          {maps && <a className="btn" href={maps} target="_blank" rel="noreferrer noopener" lang={lang}>⭐ {L.review}</a>}
          <button ref={closeRef} className="btn" onClick={() => setShowOrder(false)} lang={lang}>
            {L.close}
          </button>
        </div>
      )}
    </div>
  );
}
