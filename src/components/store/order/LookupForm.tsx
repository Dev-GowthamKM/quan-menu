"use client";
import Link from "next/link";
import { useActionState } from "react";
import { lookupOrder } from "@/server/orders";
import { Button, Field, Input, Notice } from "../../ui/controls";

export default function LookupForm() {
  const [state, action, pending] = useActionState(lookupOrder, {});
  return (
    <form action={action} className="grid gap-5">
      <Field label="Order number" htmlFor="orderNumber">
        <Input id="orderNumber" name="orderNumber" required placeholder="TA100123" autoCapitalize="characters" />
      </Field>
      <Field label="Email" htmlFor="lookup-email">
        <Input id="lookup-email" name="email" type="email" required autoComplete="email" />
      </Field>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" size="lg" busy={pending} className="w-full">Find my order</Button>
      <p className="text-center text-sm text-taupe">
        Have an account? <Link href="/account/orders" className="text-ink underline underline-offset-4">See all your orders</Link>
      </p>
    </form>
  );
}
