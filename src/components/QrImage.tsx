"use client";
import { useEffect, useState } from "react";

/** A QR code as an image. The QR library loads on first use, so pages that never show one stay small. */
export default function QrImage({ text, size = 160, label, className = "" }: { text: string; size?: number; label: string; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((QR) => QR.toDataURL(text, { width: size * 2, margin: 1, errorCorrectionLevel: "M" }))
      .then((url) => { if (live) setSrc(url); })
      .catch(() => {});
    return () => { live = false; };
  }, [text, size]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={"qr-img " + className} src={src} width={size} height={size} alt={label} />
  ) : (
    <div className={"qr-img " + className} style={{ width: size, height: size }} role="img" aria-label={label} />
  );
}
