"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendWhatsappTest } from "@/server/admin/messaging";
import { saveSettings } from "@/server/admin/store";
import { WHATSAPP_EVENTS, type TemplateSetting, type WhatsAppEvent } from "@/lib/whatsapp-format";
import { Badge, Button, cx } from "../../ui/controls";
import { Toggle } from "../fields";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

type Templates = Partial<Record<WhatsAppEvent, TemplateSetting>>;

/** Settings › WhatsApp: the on/off switch, a template per order event and a test message. */
export default function WhatsAppSettings({ enabled, templates, connected }: { enabled: boolean; templates: Templates; connected: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [t, setT] = useState<Templates>(() =>
    Object.fromEntries(WHATSAPP_EVENTS.map((e) => [e.key, { name: templates[e.key]?.name ?? "", language: templates[e.key]?.language || "en" }])),
  );
  const [phone, setPhone] = useState("");
  const [open, setOpen] = useState<WhatsAppEvent | null>(null);

  const save = () =>
    start(async () => {
      const res = await saveSettings("whatsapp", { whatsapp_enabled: on, whatsapp_templates: t });
      if (!res.ok) return toast(res.error, "error");
      toast("WhatsApp settings saved.");
      router.refresh();
    });

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Card title="WhatsApp order updates" actions={<Badge tone={connected ? "green" : "neutral"}>{connected ? "Connected" : "Not connected"}</Badge>}>
        <div className="grid gap-4">
          <p className="text-sm text-taupe">
            Customers who tick &ldquo;Send my order updates on WhatsApp&rdquo; at checkout get the same updates as their emails, through the
            WhatsApp Business Platform. WhatsApp only delivers messages a business starts if they use a template it approved, so create each
            template in WhatsApp Manager (category <em>Utility</em>) and enter its name here. Leave a name empty to skip that update.
          </p>
          <Toggle
            label="Send order updates on WhatsApp to customers who opt in"
            hint={connected ? "The checkout shows the opt-in box while this is on." : "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server first."}
            checked={on}
            onChange={setOn}
          />
        </div>
      </Card>

      <Card title="Templates" padded={false}>
        <ul className="divide-y divide-black/5">
          {WHATSAPP_EVENTS.map((e) => (
            <li key={e.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_7rem] sm:items-center">
              <div>
                <p className="text-sm font-medium">{e.label}</p>
                <button type="button" className="text-xs underline" onClick={() => setOpen(open === e.key ? null : e.key)} aria-expanded={open === e.key}>
                  {open === e.key ? "Hide suggested text" : "Suggested text"}
                </button>
              </div>
              <label className="grid gap-1 text-xs font-medium text-taupe">
                Template name
                <input
                  value={t[e.key]?.name ?? ""}
                  onChange={(ev) => setT({ ...t, [e.key]: { ...t[e.key]!, name: ev.target.value.trim().toLowerCase() } })}
                  placeholder={`e.g. ${e.key}`}
                  className={cx(adminInput, "font-mono")}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-taupe">
                Language
                <input value={t[e.key]?.language ?? "en"} onChange={(ev) => setT({ ...t, [e.key]: { ...t[e.key]!, language: ev.target.value.trim() } })} className={cx(adminInput, "font-mono")} />
              </label>
              {open === e.key && (
                <div className="rounded-md bg-black/[0.03] px-3 py-2.5 text-xs leading-relaxed sm:col-span-3">
                  <p className="font-medium">Values sent, in order</p>
                  <ol className="mt-1 text-taupe">{e.params.map((p, i) => <li key={p}><span className="font-mono">{`{{${i + 1}}}`}</span> {p}</li>)}</ol>
                  <p className="mt-2 font-medium">Suggested template text</p>
                  <pre className="mt-1 font-sans whitespace-pre-wrap text-taupe">{e.sample}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Send a test">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-taupe">
            Mobile number
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+91 98450 12345" className={cx(adminInput, "w-52")} />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={!connected || pending || !phone.trim()}
            onClick={() =>
              start(async () => {
                const res = await sendWhatsappTest(phone);
                toast(res.ok ? res.message ?? "Sent." : res.error, res.ok ? undefined : "error");
              })
            }
          >
            Send WhatsApp test
          </Button>
        </div>
        <p className="mt-2 text-xs text-stone">Sends Meta&apos;s ready-made &ldquo;hello_world&rdquo; template, to check the connection.</p>
      </Card>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-black/10 bg-[#f5f5f3]/95 px-1 py-3 backdrop-blur">
        <Button type="submit" size="sm" busy={pending}>Save changes</Button>
      </div>
    </form>
  );
}
