"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quickPrice, quickSoldOut } from "@/app/k/[token]/actions";
import type { SizeKey } from "@/lib/types";
import { useUi } from "./Ui";

export interface QuickDish {
  id: string;
  vi: string;
  price: number;
  sizes?: { k: SizeKey; price: number }[];
}

export interface QuickData {
  stall: { name: string; slug: string; published: boolean };
  /** Dishes sold out today. */
  soldOut: string[];
  dishes: QuickDish[];
  views: { today: number; week: number };
}

/** The owner's own page: big buttons for "sold out" and price changes, for use on a phone at the stall. */
export default function OwnerQuick({ token, data }: { token: string; data: QuickData }) {
  const { t } = useUi();
  const router = useRouter();
  const [sold, setSold] = useState(data.soldOut);
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>({ text: "" });
  const req = useRef(0);
  const { stall } = data;

  useEffect(() => setSold(data.soldOut), [data]);

  async function toggle(vi: string) {
    const on = !sold.includes(vi);
    const n = ++req.current;
    setSold((s) => (on ? [...s, vi] : s.filter((x) => x !== vi)));
    setMsg({ text: "" });
    const r = await quickSoldOut(token, stall.slug, vi, on).catch(() => ({ ok: false, names: undefined }));
    if (!r.ok) {
      setSold((s) => (on ? s.filter((x) => x !== vi) : [...s, vi]));
      setMsg({ text: t.qFailed, err: true });
    } else if (n === req.current && r.names) {
      setSold(r.names);
    }
  }

  const reloaded = () => {
    setMsg({ text: t.qChanged, err: true });
    router.refresh();
  };

  return (
    <section className="quick-card">
      <div>
        <h1>{stall.name}</h1>
        <small className="status">{t.qSub}</small>
      </div>
      <p className="views">👀 {t.viewsLine(data.views.today, data.views.week)}</p>
      {!stall.published && <p className="status err">{t.qDraft}</p>}
      <p className="status">{t.qSoldHint}</p>
      {!data.dishes.length && <p className="status">{t.qNoDishes}</p>}
      <ul className="qlist">
        {data.dishes.map((d) => (
          <QuickRow key={d.id} d={d} out={sold.includes(d.vi)} onToggle={() => toggle(d.vi)} token={token} slug={stall.slug} onGone={reloaded} />
        ))}
      </ul>
      <p className={"status" + (msg.err ? " err" : "")} aria-live="polite">{msg.text}</p>
      {stall.published && <a className="btn" href={`/m/${stall.slug}`} target="_blank" rel="noreferrer">{t.qOpenMenu}</a>}
      <small className="status">{t.qHomeTip}</small>
    </section>
  );
}

function QuickRow({ d, out, onToggle, token, slug, onGone }: {
  d: QuickDish; out: boolean; onToggle: () => void; token: string; slug: string; onGone: () => void;
}) {
  const { t } = useUi();
  // One price, or one per size. "_" is the single price.
  const start: Record<string, number> = d.sizes ? Object.fromEntries(d.sizes.map((z) => [z.k, z.price])) : { _: d.price };
  const [vals, setVals] = useState(start);
  const [saved, setSaved] = useState(start);
  const [state, setState] = useState<"" | "saving" | "saved" | "err">("");
  const changed = Object.keys(vals).some((k) => vals[k] !== saved[k]);

  async function save() {
    setState("saving");
    const first = d.sizes ? vals[d.sizes[0].k] : vals._;
    const r = await quickPrice(token, slug, d.id, first, d.sizes ? vals : undefined).catch(() => ({ ok: false, gone: false }));
    if (r.ok) {
      setSaved(vals);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "" : s)), 1500);
    } else if (r.gone) {
      onGone();
    } else {
      setState("err");
    }
  }

  const input = (k: string, label: string) => (
    <label key={k} className="qp">
      <span>{label}</span>
      <input type="number" min={0} step={1000} inputMode="numeric" aria-label={`${d.vi} ${label}`} value={vals[k] || ""}
        onChange={(e) => { setVals({ ...vals, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) }); setState(""); }} />
    </label>
  );

  return (
    <li className={"qrow" + (out ? " gone" : "")}>
      <div className="qtop">
        <b>{d.vi}</b>
        <div className="seg" role="group" aria-label={d.vi}>
          <button type="button" aria-pressed={!out} onClick={() => out && onToggle()}>{t.qAvail}</button>
          <button type="button" aria-pressed={out} onClick={() => !out && onToggle()}>{t.qSold}</button>
        </div>
      </div>
      <div className="qprice">
        {d.sizes ? d.sizes.map((z) => input(z.k, z.k)) : input("_", t.qPrices)}
        <span className="qcur">₫</span>
        <button className="btn" type="button" disabled={!changed || state === "saving"} onClick={save}>
          {state === "saved" ? `✓ ${t.qSaved}` : t.qSavePrice}
        </button>
      </div>
      {state === "err" && <small className="status err">{t.qFailed}</small>}
    </li>
  );
}
