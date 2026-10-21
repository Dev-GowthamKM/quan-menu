"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendLoginCodeTest } from "@/server/admin/messaging";
import { saveSettings } from "@/server/admin/store";
import { Badge, Button, cx } from "../../ui/controls";
import { Toggle } from "../fields";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

export interface PhoneSignInStatus {
  /** Supabase: the Phone provider is on, and numbers must be confirmed. Null when unreadable. */
  supabase: { phone: boolean; confirmations: boolean } | null;
  hookSecret: boolean;
  msg91: boolean;
  whatsapp: boolean;
  hookUrl: string;
}

type Channel = "sms" | "whatsapp";

function Check({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className={cx("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] text-white", ok ? "bg-emerald-600" : ok === null ? "bg-stone" : "bg-sale")}>
        {ok ? "✓" : ok === null ? "?" : "✕"}
      </span>
      <span>
        <span className="sr-only">{ok ? "Done: " : ok === null ? "Unknown: " : "To do: "}</span>
        {children}
      </span>
    </li>
  );
}

/** Settings › Sign-in: let customers sign in with a mobile number and a one-time code. */
export default function PhoneSignInSettings({
  initial,
  status,
  storeName,
}: {
  initial: { enabled: boolean; channel: Channel; template: string; language: string };
  status: PhoneSignInStatus;
  storeName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const [phone, setPhone] = useState("");
  const channelReady = v.channel === "whatsapp" ? status.whatsapp && !!v.template : status.msg91;
  const ready = !!status.supabase?.phone && !!status.supabase?.confirmations && status.hookSecret && channelReady;

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveSettings("signin", {
            phone_login_enabled: v.enabled,
            phone_login_channel: v.channel,
            whatsapp_login_template: v.template,
            whatsapp_login_language: v.language,
          });
          if (!res.ok) return toast(res.error, "error");
          toast("Sign-in settings saved.");
          router.refresh();
        });
      }}
    >
      <Card title="Sign in with a mobile number" actions={<Badge tone={initial.enabled ? "green" : "neutral"}>{initial.enabled ? "On" : "Off"}</Badge>}>
        <div className="grid gap-4">
          <p className="text-sm text-taupe">
            Customers can sign in, or create an account, with their mobile number and a 6-digit code instead of a password, and customers
            with an email account can add their number to sign in either way. Supabase creates and checks the codes; the store sends them
            by SMS through MSG91 or on WhatsApp. Staff accounts always sign in with email and password.
          </p>
          <ul className="grid gap-2 text-sm">
            <Check ok={status.supabase ? status.supabase.phone : null}>Phone sign-in is on in Supabase <span className="text-stone">(Authentication › Sign In / Providers › Phone)</span></Check>
            <Check ok={status.supabase ? status.supabase.confirmations : null}>Supabase asks for phone confirmation <span className="text-stone">(Confirm phone, on the same page)</span></Check>
            <Check ok={status.hookSecret}>
              The Send SMS hook points at <span className="font-mono text-xs break-all">{status.hookUrl}</span> and its secret is in SUPABASE_SMS_HOOK_SECRET
            </Check>
            {v.channel === "sms" ? (
              <Check ok={status.msg91}>MSG91 is connected <span className="text-stone">(MSG91_AUTH_KEY and MSG91_TEMPLATE_ID)</span></Check>
            ) : (
              <Check ok={status.whatsapp && !!v.template}>WhatsApp is connected and the authentication template is named below</Check>
            )}
          </ul>
          <Toggle
            label="Let customers sign in with their mobile number"
            hint={ready ? "Sign-in and sign-up pages show “Continue with mobile number” while this is on." : "Finish the steps above first. README › Mobile sign-in walks through each one."}
            checked={v.enabled}
            onChange={(enabled) => setV({ ...v, enabled })}
          />
        </div>
      </Card>

      <Card title="How codes are sent">
        <fieldset className="grid gap-3">
          <legend className="sr-only">How codes are sent</legend>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="radio" name="channel" className="mt-0.5 size-4 accent-ink" checked={v.channel === "sms"} onChange={() => setV({ ...v, channel: "sms" })} />
            <span>
              SMS through MSG91 <span className="block text-xs text-stone">Reaches every phone. Indian rules (DLT) need a registered sender ID and message template first.</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="radio" name="channel" className="mt-0.5 size-4 accent-ink" checked={v.channel === "whatsapp"} onChange={() => setV({ ...v, channel: "whatsapp" })} />
            <span>
              WhatsApp <span className="block text-xs text-stone">Usually cheaper and quicker, with a copy-code button. Only for customers who use WhatsApp on that number.</span>
            </span>
          </label>
        </fieldset>
        {v.channel === "sms" ? (
          <div className="mt-4 rounded-md bg-black/[0.03] px-3 py-2.5 text-xs leading-relaxed">
            <p className="font-medium">Suggested SMS template (register it on the DLT portal, then add it in MSG91)</p>
            <p className="mt-1 text-taupe">
              Your {storeName} sign-in code is ##otp##. It is valid for 5 minutes. Do not share it with anyone.
            </p>
            <p className="mt-2 text-taupe">The code&apos;s variable must be named <span className="font-mono">otp</span>. MSG91&apos;s template id goes in MSG91_TEMPLATE_ID.</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <label className="grid gap-1 text-xs font-medium text-taupe">
                Authentication template name
                <input value={v.template} onChange={(e) => setV({ ...v, template: e.target.value.trim().toLowerCase() })} placeholder="e.g. login_code" className={cx(adminInput, "font-mono")} />
              </label>
              <label className="grid gap-1 text-xs font-medium text-taupe">
                Language
                <input value={v.language} onChange={(e) => setV({ ...v, language: e.target.value.trim() })} className={cx(adminInput, "font-mono")} />
              </label>
            </div>
            <p className="text-xs text-stone">
              In WhatsApp Manager, create a template in the <em>Authentication</em> category with a <em>Copy code</em> button. WhatsApp writes
              the text itself (&ldquo;123456 is your verification code&rdquo;); turn on the expiry note and set it to 5 minutes.
            </p>
          </div>
        )}
      </Card>

      <Card title="Send a test code">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium text-taupe">
            Mobile number
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="98450 12345" className={cx(adminInput, "w-52")} />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !phone.trim()}
            onClick={() =>
              start(async () => {
                const res = await sendLoginCodeTest(phone, { channel: v.channel, template: v.template, language: v.language });
                toast(res.ok ? res.message ?? "Sent." : res.error, res.ok ? undefined : "error");
              })
            }
          >
            Send test code
          </Button>
        </div>
        <p className="mt-2 text-xs text-stone">Sends a made-up code with the settings above, saved or not, and shows it here so you can compare.</p>
      </Card>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-black/10 bg-[#f5f5f3]/95 px-1 py-3 backdrop-blur">
        <Button type="submit" size="sm" busy={pending}>Save changes</Button>
      </div>
    </form>
  );
}
