import { getSettings } from "@/lib/settings";
import { badgeSvg, storeBadge } from "@/lib/store-badge";
import { requestStore } from "@/lib/store";
import { onColor, themeOf } from "@/lib/theme";

// The page the store's app shows when it can't reach the store (public/sw.js keeps a copy): one
// self-contained page in the store's colours, with its badge and a button to try again.

const escapeHtml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET() {
  const store = await requestStore();
  const s = await getSettings(store.id);
  const { colors } = themeOf(s);
  const name = escapeHtml(s.store_name);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="${colors.background}">
<title>You're offline · ${name}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;text-align:center;
background:${colors.background};color:${colors.text};font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{font-size:1.75rem;margin:20px 0 8px}
p{margin:0 auto;max-width:26rem;line-height:1.55;opacity:.8}
button{margin-top:24px;border:0;border-radius:999px;padding:12px 24px;font:inherit;font-weight:600;cursor:pointer;
background:${colors.brand};color:${onColor(colors.brand, colors)}}
</style>
</head>
<body>
<main>
${badgeSvg(storeBadge(s), 56)}
<h1>You're offline</h1>
<p>${name} needs an internet connection. Check yours, then try again. Your bag is saved.</p>
<button type="button" onclick="location.reload()">Try again</button>
</main>
</body>
</html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
