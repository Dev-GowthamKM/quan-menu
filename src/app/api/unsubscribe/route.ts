import { NextResponse } from "next/server";
import { verifyUnsubscribe } from "@/lib/signed-links";
import { storeService } from "@/lib/store";

export const dynamic = "force-dynamic";

/** One-click unsubscribe (RFC 8058): mail apps POST here from the List-Unsubscribe header (on the store's own address). */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") ?? "").toLowerCase();
  if (!email || !verifyUnsubscribe(email, url.searchParams.get("s"))) {
    return NextResponse.json({ error: "invalid link" }, { status: 400 });
  }
  const { error } = await (await storeService()).rpc("email_unsubscribe", { p_email: email });
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
