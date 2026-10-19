"use client";
import { useState } from "react";
import { updateProfile } from "@/server/account";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Checkbox, Field, Input, Notice } from "../../ui/controls";

export default function ProfileForm({ email, initial }: { email: string; initial: { full_name: string; phone: string; marketing_opt_in: boolean } }) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  return (
    <div className="mt-4 grid gap-10 md:grid-cols-2">
      <form
        className="grid content-start gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await updateProfile(form);
          setBusy(false);
          setMsg(res.ok ? { tone: "success", text: res.message ?? "Saved." } : { tone: "error", text: res.error });
        }}
      >
        <Field label="Email" htmlFor="p-email" hint="Contact us to change the email on your account.">
          <Input id="p-email" value={email} readOnly disabled />
        </Field>
        <Field label="Full name" htmlFor="p-name">
          <Input id="p-name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Mobile number" htmlFor="p-phone">
          <Input id="p-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Checkbox label="Email me about new collections and offers" checked={form.marketing_opt_in} onChange={(e) => setForm({ ...form, marketing_opt_in: e.target.checked })} />
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Button type="submit" busy={busy} className="justify-self-start">Save profile</Button>
      </form>
      <form
        className="grid content-start gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.next.length < 8) return setPwMsg({ tone: "error", text: "Use at least 8 characters." });
          if (pw.next !== pw.confirm) return setPwMsg({ tone: "error", text: "The passwords don't match." });
          setPwBusy(true);
          const { error } = await supabaseBrowser().auth.updateUser({ password: pw.next });
          setPwBusy(false);
          setPwMsg(error ? { tone: "error", text: /same|different/i.test(error.message) ? "Choose a password you haven't used before." : "We couldn't change your password. Sign in again and retry." } : { tone: "success", text: "Password changed." });
          if (!error) setPw({ next: "", confirm: "" });
        }}
      >
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <Field label="New password" htmlFor="p-pw">
          <Input id="p-pw" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </Field>
        <Field label="Confirm new password" htmlFor="p-pw2">
          <Input id="p-pw2" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </Field>
        {pwMsg && <Notice tone={pwMsg.tone}>{pwMsg.text}</Notice>}
        <Button type="submit" variant="secondary" busy={pwBusy} className="justify-self-start">Change password</Button>
      </form>
    </div>
  );
}
