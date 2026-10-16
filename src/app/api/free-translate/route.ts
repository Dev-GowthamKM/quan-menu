import { NextResponse } from "next/server";
import { freeTranslate } from "@/lib/free-translate";
import { requireVendor } from "@/lib/guard";
import { serverT } from "@/lib/server-ui";

export const maxDuration = 30;

/** Free machine translation for dishes that aren't on the built-in list (no AI key needed). */
export async function POST(req: Request) {
  const denied = await requireVendor();
  if (denied) return denied;
  const t = await serverT();
  let names: string[] = [];
  try {
    const body = await req.json();
    names = (Array.isArray(body?.names) ? body.names : [])
      .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0)
      .map((n: string) => n.trim().slice(0, 80));
  } catch {}
  if (!names.length) return NextResponse.json({ error: t.srvNoNames }, { status: 400 });
  if (names.length > 10) return NextResponse.json({ error: t.srvTooMany }, { status: 400 });
  return NextResponse.json({ names: await freeTranslate(names) });
}
