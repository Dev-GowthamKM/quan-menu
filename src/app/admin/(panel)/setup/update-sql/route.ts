import { NextResponse } from "next/server";
import { schemaStatus, updateSql } from "@/lib/schema-status";
import { setupAccess } from "@/lib/setup-access";

export const dynamic = "force-dynamic";

/** The database update this deployment's database still needs, as one SQL file (platform admins). */
export async function GET() {
  const access = await setupAccess();
  if (!access?.platform) return NextResponse.json({ error: "Only the platform's administrators can download database updates." }, { status: 403 });
  const status = await schemaStatus();
  if (!status.applied) return NextResponse.json({ error: "The database couldn't be read." }, { status: 503 });
  const body = status.pending.length ? updateSql(status) : "-- The database is up to date: there's nothing to run.\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="update-after-${status.applied}.sql"`,
      "Cache-Control": "no-store",
    },
  });
}
