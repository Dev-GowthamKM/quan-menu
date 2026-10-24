/** JSON-LD for a <script> tag, escaped so content can never close the tag early. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/** A path on a store's site as a full address (origin: the store's, from storeOrigin). */
export const absoluteUrl = (origin: string, path: string) => (/^https?:\/\//.test(path) ? path : `${origin}${path.startsWith("/") ? "" : "/"}${path}`);

/** Plain-text excerpt for meta descriptions. */
export function excerpt(text: string | null | undefined, max = 155) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : clean;
}
