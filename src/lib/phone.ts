// Indian mobile numbers, as shoppers type them and as Supabase Auth stores them (country
// code, no plus). Shared by the sign-in form and the server.

/**
 * "+91 98450 12345", "098450-12345", "9845012345" and "919845012345" all become
 * "919845012345". Returns null for landlines and numbers from other countries.
 */
export function indianMobile(input: string | null | undefined): string | null {
  let n = String(input ?? "").replace(/[\s().+-]/g, "");
  if (!/^\d+$/.test(n)) return null;
  if (n.length === 11 && n.startsWith("0")) n = n.slice(1);
  if (n.length === 10) n = `91${n}`;
  return /^91[6-9]\d{9}$/.test(n) ? n : null;
}

/** "919845012345" becomes "+91 98450 12345"; anything else is returned as it is. */
export function formatIndianMobile(input: string | null | undefined) {
  const n = indianMobile(input);
  return n ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : String(input ?? "");
}

/** For logs: "+91 98•••••345". */
export function maskMobile(input: string | null | undefined) {
  const n = indianMobile(input);
  return n ? `+91 ${n.slice(2, 4)}•••••${n.slice(-3)}` : "(invalid number)";
}
