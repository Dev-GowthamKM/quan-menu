"use client";
import { BANKS, vietQr } from "@/lib/vietqr";
import { cleanMaps, cleanPay, type Pay } from "@/lib/types";
import QrImage from "./QrImage";
import { useUi } from "./Ui";

interface Props {
  pay: Pay;
  maps: string;
  onPay: (p: Pay) => void;
  onMaps: (m: string) => void;
}

/** Bank transfer details (for the VietQR code customers pay with) and the stall's Google Maps link. */
export default function PaySettings({ pay, maps, onPay, onMaps }: Props) {
  const { t } = useUi();
  const clean = cleanPay(pay);
  const acctBad = !!pay.bank && !!pay.acct.trim() && !clean;
  const mapsBad = !!maps.trim() && !cleanMaps(maps);
  return (
    <div className="extras">
      <b>{t.extrasTitle}</b>
      <fieldset>
        <legend className="f">{t.payTitle}</legend>
        <small className="status">{t.payHint}</small>
        <div className="two">
          <label className="f">{t.bank}
            <select value={pay.bank} onChange={(e) => onPay({ ...pay, bank: e.target.value })}>
              <option value="">{t.bankNone}</option>
              {BANKS.map((b) => <option key={b.bin} value={b.bin}>{b.name}</option>)}
            </select>
          </label>
          <label className="f">{t.acct}
            <input type="text" value={pay.acct} autoComplete="off" disabled={!pay.bank}
              onChange={(e) => onPay({ ...pay, acct: e.target.value })} />
          </label>
        </div>
        <label className="f">{t.acctName}
          <input type="text" value={pay.name} placeholder="NGUYEN VAN A" autoComplete="off" disabled={!pay.bank}
            onChange={(e) => onPay({ ...pay, name: e.target.value })} />
        </label>
        {acctBad && <small className="status err">{t.payBadAcct}</small>}
        {clean && (
          <div className="paycheck">
            <QrImage text={vietQr({ bank: clean.bank, acct: clean.acct })} size={112} label={t.payCheck} />
            <small className="status">{t.payCheck}</small>
          </div>
        )}
      </fieldset>
      <label className="f">{t.mapsTitle}
        <input type="text" inputMode="url" value={maps} placeholder="https://maps.app.goo.gl/…" autoComplete="off"
          onChange={(e) => onMaps(e.target.value)} />
      </label>
      <small className={"status" + (mapsBad ? " err" : "")}>{mapsBad ? t.mapsBad : t.mapsHint}</small>
    </div>
  );
}
