import { NextResponse } from "next/server";

/**
 * Home-screen app for the owner page: opens this stall's owner link rather than the editor,
 * so an owner who "adds to home screen" gets a one-tap way back to it.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(
    {
      name: "Quán · Chủ quán",
      short_name: "Quán",
      lang: "vi",
      start_url: `/k/${token}`,
      scope: `/k/${token}`,
      display: "standalone",
      background_color: "#eef2ef",
      theme_color: "#14211c",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "content-type": "application/manifest+json", "cache-control": "private, max-age=3600", "referrer-policy": "no-referrer" } },
  );
}
