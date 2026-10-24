import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CopySqlButton from "@/components/admin/setup/CopySqlButton";
import { Card, PageHeader } from "@/components/admin/ui";
import { Badge, buttonClass, cx, Notice } from "@/components/ui/controls";
import { CheckIcon, DownloadIcon, ExternalIcon } from "@/components/ui/icons";
import { SUPABASE_URL } from "@/lib/env";
import { MIGRATION_NOTES } from "@/lib/schema-status";
import { setupAccess } from "@/lib/setup-access";
import { setupReport, type SetupItem } from "@/lib/setup";

export const metadata: Metadata = { title: "Setup" };
export const dynamic = "force-dynamic";

const STATE: Record<SetupItem["state"], { label: string; tone: "green" | "amber" | "neutral" | "blue" }> = {
  done: { label: "Done", tone: "green" },
  todo: { label: "To do", tone: "amber" },
  optional: { label: "Optional", tone: "neutral" },
  manual: { label: "Check by hand", tone: "blue" },
};

/** Supabase's SQL editor for this project (hosted projects only). */
function sqlEditorUrl() {
  const host = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "";
  return host.endsWith(".supabase.co") ? `https://supabase.com/dashboard/project/${host.split(".")[0]}/sql/new` : null;
}

function Items({ items }: { items: SetupItem[] }) {
  return (
    <ul className="divide-y divide-black/5">
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-4 px-4 py-3">
          <span
            aria-hidden
            className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", i.state === "done" ? "bg-emerald-600 text-white" : "border border-black/20")}
          >
            {i.state === "done" && <CheckIcon size={12} />}
          </span>
          <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span>{i.title}</span> <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
              </p>
              <p className="mt-0.5 text-sm text-taupe">{i.detail}</p>
            </div>
            {i.href && i.state !== "done" && (
              <Link href={i.href} className="mt-1.5 inline-block text-sm whitespace-nowrap underline underline-offset-4 sm:mt-0">{i.action ?? "Open"}</Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** What's done and what's left before the store (and the platform) is ready for customers. */
export default async function SetupPage() {
  const access = await setupAccess();
  if (!access) redirect("/admin?denied=1");
  const report = await setupReport({ store: access.store, platform: access.platform, checkAddress: true });
  const db = report.database;
  const editor = sqlEditorUrl();
  return (
    <>
      <PageHeader
        title="Setup"
        description="What's done and what's left before customers arrive. Checked again every time you open this page."
      />
      {report.todo === 0 ? (
        <Notice tone="success" className="mb-5">Everything here is done.</Notice>
      ) : (
        <p className="mb-5 text-sm text-taupe">{report.todo} {report.todo === 1 ? "step" : "steps"} left.</p>
      )}

      {db && (
        <Card title="Database" className="mb-5" actions={<Badge tone={db.pending.length ? "amber" : "green"}>{db.pending.length ? "Update waiting" : "Up to date"}</Badge>}>
          {!db.applied ? (
            <p className="text-sm text-red-700">The database couldn&apos;t be read. Check that Supabase is running and the environment variables are set.</p>
          ) : !db.pending.length ? (
            <p className="text-sm text-taupe">The database has every update this version of the app needs.</p>
          ) : (
            <div className="grid gap-4 text-sm">
              <div>
                <p className="font-medium">
                  {db.pending.length} {db.pending.length === 1 ? "update" : "updates"} to run once in Supabase, from a computer or a phone:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-taupe">
                  {db.pending.map((m) => (
                    <li key={m.version}>{MIGRATION_NOTES[m.name] ?? m.name.replace(/_/g, " ")}</li>
                  ))}
                </ul>
                <p className="mt-2 text-taupe">The store keeps working as it is until then; these features switch on about a minute after the update runs.</p>
              </div>
              <ol className="grid gap-3">
                <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-white">1</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <CopySqlButton href="/admin/setup/update-sql" />
                    <a href="/admin/setup/update-sql" className="inline-flex items-center gap-1 text-sm underline underline-offset-4"><DownloadIcon size={14} /> or download the file</a>
                  </div>
                </li>
                <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-white">2</span>
                  {editor ? (
                    <a href={editor} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>Open Supabase&apos;s SQL editor <ExternalIcon size={12} /></a>
                  ) : (
                    <span>Open your Supabase project&apos;s SQL editor and start a new query.</span>
                  )}
                </li>
                <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-white">3</span>
                  <span className="text-taupe">Paste the update into the new query and click <strong className="text-ink">Run</strong>. It runs as one step: if anything goes wrong, nothing changes.</span>
                </li>
                <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3">
                  <span className="grid size-6 place-items-center rounded-full bg-ink text-xs text-white">4</span>
                  <span className="text-taupe">Come back and reload this page: it should say the database is up to date.</span>
                </li>
              </ol>
            </div>
          )}
        </Card>
      )}

      <Card title={`This store${access.store.name ? `: ${access.store.name}` : ""}`} padded={false} className="mb-5">
        <Items items={report.store} />
      </Card>

      {report.platform && (
        <Card title="The platform" padded={false}>
          <Items items={report.platform} />
        </Card>
      )}
    </>
  );
}
