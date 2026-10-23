"use client";
import { useEffect, useState } from "react";
import QrImage from "./QrImage";
import { LangSwitch, useUi } from "./Ui";

interface Props {
  name: string;
  slug: string;
  siteUrl: string;
  count: number;
}

/** One sticker per table, laid out four to an A4 page. The order screen then shows the table number. */
export default function TableCodes({ name, slug, siteUrl, count }: Props) {
  const { t } = useUi();
  const [n, setN] = useState(count);
  const [base, setBase] = useState(siteUrl);
  useEffect(() => {
    if (!siteUrl) setBase(window.location.origin);
  }, [siteUrl]);
  useEffect(() => {
    window.history.replaceState(null, "", `?n=${n}`);
  }, [n]);

  return (
    <main className="page tables-page">
      <div className="wrap">
        <div className="no-print flyer-controls">
          <header className="top">
            <a className="btn" href={`/dashboard?s=${encodeURIComponent(slug)}`}>{t.flyerBack}</a>
            <LangSwitch />
          </header>
          <h1>{t.tablesTitle}</h1>
          <p className="status">{t.tablesHint}</p>
          <div className="row">
            <label className="f" style={{ width: 140 }}>{t.tablesCount}
              <input type="number" min={1} max={60} value={n} onChange={(e) => setN(Math.max(1, Math.min(60, Math.round(Number(e.target.value)) || 1)))} />
            </label>
            <button className="btn primary" style={{ alignSelf: "end" }} onClick={() => window.print()}>🖨 {t.tablesPrint}</button>
          </div>
        </div>
        <div className="tcodes">
          {Array.from({ length: n }, (_, k) => String(k + 1)).map((b) => (
            <div className="sticker tcode" key={b}>
              <div className="scan">Quét để xem thực đơn</div>
              <div className="sn">{name}</div>
              <QrImage text={`${base}/m/${slug}?b=${b}`} size={170} label={t.qrFor(`${base}/m/${slug}?b=${b}`)} />
              <div className="tno">Bàn {b} · Table {b}</div>
              <div className="langs">Menu · 메뉴 · 菜单 · メニュー</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
