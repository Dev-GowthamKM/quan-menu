import type { Allergen, Lang } from "./types";

export const ALLERGENS: Record<Allergen, Record<Lang, string>> = {
  peanut: { en: "Peanuts", ko: "땅콩", zh: "花生", ja: "ピーナッツ" },
  shellfish: { en: "Shellfish", ko: "갑각류", zh: "甲壳类", ja: "甲殻類" },
  fish: { en: "Fish sauce", ko: "생선", zh: "鱼露", ja: "魚" },
  egg: { en: "Egg", ko: "계란", zh: "蛋", ja: "卵" },
  dairy: { en: "Dairy", ko: "유제품", zh: "乳制品", ja: "乳" },
  gluten: { en: "Gluten", ko: "글루텐", zh: "麸质", ja: "小麦" },
  soy: { en: "Soy", ko: "대두", zh: "大豆", ja: "大豆" },
  pork: { en: "Pork", ko: "돼지고기", zh: "猪肉", ja: "豚肉" },
  beef: { en: "Beef", ko: "소고기", zh: "牛肉", ja: "牛肉" },
};

export interface LangInfo {
  label: string;
  sym: string;
  /** VND per one unit of this currency. Approximate; update RATES_UPDATED when changed. */
  rate: number;
  dec: number;
  say: string;
  show: (n: number) => string;
  show0: string;
  head: string;
  close: string;
  note: string;
  empty: string;
  soldOut: string;
  mustTry: string;
  pay: string;
  payHint: string;
  copyAcct: string;
  copied: string;
  order: string;
  review: string;
  reviewAsk: string;
}

export const RATES_UPDATED = "2026-10";

export const LANGS: Record<Lang, LangInfo> = {
  en: { label: "English", sym: "$", rate: 26300, dec: 2, say: "Say it", show: (n) => `Show order to vendor (${n})`, show0: "Show order to vendor", head: "Show this screen", close: "Back to menu", note: "Prices set by the stall. $ amounts are approximate.", empty: "This menu has no dishes yet.",
    soldOut: "Sold out today", mustTry: "Must-try", pay: "Pay by bank transfer", payHint: "Scan with your banking app (VietQR). The amount is already filled in. Cash is fine too.", copyAcct: "Copy account number", copied: "Copied", order: "Order", review: "Review us on Google Maps", reviewAsk: "Enjoyed it?" },
  ko: { label: "한국어", sym: "₩", rate: 19, dec: 0, say: "발음", show: (n) => `주문 보여주기 (${n})`, show0: "주문 보여주기", head: "이 화면을 보여주세요", close: "메뉴로 돌아가기", note: "가격은 가게에서 정합니다. ₩ 금액은 대략적인 값입니다.", empty: "아직 메뉴가 없습니다.",
    soldOut: "오늘 품절", mustTry: "추천 메뉴", pay: "계좌이체로 결제", payHint: "은행 앱으로 스캔하세요 (VietQR). 금액이 자동으로 입력됩니다. 현금도 됩니다.", copyAcct: "계좌번호 복사", copied: "복사됨", order: "주문", review: "구글 지도에 리뷰 남기기", reviewAsk: "맛있게 드셨나요?" },
  zh: { label: "中文", sym: "¥", rate: 3650, dec: 1, say: "发音", show: (n) => `给老板看订单 (${n})`, show0: "给老板看订单", head: "请出示此页面", close: "返回菜单", note: "价格由店家设定，人民币金额为约数。", empty: "菜单暂无菜品。",
    soldOut: "今日售罄", mustTry: "招牌必点", pay: "银行转账付款", payHint: "用银行App扫码（VietQR），金额已自动填好。也可以付现金。", copyAcct: "复制账号", copied: "已复制", order: "订单", review: "在谷歌地图上评价我们", reviewAsk: "吃得满意吗？" },
  ja: { label: "日本語", sym: "¥", rate: 175, dec: 0, say: "発音", show: (n) => `店員に注文を見せる (${n})`, show0: "店員に注文を見せる", head: "この画面を見せてください", close: "メニューに戻る", note: "価格は店が設定。円は概算です。", empty: "メニューはまだありません。",
    soldOut: "本日売り切れ", mustTry: "おすすめ", pay: "銀行振込で支払う", payHint: "銀行アプリでスキャンしてください（VietQR）。金額は入力済みです。現金でも大丈夫です。", copyAcct: "口座番号をコピー", copied: "コピーしました", order: "注文", review: "Googleマップで口コミを書く", reviewAsk: "お気に召しましたか？" },
};

export const vnd = (n: number) => (Number(n) || 0).toLocaleString("vi-VN") + " ₫";

/** Approximate price in the customer's currency. `rate` (VND per unit) overrides the fixed rate when a live one is known. */
export function foreign(n: number, lang: Lang, rate?: number) {
  const L = LANGS[lang];
  const v = (Number(n) || 0) / (rate && rate > 0 ? rate : L.rate);
  return "≈ " + L.sym + v.toLocaleString("en-US", { minimumFractionDigits: L.dec, maximumFractionDigits: L.dec });
}

export function guessLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const l = (navigator.language || "en").toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("zh")) return "zh";
  if (l.startsWith("ja")) return "ja";
  return "en";
}
