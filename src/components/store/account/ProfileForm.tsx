"use client";
import { useState } from "react";
import { updateProfile } from "@/server/account";
import { Button, Checkbox, Field, Input, Notice } from "../../ui/controls";

export default function ProfileForm({ initial, hasEmail }: { initial: { full_name: string; phone: string; marketing_opt_in: boolean }; hasEmail: boolean }) {
  const [form, setForm] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-4 grid max-w-md content-start gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await updateProfile(form);
        setBusy(false);
        setMsg(res.ok ? { tone: "success", text: res.message ?? "Saved." } : { tone: "error", text: res.error });
      }}
    >
      <Field label="Full name" htmlFor="p-name">
        <Input id="p-name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
      </Field>
      <Field label="Contact number" htmlFor="p-phone" hint="Filled in for you at checkout, for the courier.">
        <Input id="p-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      {hasEmail && <Checkbox label="Email me about new collections and offers" checked={form.marketing_opt_in} onChange={(e) => setForm({ ...form, marketing_opt_in: e.target.checked })} />}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button type="submit" busy={busy} className="justify-self-start">Save profile</Button>
    </form>
  );
}
