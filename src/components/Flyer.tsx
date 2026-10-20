"use client";
import { useEffect, useState } from "react";
import QrImage from "./QrImage";
import { LangSwitch, useUi } from "./Ui";

interface Props {
  siteUrl: string;
  name: string;
  phone: string;
}

/**
 * One printed page for walking up to stalls: what Quán does, in Vietnamese, with QR codes that
 * open the sample menus so the owner can try it on their own phone. The text stays Vietnamese
 * whatever the screen language, because it is for Vietnamese stall owners.
 */
export default function Flyer({ siteUrl, name: name0, phone: phone0 }: Props) {
  const { t } = useUi();
  const [name, setName] = useState(name0);
  const [phone, setPhone] = useState(phone0);
  const [base, setBase] = useState(siteUrl);
  useEffect(() => {
    if (!siteUrl) setBase(window.location.origin);
  }, [siteUrl]);

  // Keep the helper's details in the address, so a bookmark or a reload keeps them.
  useEffect(() => {
    const q = new URLSearchParams();
    if (name) q.set("ten", name);
    if (phone) q.set("sdt", phone);
    const qs = q.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [name, phone]);

  return (
    <main className="page flyer-page">
      <div className="wrap">
        <div className="no-print flyer-controls">
          <header className="top">
            <a className="btn" href="/dashboard">{t.flyerBack}</a>
            <LangSwitch />
          </header>
          <h1>{t.flyerTitle}</h1>
          <p className="status">{t.flyerHint}</p>
          <div className="two">
            <label className="f">{t.flyerName}
              <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="f">{t.flyerPhone}
              <input type="text" inputMode="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <div className="row"><button className="btn primary" onClick={() => window.print()}>🖨 {t.flyerPrint}</button></div>
        </div>

        <article className="flyer" lang="vi">
          <div className="fl-badge">MIỄN PHÍ DÙNG THỬ</div>
          <h2>Thực đơn QR 4 thứ tiếng cho quán của bạn</h2>
          <p className="fl-sub">Khách Hàn, Trung, Nhật, Tây quét mã là hiểu món. Không cần hỏi, không cần chỉ trỏ.</p>
          <ul className="fl-list">
            <li>🌏 <b>Khách tự đọc món</b> bằng tiếng Anh, Hàn, Trung, Nhật, có thành phần và giá quy đổi ra tiền của họ.</li>
            <li>👉 <b>Khách bấm chọn món</b> rồi đưa màn hình cho bạn: đơn hiện bằng tiếng Việt.</li>
            <li>💳 <b>Nhận chuyển khoản VietQR</b> đúng số tiền của đơn, không cần nói giá.</li>
            <li>📱 <b>Báo hết món, đổi giá</b> ngay trên điện thoại. Không cần in lại mã.</li>
            <li>⭐ <b>Mời khách đánh giá</b> quán trên Google Maps.</li>
          </ul>
          <div className="fl-qrs">
            <figure>
              <QrImage text={`${base}/m/demo`} size={170} label="Thực đơn mẫu quán ăn" />
              <figcaption>Quét thử: quán ăn</figcaption>
            </figure>
            <figure>
              <QrImage text={`${base}/m/demo-cafe`} size={170} label="Thực đơn mẫu quán nước" />
              <figcaption>Quét thử: quán nước</figcaption>
            </figure>
          </div>
          {(name || phone) && (
            <p className="fl-contact">
              Liên hệ: {name && <b>{name}</b>}{name && phone && " · "}{phone && <>Zalo/ĐT <b>{phone}</b></>}
            </p>
          )}
          <p className="fl-foot">{base.replace(/^https?:\/\//, "")}</p>
        </article>
      </div>
    </main>
  );
}
