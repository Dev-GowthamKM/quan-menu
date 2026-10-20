"use client";
import { useEffect, useState } from "react";
import { useUi } from "./Ui";

/**
 * Opens the phone's share sheet (Zalo, Messenger, SMS…). Shown only where the browser can share;
 * elsewhere the Copy link button next to it does the job.
 */
export default function ShareButton({ url, title, text }: { url: string; title?: string; text?: string }) {
  const { t } = useUi();
  const [can, setCan] = useState(false);
  useEffect(() => setCan(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  if (!can) return null;
  return (
    <button className="btn" type="button" onClick={() => navigator.share({ url, title, text }).catch(() => {})}>
      📤 {t.share}
    </button>
  );
}
