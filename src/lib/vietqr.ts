/**
 * VietQR bank-transfer codes (NAPAS 247, EMVCo format). Any Vietnamese banking app can scan
 * them; a code with an amount fills the amount in, so the customer pays exactly the order total.
 * Built here rather than through an outside service, so it works with no network and no key.
 */

/** Banks that take VietQR transfers: NAPAS bank code (BIN) and the name vendors know. */
export const BANKS: { bin: string; name: string }[] = [
  { bin: "970436", name: "Vietcombank" },
  { bin: "970415", name: "VietinBank" },
  { bin: "970418", name: "BIDV" },
  { bin: "970405", name: "Agribank" },
  { bin: "970407", name: "Techcombank" },
  { bin: "970422", name: "MB Bank" },
  { bin: "970416", name: "ACB" },
  { bin: "970432", name: "VPBank" },
  { bin: "970423", name: "TPBank" },
  { bin: "970403", name: "Sacombank" },
  { bin: "970437", name: "HDBank" },
  { bin: "970441", name: "VIB" },
  { bin: "970443", name: "SHB" },
  { bin: "970431", name: "Eximbank" },
  { bin: "970426", name: "MSB" },
  { bin: "970448", name: "OCB" },
  { bin: "970440", name: "SeABank" },
  { bin: "970449", name: "LPBank" },
  { bin: "970428", name: "Nam A Bank" },
  { bin: "970409", name: "Bac A Bank" },
  { bin: "970425", name: "ABBANK" },
  { bin: "970454", name: "BVBank (Bản Việt)" },
  { bin: "970412", name: "PVcomBank" },
  { bin: "970429", name: "SCB" },
  { bin: "970452", name: "KienlongBank" },
  { bin: "970433", name: "Vietbank" },
  { bin: "970419", name: "NCB" },
  { bin: "970438", name: "BaoViet Bank" },
  { bin: "970400", name: "Saigonbank" },
  { bin: "970430", name: "PGBank" },
  { bin: "970408", name: "GPBank" },
  { bin: "970406", name: "Vikki Bank (DongA)" },
  { bin: "970414", name: "MBV (OceanBank)" },
  { bin: "970427", name: "VietABank" },
  { bin: "970424", name: "Shinhan Bank" },
  { bin: "970457", name: "Woori Bank" },
  { bin: "970458", name: "UOB" },
  { bin: "970410", name: "Standard Chartered" },
  { bin: "458761", name: "HSBC" },
  { bin: "970421", name: "VRB" },
  { bin: "970434", name: "Indovina Bank" },
  { bin: "970439", name: "Public Bank" },
  { bin: "970446", name: "Co-opBank" },
  { bin: "546034", name: "CAKE by VPBank" },
  { bin: "546035", name: "Ubank by VPBank" },
  { bin: "963388", name: "Timo" },
];

export const bankName = (bin: string) => BANKS.find((b) => b.bin === bin)?.name ?? bin;

/** One EMVCo field: id, two-digit length, value. */
const field = (id: string, value: string) => id + String(value.length).padStart(2, "0") + value;

/** CRC-16/CCITT-FALSE, the checksum EMVCo QR codes end with. */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Transfer notes go through every bank: plain letters, digits and spaces only. */
export const plainNote = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 25);

/**
 * The text inside a VietQR code. With an amount it is a one-time code for that amount;
 * without, it is the account's reusable code.
 */
export function vietQr({ bank, acct, amount, note }: { bank: string; acct: string; amount?: number; note?: string }): string {
  const napas = field("00", "A000000727") + field("01", field("00", bank) + field("01", acct)) + field("02", "QRIBFTTA");
  const sum = amount && amount > 0 ? String(Math.round(amount)) : "";
  const memo = note ? plainNote(note) : "";
  let s = field("00", "01") + field("01", sum ? "12" : "11") + field("38", napas) + field("53", "704");
  if (sum) s += field("54", sum);
  s += field("58", "VN");
  if (memo) s += field("62", field("08", memo));
  s += "6304";
  return s + crc16(s);
}
