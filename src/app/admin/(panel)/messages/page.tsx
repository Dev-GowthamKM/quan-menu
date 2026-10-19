import Link from "next/link";
import type { Metadata } from "next";
import MessageActions from "@/components/admin/sales/MessageActions";
import { PageHeader, Pager, pageOf, sp, withParams } from "@/components/admin/ui";
import { Badge, cx, Notice } from "@/components/ui/controls";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Messages" };

const PAGE_SIZE = 30;
type Params = Record<string, string | string[] | undefined>;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase } = await requireRole("staff");
  const params = await searchParams;
  const page = pageOf(params);
  const view = sp(params, "view") === "closed" ? "closed" : "open";
  const { data, count, error } = await supabase
    .from("contact_messages")
    .select("id, name, email, order_number, subject, message, status, created_at", { count: "exact" })
    .in("status", view === "open" ? ["new", "open"] : ["closed"])
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  return (
    <>
      <PageHeader title="Messages" description="Sent from the contact page. Reply by email; mark a message done when it's handled." />
      {error && <Notice tone="error" className="mb-4">{error.message}</Notice>}
      <nav aria-label="Message views" className="mb-4 flex gap-1 border-b border-black/10">
        {[["open", "Inbox"], ["closed", "Done"]].map(([k, label]) => (
          <Link key={k} href={k === "open" ? "/admin/messages" : "/admin/messages?view=closed"} aria-current={view === k ? "page" : undefined}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm", view === k ? "border-ink font-medium" : "border-transparent text-taupe hover:text-ink")}>{label}</Link>
        ))}
      </nav>
      {!data?.length ? (
        <p className="rounded-lg border border-dashed border-black/15 bg-white px-6 py-14 text-center text-sm text-taupe">{view === "open" ? "No messages waiting." : "Nothing here yet."}</p>
      ) : (
        <ul className="grid gap-3">
          {data.map((m) => (
            <li key={m.id} className="rounded-lg border border-black/10 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.subject || "Message"}</span>
                {m.status === "new" && <Badge tone="amber">New</Badge>}
                {m.order_number && <Link href={`/admin/orders/${m.order_number}`} className="text-xs underline">Order {m.order_number}</Link>}
                <span className="ml-auto text-xs text-stone">{formatDateTime(m.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-taupe">{m.name} · <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "your message"}`)}`} className="underline">{m.email}</a></p>
              <p className="mt-2 text-sm whitespace-pre-line">{m.message}</p>
              <MessageActions id={m.id} email={m.email} subject={m.subject} status={m.status as "new" | "open" | "closed"} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={(p) => withParams("/admin/messages", params, { page: p })} />
    </>
  );
}
