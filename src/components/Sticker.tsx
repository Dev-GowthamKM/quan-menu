"use client";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import ShareButton from "./ShareButton";
import { useUi } from "./Ui";

interface Props {
  name: string;
  url: string;
  slug: string;
}

const FONT = "'Be Vietnam Pro', system-ui, sans-serif";

export default function Sticker({ name, url, slug }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const { t } = useUi();

  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, url, { width: 360, margin: 0, errorCorrectionLevel: "M" }).catch(() => {});
  }, [url]);

  async function download() {
    const W = 900, H = 1200;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d")!;
    await document.fonts?.ready;
    g.fillStyle = "#FFD23F";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#1A1405";
    g.textAlign = "center";
    g.font = `800 40px ${FONT}`;
    g.fillText("QUÉT ĐỂ XEM THỰC ĐƠN", W / 2, 110);
    g.font = `800 72px ${FONT}`;
    g.fillText(name || "Quán", W / 2, 210, W - 80);
    g.fillStyle = "#fff";
    g.fillRect(150, 270, 600, 600);
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, url, { width: 560, margin: 0, errorCorrectionLevel: "M" });
    g.drawImage(qr, 170, 290, 560, 560);
    g.fillStyle = "#1A1405";
    g.font = `600 44px ${FONT}`;
    g.fillText("Menu · 메뉴 · 菜单 · メニュー", W / 2, 960);
    g.font = `500 32px ${FONT}`;
    g.fillText("English · 한국어 · 中文 · 日本語", W / 2, 1020);
    const a = document.createElement("a");
    a.download = `quan-qr-${slug}.png`;
    a.href = c.toDataURL("image/png");
    a.click();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="sticker-wrap">
      <div className="sticker">
        <div className="scan">Quét để xem thực đơn</div>
        <div className="sn">{name || t.yourStall}</div>
        <canvas ref={ref} aria-label={t.qrFor(url)} />
        <div className="langs">Menu · 메뉴 · 菜单 · メニュー</div>
      </div>
      <div className="side-note">
        <span>{t.codeOpens}</span>
        <code>{url}</code>
        <div className="row">
          <button className="btn" onClick={download}>{t.downloadSticker}</button>
          <ShareButton url={url} title={t.shareMenuText(name)} />
          <button className="btn" onClick={copy}>{copied ? t.copied : t.copyLink}</button>
        </div>
      </div>
    </div>
  );
}
