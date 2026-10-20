"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteStall, saveMenu, setSoldOut } from "@/app/dashboard/actions";
import { DEMO_KEY, slugify } from "@/lib/config";
import { EXAMPLE_MENU } from "@/lib/demo";
import { DEFAULT_TOPPINGS, defaultOpts, toppingName } from "@/lib/drinks";
import {
  ALLERGEN_KEYS, SHOP_KINDS, SIZE_KEYS, cleanMaps, cleanPay, isTranslated, soldToday, vnToday,
  type Dish, type DrinkOpts, type ML, type MenuData, type Pay, type ShopKind, type SizeKey, type StallRef, type Topping,
} from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MEDIA_BUCKET, MEDIA_PREFIX, type Media } from "@/lib/types";
import type { Rates } from "@/lib/rates";
import AccountMenu from "./AccountMenu";
import DishMedia from "./DishMedia";
import MenuView from "./MenuView";
import OwnerLink from "./OwnerLink";
import PaySettings from "./PaySettings";
import StallBar from "./StallBar";
import { LangSwitch, useUi } from "./Ui";
import Sticker from "./Sticker";

interface Props {
  initial: MenuData | null;
  demo: boolean;
  /** Whether the server can read photos and translate with AI (needs ANTHROPIC_API_KEY). */
  ai: boolean;
  siteUrl: string;
  email?: string;
  /** Live exchange rates for the phone preview. */
  rates?: Rates;
  /** Menu views today and in the last 7 days (missing until the schema with menu_views is run). */
  views?: { today: number; week: number };
  /** Every stall on this account, for the stall switcher. */
  stalls?: StallRef[];
  /** This stall's owner link token, if one was made. */
  ownerKey?: string | null;
  /** The database is older than this version of the app: supabase/schema.sql needs running again. */
  schemaOld?: boolean;
}

/** A message shown after the page reloads into a stall that was just created or deleted. */
const FLASH = "quan-flash";
const noPay: Pay = { bank: "", acct: "", name: "" };

/** The built-in dish list is ~100 KB, so it loads on first use instead of with the page. */
let listPromise: Promise<typeof import("@/lib/dishes")> | null = null;
const loadList = () => (listPromise ??= import("@/lib/dishes"));

const blank = (): Dish => ({ vi: "", price: 0, spice: 0, alg: [], pron: "", name: null, desc: null });

/** Shrinks a phone photo to ≤1600px JPEG so uploads stay small and fast. */
async function shrink(file: File): Promise<{ data: string; type: "image/jpeg" }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return { data: c.toDataURL("image/jpeg", 0.85).split(",")[1], type: "image/jpeg" };
}

async function post<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || fallback);
  return json as T;
}

type Status = { msg: string; kind?: "err" | "good" };

/** Dishes per translation request: small batches keep each call well inside the server's time limit. */
const BATCH = 15;
const key = (vi: string) => vi.trim().toLowerCase();

export default function Editor({ initial, demo, ai, siteUrl, email, rates, views, stalls = [], ownerKey = null, schemaOld }: Props) {
  const router = useRouter();
  const { t } = useUi();
  const start: MenuData = initial ?? { name: "", area: "", slug: "", published: false, dishes: [] };
  const [stallId, setStallId] = useState<string | null>(start.id ?? null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(start.updatedAt ?? null);
  const [pay, setPay] = useState<Pay>(start.pay ?? noPay);
  const [maps, setMaps] = useState(start.maps ?? "");
  const [sold, setSold] = useState<string[]>(soldToday(start.soldOut));
  const [todayMsg, setTodayMsg] = useState("");
  const [stale, setStale] = useState(false);
  const soldReq = useRef(0);
  const [name, setName] = useState(start.name);
  const [area, setArea] = useState(start.area);
  const [slug, setSlug] = useState(start.slug);
  const [slugTouched, setSlugTouched] = useState(!!start.slug);
  const [published, setPublished] = useState(start.published);
  const [dishes, setDishes] = useState<Dish[]>(start.dishes);
  const [kind, setKind] = useState<ShopKind>(start.kind ?? "food");
  const [toppings, setToppings] = useState<Topping[]>(start.toppings ?? []);
  const [list, setList] = useState<typeof import("@/lib/dishes") | null>(null);
  const [savedSlug, setSavedSlug] = useState(start.slug);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [thumb, setThumb] = useState("");
  const [busy, setBusy] = useState<"" | "read" | "translate" | "save">("");
  const [s1, setS1] = useState<Status>({ msg: "" });
  const [s2, setS2] = useState<Status>({ msg: "" });
  const [s4, setS4] = useState<Status>({ msg: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [listSize, setListSize] = useState(0);
  // Media URLs in the last saved menu: files dropped from it are deleted from storage after the next save.
  const savedMedia = useRef(new Set(start.dishes.flatMap((d) => d.media ?? []).map((m) => m.url)));

  useEffect(() => {
    loadList().then((m) => { setListSize(m.DISH_COUNT); setList(m); }).catch(() => {});
    try {
      const msg = sessionStorage.getItem(FLASH);
      if (msg) { sessionStorage.removeItem(FLASH); setS4({ msg, kind: "good" }); }
    } catch {}
  }, []);

  // Demo mode: the menu lives in this browser.
  useEffect(() => {
    if (!demo) return;
    try {
      const s = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") as MenuData | null;
      if (s?.dishes) {
        setName(s.name); setArea(s.area); setSlug(s.slug); setSlugTouched(true);
        setPublished(s.published); setDishes(s.dishes); setSavedSlug(s.slug);
        setKind(s.kind ?? "food"); setToppings(s.toppings ?? []);
        setPay(s.pay ?? noPay); setMaps(s.maps ?? "");
      }
    } catch {}
  }, [demo]);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => setDirty(true);
  const update = (i: number, patch: Partial<Dish>) => {
    setDishes((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
    touch();
  };
  const renameVi = async (i: number, vi: string) => {
    const d = dishes[i];
    const name = vi.trim();
    if (name === d.vi) return;
    // A new Vietnamese name means the old translation is wrong.
    update(i, { vi: name, name: null, desc: null, pron: "", alg: [], spice: 0 });
    if (!name) return;
    // Common dishes translate instantly from the built-in list, with no AI call.
    const { fillFromList } = await loadList().catch(() => ({ fillFromList: () => null }));
    setDishes((ds) => ds.map((x, k) => (k === i && x.vi === name && !isTranslated(x) ? fillFromList(x, kind) ?? x : x)));
  };

  const setOpts = (i: number, patch: Partial<DrinkOpts>) => {
    setDishes((ds) => ds.map((d, k) => {
      if (k !== i) return d;
      const opts = { ...(d.opts ?? {}), ...patch };
      const any = opts.sizes?.length || opts.sugar || opts.ice || opts.tops;
      // With sizes, the row's price is the smallest size, so lists and the preview stay in step.
      return { ...d, opts: any ? opts : null, price: opts.sizes?.[0]?.price ?? d.price };
    }));
    touch();
  };
  const toggleSizes = (i: number, on: boolean) => {
    const d = dishes[i];
    const m = d.price || 30000;
    setOpts(i, { sizes: on ? [{ k: "M", price: m }, { k: "L", price: m + 10000 }] : undefined });
  };
  const toggleSize = (i: number, k: SizeKey, on: boolean) => {
    const cur = dishes[i].opts?.sizes ?? [];
    const base = cur[cur.length - 1]?.price || dishes[i].price || 30000;
    const next = on ? [...cur, { k, price: base }] : cur.filter((z) => z.k !== k);
    next.sort((a, b) => SIZE_KEYS.indexOf(a.k) - SIZE_KEYS.indexOf(b.k));
    setOpts(i, { sizes: next.length ? next : undefined });
  };
  const sizePrice = (i: number, k: SizeKey, price: number) =>
    setOpts(i, { sizes: (dishes[i].opts?.sizes ?? []).map((z) => (z.k === k ? { ...z, price } : z)) });

  // Drinks from the built-in list that have no options yet (offered when the shop is a café or tea shop).
  const bareDrinks = list ? dishes.filter((d) => d.vi && !d.opts && list.lookupDish(d.vi)?.drink).length : 0;
  const applyDefaults = () => {
    if (!list) return;
    const n = bareDrinks;
    setDishes((ds) => ds.map((d) => {
      if (!d.vi || d.opts || !list.lookupDish(d.vi)?.drink) return d;
      const opts = defaultOpts(kind, d.price);
      return { ...d, opts, price: opts?.sizes?.[0]?.price ?? d.price };
    }));
    touch();
    setS2({ msg: t.appliedDefaults(n), kind: "good" });
  };
  const editTopping = (k: number, patch: Partial<Topping>) => {
    setToppings((ts) => ts.map((tp, j) => {
      if (j !== k) return tp;
      const next = { ...tp, ...patch };
      if (patch.vi !== undefined) next.name = toppingName(next.vi);
      return next;
    }));
    touch();
  };
  const showToppings = kind !== "food" || toppings.length > 0 || dishes.some((d) => d.opts?.tops);

  const addMedia = (i: number, added: Media[]) => {
    setDishes((ds) => ds.map((d, k) => (k === i ? { ...d, media: [...(d.media ?? []), ...added] } : d)));
    touch();
  };
  const removeMedia = (i: number, url: string) => {
    setDishes((ds) => ds.map((d, k) => (k === i ? { ...d, media: (d.media ?? []).filter((m) => m.url !== url) } : d)));
    touch();
  };

  const previewSold = useMemo(() => ({ day: vnToday(), names: sold }), [sold]);
  const base = siteUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const liveSlug = slugify(slug || name);
  const publicUrl = `${base}/m/${demo ? liveSlug : savedSlug || liveSlug}`;
  const needTranslate = dishes.filter((d) => d.vi && !isTranslated(d)).length;

  /** No Claude key: read the photo for free in this browser, then match dishes to the built-in list. */
  async function readPhotoFree(file: File) {
    let text: string;
    try {
      const { readMenuPhoto } = await import("@/lib/ocr");
      text = await readMenuPhoto(file, (stage, pct) => setS1({ msg: stage === "load" ? t.ocrLoading(pct) : t.ocrReading(pct) }));
    } catch (e) {
      console.error("[ocr]", e);
      throw new Error(t.ocrFailed);
    }
    const [{ parseMenuText }, lib] = await Promise.all([import("@/lib/menu-parse"), loadList()]);
    const parsed = parseMenuText(text);
    if (!parsed.length) throw new Error(t.ocrNone);
    let known = 0;
    const found: Dish[] = parsed.map((p) => {
      const hit = lib.lookupDishLoose(p.vi);
      // The reader can drop tone marks ("Pho bo tai"): use the list's spelling when it matches.
      const base: Dish = { ...blank(), vi: hit?.vi ?? p.vi, price: p.price };
      const filled = lib.fillFromList(base, kind);
      if (filled) known++;
      const d = filled ?? base;
      return p.sizes ? { ...d, price: p.sizes[0].price, opts: { ...(d.opts ?? {}), sizes: p.sizes } } : d;
    });
    const have = new Set(dishes.map((d) => key(d.vi)));
    const fresh = found.filter((d) => !have.has(key(d.vi)));
    setDishes((ds) => [...ds.filter((d) => d.vi.trim()), ...fresh]);
    touch();
    setS1({ msg: t.ocrFound(found.length, known, found.length - fresh.length), kind: "good" });
  }

  async function readPhoto() {
    if (!photo) return;
    setBusy("read");
    if (!ai) {
      try { await readPhotoFree(photo); } catch (e) { setS1({ msg: (e as Error).message, kind: "err" }); } finally { setBusy(""); }
      return;
    }
    setS1({ msg: t.readingWait });
    try {
      let img: Awaited<ReturnType<typeof shrink>>;
      try {
        img = await shrink(photo);
      } catch {
        throw new Error(t.photoOpenFail);
      }
      const out = await post<{ stall: string; dishes: Dish[] }>("/api/extract", { image: img.data, type: img.type }, t.ai.unknown);
      // Add to the list rather than replace it, so a long menu can be read in several photos.
      const have = new Set(dishes.map((d) => key(d.vi)));
      const fresh = out.dishes.filter((d) => !have.has(key(d.vi)));
      setDishes((ds) => [...ds.filter((d) => d.vi.trim()), ...fresh]);
      if (out.stall && !name) setName(out.stall);
      touch();
      const skipped = out.dishes.length - fresh.length;
      setS1({ msg: t.found(out.dishes.length, skipped), kind: "good" });
    } catch (e) {
      setS1({ msg: (e as Error).message, kind: "err" });
    } finally {
      setBusy("");
    }
  }

  async function translate() {
    setBusy("translate");
    // Built-in list first: free and instant. Only dishes it doesn't know go to the AI.
    let fromList = 0;
    let rest = dishes;
    try {
      const { fillFromList } = await loadList();
      rest = dishes.map((d) => {
        if (!d.vi || isTranslated(d)) return d;
        const hit = fillFromList(d, kind);
        if (hit) fromList++;
        return hit ?? d;
      });
      if (fromList) { setDishes(rest); touch(); }
    } catch {}
    const listNote = fromList ? t.fromList(fromList) : "";
    const idx = rest.map((d, i) => (d.vi && !isTranslated(d) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) {
      setS2({ msg: listNote + t.checkAllergens, kind: "good" });
      return setBusy("");
    }
    if (!ai) {
      // No AI key: free machine translation (MyMemory) for names; the vendor checks them.
      let got = 0;
      try {
        for (let start = 0; start < idx.length; start += 10) {
          const names = idx.slice(start, start + 10).map((i) => rest[i].vi);
          setS2({ msg: listNote + t.freeTranslating(Math.min(start + 10, idx.length), idx.length) });
          const out = await post<{ names: (ML | null)[] }>("/api/free-translate", { names }, t.ai.unknown);
          const byName = new Map(names.map((n, k) => [n, out.names[k]]));
          got += out.names.filter(Boolean).length;
          setDishes((ds) => ds.map((d) => {
            const ml = byName.get(d.vi);
            return ml && !isTranslated(d) ? { ...d, name: ml } : d;
          }));
          touch();
        }
        setS2({ msg: listNote + t.machineDone(got, idx.length - got), kind: got ? "good" : undefined });
      } catch (e) {
        setS2({ msg: listNote + (e as Error).message, kind: "err" });
      } finally {
        setBusy("");
      }
      return;
    }
    let done = 0;
    try {
      for (let start = 0; start < idx.length; start += BATCH) {
        const part = idx.slice(start, start + BATCH);
        setS2({ msg: idx.length > BATCH ? t.translatingRange(start + 1, start + part.length, idx.length) : t.translatingN(idx.length) });
        const names = part.map((i) => rest[i].vi);
        const out = await post<{ dishes: (Dish | null)[] }>("/api/translate", { names }, t.ai.unknown);
        // Match by name, not position, in case the vendor edited the list while this ran.
        const byName = new Map(names.map((n, k) => [n, out.dishes[k]]));
        setDishes((ds) => ds.map((d) => {
          const t = byName.get(d.vi);
          return t && !isTranslated(d) ? { ...t, vi: d.vi, price: d.price, media: d.media } : d;
        }));
        done += part.length;
        touch();
      }
      setS2({ msg: listNote + t.doneCheck, kind: "good" });
    } catch (e) {
      const kept = done ? t.keptSome(done, idx.length) : "";
      setS2({ msg: listNote + (e as Error).message + kept, kind: "err" });
    } finally {
      setBusy("");
    }
  }

  async function save() {
    const clean = dishes.filter((d) => d.vi.trim());
    const cleanTops = toppings.filter((tp) => tp.vi.trim());
    if (!name.trim()) return setS4({ msg: t.needName, kind: "err" });
    setBusy("save");
    setS4({ msg: t.saving });
    try {
      if (demo) {
        const data: MenuData = { name, area, slug: liveSlug, published, dishes: clean, kind, toppings: cleanTops, pay: cleanPay(pay), maps: cleanMaps(maps) };
        localStorage.setItem(DEMO_KEY, JSON.stringify(data));
        setSavedSlug(liveSlug);
        setDirty(false);
        setS4({ msg: t.savedDemo, kind: "good" });
      } else {
        const r = await saveMenu({
          id: stallId, expect: updatedAt, prevSlug: savedSlug,
          name, area, slug: liveSlug, published, dishes: clean, kind, toppings: cleanTops, pay: cleanPay(pay), maps,
        });
        if (!r.ok) {
          setStale(!!r.stale);
          return setS4({ msg: r.error || t.couldntSave, kind: "err" });
        }
        setSavedSlug(r.slug!);
        setSlug(r.slug!);
        setUpdatedAt(r.updatedAt ?? null);
        setDirty(false);
        const now = new Set(clean.flatMap((d) => d.media ?? []).map((m) => m.url));
        const gone = [...savedMedia.current].filter((u) => !now.has(u) && u.startsWith(MEDIA_PREFIX)).map((u) => u.slice(MEDIA_PREFIX.length));
        savedMedia.current = now;
        if (gone.length) supabaseBrowser().storage.from(MEDIA_BUCKET).remove(gone).catch(() => {});
        const msg = published ? t.savedLive : t.savedDraft;
        setS4({ msg, kind: "good" });
        if (!stallId) {
          // A new stall: reload into it, so the switcher lists it and a refresh opens it again.
          setStallId(r.id ?? null);
          try { sessionStorage.setItem(FLASH, msg); } catch {}
          router.replace(`/dashboard?s=${encodeURIComponent(r.slug!)}`);
        } else if (r.slug !== savedSlug) {
          router.replace(`/dashboard?s=${encodeURIComponent(r.slug!)}`);
        } else {
          router.refresh();
        }
      }
      setDishes(clean);
      setToppings(cleanTops);
    } catch {
      setS4({ msg: t.saveFailed, kind: "err" });
    } finally {
      setBusy("");
    }
  }

  /** Sold out today, or back on: saved at once and shown to customers straight away. */
  async function toggleSold(vi: string) {
    if (!stallId) return;
    const on = !sold.includes(vi);
    const req = ++soldReq.current;
    setSold((s) => (on ? [...s, vi] : s.filter((n) => n !== vi)));
    setTodayMsg("");
    const r = await setSoldOut(stallId, savedSlug, vi, on).catch(() => ({ ok: false, error: t.soldOutFailed, soldOut: undefined }));
    if (!r.ok) {
      setSold((s) => (on ? s.filter((n) => n !== vi) : [...s, vi]));
      setTodayMsg(r.error || t.soldOutFailed);
    } else if (req === soldReq.current && r.soldOut) {
      // Only the newest answer is trusted, in case taps on several dishes arrive out of order.
      setSold(soldToday(r.soldOut));
    }
  }

  async function removeStall() {
    if (!stallId || !window.confirm(t.confirmDelete(name || savedSlug))) return;
    setBusy("save");
    const r = await deleteStall(stallId, savedSlug).catch(() => ({ ok: false, error: t.deleteFailed }));
    if (!r.ok) {
      setBusy("");
      return setS4({ msg: r.error || t.deleteFailed, kind: "err" });
    }
    const files = [...savedMedia.current].filter((u) => u.startsWith(MEDIA_PREFIX)).map((u) => u.slice(MEDIA_PREFIX.length));
    if (files.length) await supabaseBrowser().storage.from(MEDIA_BUCKET).remove(files).catch(() => {});
    setDirty(false);
    router.replace("/dashboard");
  }

  async function loadExample() {
    // Café and tea shops get the drinks example; it is loaded on demand to keep the editor small.
    const ex = kind === "food" ? EXAMPLE_MENU : (await import("@/lib/demo-cafe")).EXAMPLE_CAFE;
    setName(ex.name); setArea(ex.area); setSlugTouched(false);
    setDishes(structuredClone(ex.dishes));
    if (ex.toppings?.length && !toppings.length) setToppings(structuredClone(ex.toppings));
    touch();
    setS2({ msg: t.exampleLoaded });
  }

  return (
    <main className="page">
      <div className="wrap">
        <header className="top">
          <a className="logo" href="/">Quán<span>.</span></a>
          <div className="row">
            {demo ? <span className="pill warn">{t.pillDemo}</span> : <span className={"pill " + (published ? "ok" : "")}>{published ? t.pillLive : t.pillDraft}</span>}
            {dirty && <span className="pill warn">{t.pillUnsaved}</span>}
            <LangSwitch />
            {email && <AccountMenu email={email} liveSlug={published && savedSlug ? savedSlug : undefined} onDashboard />}
          </div>
        </header>

        {schemaOld && <p className="banner" role="alert">⚠️ {t.schemaBanner}</p>}
        {!demo && stalls.length > 0 && <StallBar stalls={stalls} current={stallId} dirty={dirty} />}

        <div className="grid">
          <div className="steps">
            {!demo && stallId && savedSlug && dishes.some((d) => d.vi.trim()) && (
              <section className="step today" aria-labelledby="s0">
                <div className="step-h"><div className="num">☀</div><div><h2 id="s0">{t.todayTitle}</h2><small>{t.soldOutHint}</small></div></div>
                {views && <p className="views">👀 {t.viewsLine(views.today, views.week)}</p>}
                <div className="f" style={{ display: "grid", gap: 6 }}>
                  <span className="f">{t.soldOutTitle} · {sold.length ? t.soldOutN(sold.filter((n) => dishes.some((d) => d.vi.trim() === n)).length) : t.soldOutNone}</span>
                  <div className="chips">
                    {[...new Set(dishes.map((d) => d.vi.trim()).filter(Boolean))].map((vi) => {
                      const out = sold.includes(vi);
                      return (
                        <button key={vi} type="button" className="chip sold" aria-pressed={out} onClick={() => toggleSold(vi)}>
                          {out ? "✕ " : ""}{vi}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {todayMsg && <p className="status err" aria-live="polite">{todayMsg}</p>}
              </section>
            )}

            <section className="step" aria-labelledby="s1">
              <div className="step-h"><div className="num">1</div><div><h2 id="s1">{t.s1Title}</h2><small>{t.s1Hint}</small></div></div>
              <div className="two">
                <label className="f" htmlFor="name">{t.stallName}
                  <input id="name" type="text" value={name} placeholder="Cơm Tấm Cô Ba" onChange={(e) => { setName(e.target.value); touch(); }} />
                </label>
                <label className="f" htmlFor="area">{t.area}
                  <input id="area" type="text" value={area} placeholder="Nguyễn Trãi, Quận 1" onChange={(e) => { setArea(e.target.value); touch(); }} />
                </label>
              </div>
              <fieldset className="kinds">
                <legend className="f">{t.shopKind}</legend>
                <div className="pills">
                  {SHOP_KINDS.map((k) => (
                    <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); touch(); }}>{t.kinds[k]}</button>
                  ))}
                </div>
                {kind !== "food" && <small className="status">{t.kindHint}</small>}
              </fieldset>
              <button className="drop" type="button" onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setPhoto(f); setThumb(URL.createObjectURL(f)); } }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb && <img src={thumb} alt="" />}
                <div><b>{photo ? photo.name : t.choosePhoto}</b><span>{photo ? t.otherPhoto : t.choosePhotoHint}</span></div>
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhoto(f); setThumb(URL.createObjectURL(f)); } }} />
              <div className="row">
                <button className="btn primary" disabled={!photo || !!busy} onClick={readPhoto}>{busy === "read" ? t.reading : ai ? t.readAi : t.readFree}</button>
                {dishes.length > 0 && photo && <small className="status">{t.readAdds}</small>}
              </div>
              {!ai && (
                <p className="status">{t.freeHint}</p>
              )}
              <p className={"status " + (s1.kind ?? "")} aria-live="polite">{s1.msg}</p>
            </section>

            <section className="step" aria-labelledby="s2">
              <div className="step-h"><div className="num">2</div><div><h2 id="s2">{t.s2Title}</h2><small>{ai ? t.s2HintAi : t.s2Hint}</small></div></div>
              <div className="dlist">
                <div className="drow dhead"><span>{t.colDish}</span><span style={{ textAlign: "right" }}>{t.colPrice}</span><span className="encol">{t.colEnglish}</span><span /><span /></div>
                {!dishes.length && <div className="empty">{ai ? t.emptyAi : t.empty} <button className="icon" onClick={loadExample} style={{ color: "var(--stool)", textDecoration: "underline" }}>{t.loadExample}</button>.</div>}
                {dishes.map((d, i) => (
                  <div className="drow" key={i}>
                    <input type="text" aria-label={t.viName} defaultValue={d.vi} key={"vi" + i + d.vi} id={"vi" + i}
                      onBlur={(e) => renameVi(i, e.target.value)} />
                    <input className="price" type="number" min={0} step={1000} aria-label={t.priceLabel} value={d.price || ""}
                      onChange={(e) => {
                        const p = Math.max(0, Math.round(Number(e.target.value) || 0));
                        // With sizes, the row price is the smallest size: move every size by the same amount.
                        const zs = d.opts?.sizes;
                        if (zs?.length) setOpts(i, { sizes: zs.map((z) => ({ ...z, price: Math.max(0, z.price + p - zs[0].price) })) });
                        else update(i, { price: p });
                      }} />
                    <span className="encol">{isTranslated(d) ? <span className="en">{d.name!.en}</span> : <span className="pending">{t.needsTranslation}</span>}{!!d.media?.length && <span className="mcount" title={t.mediaCount}> · 📷 {d.media.length}</span>}{!!d.opts && <span className="mcount"> · ☕ {t.optBadge}</span>}{d.special && <span className="mcount" title={t.specialBadge}> · ⭐</span>}</span>
                    <button className="icon" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>{open === i ? t.close : t.edit}</button>
                    <button className="icon del" aria-label={t.remove(d.vi)} onClick={() => { setDishes((ds) => ds.filter((_, k) => k !== i)); setOpen(null); touch(); }}>✕</button>
                    {open === i && (
                      <div className="details">
                        <div className="two">
                          <label className="f">{t.englishName}
                            <input type="text" value={d.name?.en ?? ""} placeholder={ai ? t.englishPhAi : t.englishPh}
                              onChange={(e) => update(i, { name: { en: e.target.value, ko: d.name?.ko ?? "", zh: d.name?.zh ?? "", ja: d.name?.ja ?? "" } })} />
                          </label>
                          <label className="f">{t.spice}
                            <select value={d.spice} onChange={(e) => update(i, { spice: Number(e.target.value) })}>
                              {t.spiceLevels.map((l, k) => <option key={k} value={k}>{l}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="f">{t.sayIt}
                          <input type="text" value={d.pron} placeholder={t.sayItPh} onChange={(e) => update(i, { pron: e.target.value })} />
                        </label>
                        <label className="check"><input type="checkbox" checked={!!d.special} onChange={(e) => update(i, { special: e.target.checked })} /> {t.specialOpt}</label>
                        <div className="f" style={{ display: "grid", gap: 6 }}>
                          <span className="f">{t.contains}</span>
                          <div className="chips">
                            {ALLERGEN_KEYS.map((a) => {
                              const on = d.alg.includes(a);
                              return (
                                <button key={a} className="chip" aria-pressed={on}
                                  onClick={() => update(i, { alg: on ? d.alg.filter((x) => x !== a) : [...d.alg, a] })}>
                                  {t.allergens[a]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <fieldset className="drink-opts">
                          <legend className="f">{t.drinkOpts}</legend>
                          <label className="check"><input type="checkbox" checked={!!d.opts?.sizes?.length} onChange={(e) => toggleSizes(i, e.target.checked)} /> {t.sizesOpt}</label>
                          {!!d.opts?.sizes?.length && (
                            <div className="sizes">
                              {SIZE_KEYS.map((k) => {
                                const z = d.opts!.sizes!.find((x) => x.k === k);
                                return (
                                  <div key={k} className="size">
                                    <label className="check"><input type="checkbox" checked={!!z} disabled={!!z && d.opts!.sizes!.length <= 2} onChange={(e) => toggleSize(i, k, e.target.checked)} /> {k}</label>
                                    {z && <input className="price" type="number" min={0} step={1000} aria-label={t.sizePrice(k)} value={z.price || ""}
                                      onChange={(e) => sizePrice(i, k, Math.max(0, Math.round(Number(e.target.value) || 0)))} />}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <label className="check"><input type="checkbox" checked={!!d.opts?.sugar} onChange={(e) => setOpts(i, { sugar: e.target.checked })} /> {t.sugarOpt}</label>
                          <label className="check"><input type="checkbox" checked={!!d.opts?.ice} onChange={(e) => setOpts(i, { ice: e.target.checked })} /> {t.iceOpt}</label>
                          <label className="check"><input type="checkbox" checked={!!d.opts?.tops} onChange={(e) => setOpts(i, { tops: e.target.checked })} /> {t.topsOpt}</label>
                        </fieldset>
                        <div className="f" style={{ display: "grid", gap: 6 }}>
                          <span className="f">{t.media}</span>
                          <DishMedia media={d.media ?? []} demo={demo} onAdd={(m) => addMedia(i, m)} onRemove={(u) => removeMedia(i, u)} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn" onClick={() => { setDishes((ds) => [...ds, blank()]); touch(); setTimeout(() => document.getElementById("vi" + dishes.length)?.focus(), 0); }}>{t.addDish}</button>
                {needTranslate > 0 && <button className={"btn" + (ai ? " primary" : "")} disabled={!!busy} onClick={translate}>{busy === "translate" ? t.translating : ai ? t.translateN(needTranslate) : t.translateFreeN(needTranslate)}</button>}
              </div>
              {kind !== "food" && bareDrinks > 0 && (
                <div className="row"><button className="btn" onClick={applyDefaults}>☕ {t.applyDefaults(bareDrinks)}</button></div>
              )}
              <p className={"status " + (s2.kind ?? "")} aria-live="polite">{s2.msg}</p>
              {showToppings && (
                <div className="toppings">
                  <div><b>{t.toppingsTitle}</b><small className="status">{t.toppingsHint}</small></div>
                  {toppings.map((tp, k) => (
                    <div className="trow" key={k}>
                      <input type="text" aria-label={t.toppingName} placeholder={t.toppingName} value={tp.vi} onChange={(e) => editTopping(k, { vi: e.target.value })} />
                      <input className="price" type="number" min={0} step={1000} aria-label={t.toppingPrice} placeholder={t.toppingPrice} value={tp.price || ""}
                        onChange={(e) => editTopping(k, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                      <span className="encol">{tp.name?.en ?? ""}</span>
                      <button className="icon del" aria-label={t.removeTopping(tp.vi)} onClick={() => { setToppings((ts) => ts.filter((_, j) => j !== k)); touch(); }}>✕</button>
                    </div>
                  ))}
                  <div className="row">
                    <button className="btn" onClick={() => { setToppings((ts) => [...ts, { vi: "", price: 5000, name: null }]); touch(); }}>{t.addTopping}</button>
                    {!toppings.length && <button className="btn" onClick={() => { setToppings(structuredClone(DEFAULT_TOPPINGS)); touch(); }}>{t.starterToppings}</button>}
                  </div>
                </div>
              )}
            </section>

            <section className="step" aria-labelledby="s3">
              <div className="step-h"><div className="num">3</div><div><h2 id="s3">{t.s3Title}</h2><small>{t.s3Hint}</small></div></div>
              <label className="f" htmlFor="slug">{t.webAddress}
                <input id="slug" type="text" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); touch(); }}
                  onBlur={() => setSlug(slugify(slug || name))} />
              </label>
              <PaySettings pay={pay} maps={maps} onPay={(p) => { setPay(p); touch(); }} onMaps={(m) => { setMaps(m); touch(); }} />
              <label className="row" style={{ gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={published} onChange={(e) => { setPublished(e.target.checked); touch(); }} />
                <span><b>{t.liveToggle}</b> · {t.liveToggleHint}</span>
              </label>
              <div className="row">
                <button className="btn primary" disabled={!!busy || (!dirty && !!savedSlug)} onClick={save}>{busy === "save" ? t.saving : dirty || !savedSlug ? t.saveMenu : t.saved}</button>
                {savedSlug && (published || demo) && <a className="btn" href={`/m/${savedSlug}`} target="_blank" rel="noreferrer">{t.openPublic}</a>}
              </div>
              <p className={"status " + (s4.kind ?? "")} aria-live="polite">{s4.msg}</p>
              {stale && <div className="row"><button className="btn" onClick={() => window.location.reload()}>↻ {t.reload}</button></div>}
              {!demo && stallId && <div className="row"><button className="icon del" disabled={!!busy} onClick={removeStall}>{t.deleteStall}</button></div>}
            </section>

            <section className="step" aria-labelledby="s4">
              <div className="step-h"><div className="num">4</div><div><h2 id="s4">{t.s4Title}</h2><small>{t.s4Hint}</small></div></div>
              {savedSlug ? (
                <Sticker name={name} url={publicUrl} slug={savedSlug} />
              ) : (
                <p className="status">{t.saveFirst}</p>
              )}
              {savedSlug && liveSlug !== savedSlug && !demo && <p className="status err">{t.slugChanged}</p>}
              {!demo && stallId && savedSlug && <OwnerLink stallId={stallId} base={base} initial={ownerKey} />}
            </section>
          </div>

          <aside className="phone-col" aria-label={t.previewLabel}>
            <div className="phone-cap"><span>{t.customersSee}</span><span>{t.dishCount(dishes.length)}</span></div>
            <div className="phone">
              <MenuView name={name} area={area} dishes={dishes.filter((d) => d.vi)} toppings={toppings.filter((tp) => tp.vi.trim())} rates={rates}
                soldOut={previewSold} pay={cleanPay(pay)} maps={cleanMaps(maps)} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
