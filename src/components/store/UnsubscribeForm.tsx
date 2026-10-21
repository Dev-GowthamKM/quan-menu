"use client";
import { useState, useTransition } from "react";
import { unsubscribe } from "@/server/reminders";
import { Button, Notice } from "../ui/controls";

export default function UnsubscribeForm({ email, signature }: { email: string; signature: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  if (result?.ok) return <Notice tone="success" className="mt-8">{result.text}</Notice>;
  return (
    <div className="mt-8">
      {result && <Notice tone="error" className="mb-4">{result.text}</Notice>}
      <Button
        busy={pending}
        disabled={!email || !signature}
        onClick={() =>
          start(async () => {
            const res = await unsubscribe(email, signature);
            setResult(res.ok ? { ok: true, text: res.message ?? "You're unsubscribed." } : { ok: false, text: res.error });
          })
        }
      >
        Unsubscribe from reminders
      </Button>
    </div>
  );
}
