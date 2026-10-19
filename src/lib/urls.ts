/**
 * Links that staff type into settings (banner buttons, social profiles): a path on this
 * site or an http(s) address. Anything else (javascript:, data:, //host) is dropped, so a
 * stored link can never run script in a customer's browser.
 */
export function safeHref(href: string | null | undefined): string | null {
  const v = (href ?? "").trim();
  if (!v) return null;
  if (/^\/(?!\/)/.test(v) || /^https?:\/\/[^\s]+$/i.test(v)) return v;
  return null;
}
