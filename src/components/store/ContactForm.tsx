"use client";
import { useState } from "react";
import { sendContactMessage } from "@/server/account";
import { Button, Field, Input, Notice, Textarea } from "../ui/controls";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", order_number: "", subject: "", message: "" });
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  if (state.done) return <Notice tone="success" className="self-start">{state.done}</Notice>;
  return (
    <form
      className="grid content-start gap-5 bg-paper p-6 md:p-10"
      onSubmit={async (e) => {
        e.preventDefault();
        setState({ busy: true });
        const res = await sendContactMessage(form);
        setState(res.ok ? { done: res.message } : { error: res.error });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="c-name" required><Input id="c-name" required autoComplete="name" value={form.name} onChange={set("name")} /></Field>
        <Field label="Email" htmlFor="c-email" required><Input id="c-email" type="email" required autoComplete="email" value={form.email} onChange={set("email")} /></Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Order number (optional)" htmlFor="c-order"><Input id="c-order" value={form.order_number} onChange={set("order_number")} placeholder="TA100123" /></Field>
        <Field label="Subject" htmlFor="c-subject"><Input id="c-subject" value={form.subject} onChange={set("subject")} /></Field>
      </div>
      <Field label="Message" htmlFor="c-message" required><Textarea id="c-message" required rows={6} minLength={10} value={form.message} onChange={set("message")} /></Field>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" size="lg" busy={state.busy} className="justify-self-start">Send message</Button>
    </form>
  );
}
