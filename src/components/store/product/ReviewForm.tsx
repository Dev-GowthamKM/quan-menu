"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { submitReview } from "@/server/account";
import { Button, Field, Input, Textarea } from "../../ui/controls";
import { StarIcon } from "../../ui/icons";
import { useStore } from "../StoreProvider";

export default function ReviewForm({ productId }: { productId: string }) {
  const { session, kind } = useStore();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<{ busy?: boolean; text?: string; error?: boolean; done?: boolean }>({});

  if (!session?.user) {
    return (
      <p className="mt-8 text-sm">
        <Link href={`/login?next=${encodeURIComponent(pathname + "#reviews")}`} className="underline underline-offset-4">Sign in</Link> to review a product you have bought.
      </p>
    );
  }
  if (state.done) return <p className="mt-8 text-sm text-ok" role="status">{state.text}</p>;
  if (!open) {
    return (
      <Button variant="secondary" className="mt-8" onClick={() => setOpen(true)}>Write a review</Button>
    );
  }
  return (
    <form
      className="mt-8 grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return setState({ text: "Choose a star rating.", error: true });
        setState({ busy: true });
        const res = await submitReview(productId, rating, title, body);
        setState(res.ok ? { text: res.message, done: true } : { text: res.error, error: true });
      }}
    >
      <fieldset>
        <legend className="text-xs font-medium text-taupe">Your rating</legend>
        <div className="mt-2 flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} type="button" onClick={() => setRating(i)} aria-label={`${i} star${i > 1 ? "s" : ""}`} aria-pressed={rating === i} className="p-0.5">
              <StarIcon size={24} filled={i <= rating} />
            </button>
          ))}
        </div>
      </fieldset>
      <Field label="Title" htmlFor="review-title">
        <Input id="review-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Review" htmlFor="review-body">
        <Textarea id="review-body" rows={4} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind.words.reviewPrompt} />
      </Field>
      {state.text && <p className={state.error ? "text-sm text-sale" : "text-sm text-ok"} role="alert">{state.text}</p>}
      <Button type="submit" busy={state.busy}>Post review</Button>
    </form>
  );
}
