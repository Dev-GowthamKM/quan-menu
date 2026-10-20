"use client";
import { useState } from "react";
import { makeOwnerKey, removeOwnerKey } from "@/app/dashboard/actions";
import QrImage from "./QrImage";
import ShareButton from "./ShareButton";
import { useUi } from "./Ui";

interface Props {
  stallId: string;
  /** Site address the link starts with. */
  base: string;
  initial: string | null;
}

/** The secret link a stall owner opens to mark dishes sold out and change prices without an account. */
export default function OwnerLink({ stallId, base, initial }: Props) {
  const { t } = useUi();
  const [token, setToken] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const url = token ? `${base}/k/${token}` : "";

  async function make(replace: boolean) {
    if (replace && !window.confirm(t.ownerConfirmNew)) return;
    setBusy(true);
    setMsg("");
    const r = await makeOwnerKey(stallId).catch(() => ({ ok: false, token: undefined, error: t.ownerFailed }));
    setBusy(false);
    if (r.ok && r.token) setToken(r.token);
    else setMsg(r.error || t.ownerFailed);
  }

  async function off() {
    if (!window.confirm(t.ownerConfirmOff)) return;
    setBusy(true);
    const r = await removeOwnerKey(stallId).catch(() => ({ ok: false }));
    setBusy(false);
    if (r.ok) setToken(null);
    else setMsg(t.ownerFailed);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className="owner-link">
      <div><b>{t.ownerTitle}</b><small className="status">{t.ownerHint}</small></div>
      {url ? (
        <div className="sticker-wrap">
          <figure className="owner-qr">
            <QrImage text={url} size={150} label={t.qrFor(url)} />
            <figcaption>{t.ownerScan}</figcaption>
          </figure>
          <div className="side-note">
            <code>{url}</code>
            <div className="row">
              <ShareButton url={url} text={t.ownerShareText} />
              <button className="btn" type="button" onClick={copy}>{copied ? t.copied : t.copyLink}</button>
            </div>
            <div className="row">
              <button className="icon" type="button" disabled={busy} onClick={() => make(true)}>{t.ownerNew}</button>
              <button className="icon del" type="button" disabled={busy} onClick={off}>{t.ownerOff}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="row"><button className="btn" type="button" disabled={busy} onClick={() => make(false)}>🔑 {t.ownerMake}</button></div>
      )}
      {msg && <p className="status err" aria-live="polite">{msg}</p>}
    </div>
  );
}
