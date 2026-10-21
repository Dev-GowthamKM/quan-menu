"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatIndianMobile, indianMobile } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mergeGuestCart } from "@/server/cart";
import { phoneSignInComplete, saveName } from "@/server/phone-auth";
import { Button, Field, Input, Notice } from "../../ui/controls";

export type CodeChannel = "sms" | "whatsapp";

const RESEND_SECONDS = 60;

/** Supabase Auth's errors in words a shopper can act on. The store's own hook messages pass through. */
export function phoneAuthMessage(error: { message?: string; status?: number }) {
  const m = error.message ?? "";
  const wait = m.match(/after (\d+) seconds?/i);
  if (wait) return `Please wait ${wait[1]} seconds before asking for another code.`;
  if (/expired|is invalid|otp_/i.test(m)) return "That code is wrong or has expired. Check it, or send a new one.";
  if (/rate limit/i.test(m)) return "Too many attempts. Please wait a few minutes and try again.";
  if (/phone provider|signups not allowed/i.test(m)) return "Signing in with a mobile number isn't available right now. Please use your email.";
  if (/already (been )?registered|already exists/i.test(m)) return "That number is already used by another account. Sign in with it instead.";
  const ours = error.status !== undefined && (error.status < 500 || error.status === 502 || error.status === 503);
  if (ours && m && !/hook|unmarshal|status code|E\.164|provider/i.test(m)) return m;
  return "Something went wrong. Please try again.";
}

/**
 * Mobile number, then the one-time code Supabase Auth sends through the store's SMS hook.
 * "signin" signs in (creating the account the first time, then asking for a name); "link"
 * adds the number to the signed-in account so it can be used to sign in.
 */
export default function PhoneSignIn({
  channel,
  mode = "signin",
  next = "/account",
  current = "",
  onCancel,
  onLinked,
}: {
  channel: CodeChannel;
  mode?: "signin" | "link";
  next?: string;
  /** "link": the account's verified number, if it has one. */
  current?: string;
  onCancel?: () => void;
  onLinked?: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState<"number" | "code" | "name">("number");
  const [typed, setTyped] = useState("");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const codeForm = useRef<HTMLFormElement>(null);
  const how = channel === "whatsapp" ? "on WhatsApp" : "by text message";

  useEffect(() => {
    if (step !== "code") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  // Android Chrome can read the code from the SMS (WebOTP) when it ends "@yourdomain #123456".
  useEffect(() => {
    if (step !== "code" || channel !== "sms" || typeof window === "undefined" || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    const get = navigator.credentials.get as (options: object) => Promise<{ code?: string } | null>;
    get.call(navigator.credentials, { otp: { transport: ["sms"] }, signal: ac.signal })
      .then((cred) => {
        if (cred?.code) {
          setCode(cred.code);
          setTimeout(() => codeForm.current?.requestSubmit(), 0);
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, [step, channel]);

  /** Moves the guest bag into the account, then goes on. */
  async function finish() {
    setBusy(true);
    await mergeGuestCart();
    router.replace(next);
    router.refresh();
  }

  async function send(n: string) {
    setBusy(true);
    setError(null);
    const auth = supabaseBrowser().auth;
    const { error } = mode === "link" ? await auth.updateUser({ phone: `+${n}` }) : await auth.signInWithOtp({ phone: `+${n}` });
    setBusy(false);
    if (error) return setError(phoneAuthMessage(error));
    setNumber(n);
    setCode("");
    setStep("code");
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setNow(Date.now());
  }

  async function verify() {
    if (busy) return;
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({ phone: `+${number}`, token: code, type: mode === "link" ? "phone_change" : "sms" });
    if (error) {
      setBusy(false);
      return setError(phoneAuthMessage(error));
    }
    if (mode === "link") {
      setBusy(false);
      router.refresh();
      return onLinked?.();
    }
    const res = await phoneSignInComplete();
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    if (res.data.needsName) {
      setBusy(false);
      return setStep("name");
    }
    await finish();
  }

  if (step === "name") {
    return (
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await saveName(name);
          if (!res.ok) {
            setBusy(false);
            return setError(res.error);
          }
          await finish();
        }}
      >
        <div>
          <p className="font-serif text-2xl">Welcome!</p>
          <p className="mt-1 text-sm text-taupe">Your account is ready. What should we call you?</p>
        </div>
        <Field label="Your name" htmlFor="m-name">
          <Input id="m-name" autoComplete="name" required maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" busy={busy} className="w-full">Continue</Button>
        <button
          type="button"
          className="justify-self-center text-sm underline underline-offset-4"
          disabled={busy}
          onClick={finish}
        >
          Skip for now
        </button>
      </form>
    );
  }

  if (step === "code") {
    const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
    return (
      <form
        ref={codeForm}
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          verify();
        }}
      >
        <p className="text-sm leading-relaxed text-taupe" aria-live="polite">
          We sent a 6-digit code {how} to <span className="whitespace-nowrap text-ink">{formatIndianMobile(number)}</span>.{" "}
          <button
            type="button"
            className="text-ink underline underline-offset-4"
            onClick={() => {
              setStep("number");
              setError(null);
            }}
          >
            Change number
          </button>
        </p>
        <Field label="Code" htmlFor="m-code">
          <Input
            id="m-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            className="text-center text-lg tracking-[0.5em] tabular-nums"
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              if (digits.length === 6 && !busy) setTimeout(() => codeForm.current?.requestSubmit(), 0);
            }}
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" busy={busy} className="w-full">{mode === "link" ? "Verify number" : "Verify and continue"}</Button>
        <button type="button" className="justify-self-center text-sm underline underline-offset-4 disabled:no-underline disabled:opacity-60" disabled={wait > 0 || busy} onClick={() => send(number)}>
          {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        const n = indianMobile(typed);
        if (!n) return setError("Enter a 10-digit Indian mobile number.");
        if (mode === "link" && n === current) return setError("That's already the number on your account.");
        send(n);
      }}
    >
      <Field label="Mobile number" htmlFor="m-phone" hint={`We'll send you a 6-digit code ${how}. Indian numbers only.`}>
        <div className="flex">
          <span className="grid place-items-center border border-r-0 border-line bg-bone/50 px-3 text-sm text-taupe" aria-hidden>+91</span>
          <Input
            id="m-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="98450 12345"
            className="min-w-0 flex-1"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" size="lg" busy={busy} className="w-full">Send code</Button>
      {onCancel && (
        <button type="button" className="justify-self-center text-sm underline underline-offset-4" onClick={onCancel}>
          {mode === "link" ? "Cancel" : "Use email and password instead"}
        </button>
      )}
    </form>
  );
}
