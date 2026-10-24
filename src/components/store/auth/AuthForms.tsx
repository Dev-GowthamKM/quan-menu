"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mergeGuestCart } from "@/server/cart";
import { GOOGLE_SIGN_IN } from "@/lib/env";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button, Checkbox, Field, Input, Notice } from "../../ui/controls";
import PhoneSignIn, { type CodeChannel, type SignUpStore } from "./PhoneSignIn";

/** Where links in sign-up, reset and email-change emails go: this store's own address. */
const confirmUrl = () => `${window.location.origin}/auth/confirm`;

function authMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again or reset your password.";
  if (/email not confirmed/i.test(message)) return "CONFIRM";
  if (/rate|too many|security purposes/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  if (/already registered|already exists/i.test(message)) return "An account with this email already exists. Sign in instead.";
  if (/password/i.test(message) && /(weak|short|characters|least)/i.test(message)) return "Choose a stronger password: at least 8 characters.";
  return "Something went wrong. Please try again.";
}

/** "Continue with Google" and "Continue with mobile number", when the store offers them. */
function OtherWays({ next, phone, onPhone }: { next: string; phone?: CodeChannel | null; onPhone: () => void }) {
  if (!GOOGLE_SIGN_IN && !phone) return null;
  return (
    <>
      <div className="grid gap-3">
        {GOOGLE_SIGN_IN && (
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() =>
              supabaseBrowser().auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
              })
            }
          >
            Continue with Google
          </Button>
        )}
        {phone && (
          <Button variant="secondary" size="lg" className="w-full" onClick={onPhone}>
            Continue with mobile number
          </Button>
        )}
      </div>
      <div className="my-6 flex items-center gap-4 text-xs text-stone">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function LoginForm({
  next = "/account",
  notice,
  admin,
  phone,
  method = "email",
  store,
}: {
  next?: string;
  notice?: string | null;
  admin?: boolean;
  /** How sign-in codes are sent, when the store offers signing in with a mobile number. */
  phone?: CodeChannel | null;
  method?: "email" | "phone";
  /** The store an account made here joins. */
  store?: SignUpStore;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [usePhone, setUsePhone] = useState(!admin && !!phone && method === "phone");

  if (usePhone && phone) {
    return (
      <div>
        {notice && <Notice className="mb-6">{notice}</Notice>}
        <PhoneSignIn channel={phone} next={next} store={store} onCancel={() => setUsePhone(false)} />
        <p className="mt-8 text-center text-sm text-taupe">New here? Your account is created when you enter the code.</p>
      </div>
    );
  }

  return (
    <div>
      {notice && <Notice className="mb-6">{notice}</Notice>}
      {!admin && <OtherWays next={next} phone={phone} onPhone={() => setUsePhone(true)} />}
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
          if (error) {
            const msg = authMessage(error.message);
            setUnconfirmed(msg === "CONFIRM");
            setError(msg === "CONFIRM" ? "Please confirm your email first. We sent you a link when you signed up." : msg);
            setBusy(false);
            return;
          }
          if (!admin) await mergeGuestCart();
          router.replace(next);
          router.refresh();
        }}
      >
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 text-right">
          <Link href="/forgot-password" className="text-xs underline underline-offset-4">Forgot password?</Link>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {unconfirmed && (
          <button
            type="button"
            className="justify-self-start text-sm underline underline-offset-4"
            disabled={resent}
            onClick={async () => {
              await supabaseBrowser().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: confirmUrl() } });
              setResent(true);
            }}
          >
            {resent ? "Confirmation email sent" : "Send the confirmation email again"}
          </button>
        )}
        <Button type="submit" size="lg" busy={busy} className="w-full">Sign in</Button>
      </form>
      {!admin && (
        <p className="mt-8 text-center text-sm text-taupe">
          New here? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">Create an account</Link>
        </p>
      )}
    </div>
  );
}

export function SignupForm({ next = "/account", phone, store }: { next?: string; phone?: CodeChannel | null; store?: SignUpStore }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", marketing: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [usePhone, setUsePhone] = useState(false);

  if (usePhone && phone) {
    return (
      <div>
        <PhoneSignIn channel={phone} next={next} store={store} onCancel={() => setUsePhone(false)} />
        <p className="mt-8 text-xs leading-relaxed text-stone">
          By creating an account you agree to our <Link href="/pages/terms" className="underline">terms</Link> and <Link href="/pages/privacy" className="underline">privacy policy</Link>.
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="font-serif text-3xl">Check your inbox</p>
        <p className="mt-4 leading-relaxed text-taupe">
          We sent a confirmation link to <span className="text-ink">{form.email}</span>. Open it to activate your account.
        </p>
        <p className="mt-6 text-sm text-stone">Didn&apos;t get it? Check your spam folder, or <button type="button" className="underline" onClick={() => setSent(false)}>try again</button>.</p>
      </div>
    );
  }

  return (
    <div>
      <OtherWays next={next} phone={phone} onPhone={() => setUsePhone(true)} />
      <form
        className="grid gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (form.password.length < 8) return setError("Choose a password of at least 8 characters.");
          setBusy(true);
          setError(null);
          const { data, error } = await supabaseBrowser().auth.signUp({
            email: form.email.trim(),
            password: form.password,
            options: {
              data: { full_name: form.name.trim(), marketing_opt_in: form.marketing, store_id: store?.id ?? undefined },
              emailRedirectTo: confirmUrl(),
            },
          });
          setBusy(false);
          if (error) return setError(authMessage(error.message));
          if (data.session) {
            await mergeGuestCart();
            window.location.assign(next);
          } else setSent(true);
        }}
      >
        <Field label="Full name" htmlFor="name">
          <Input id="name" autoComplete="name" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <Checkbox label="Send me news about new collections and offers" checked={form.marketing} onChange={(e) => setForm({ ...form, marketing: e.target.checked })} />
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" size="lg" busy={busy} className="w-full">Create account</Button>
        <p className="text-xs leading-relaxed text-stone">
          By creating an account you agree to our <Link href="/pages/terms" className="underline">terms</Link> and <Link href="/pages/privacy" className="underline">privacy policy</Link>.
        </p>
      </form>
      <p className="mt-8 text-center text-sm text-taupe">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-ink underline underline-offset-4">Sign in</Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <Notice tone="success">
        If an account exists for {email}, we have sent a link to reset the password. It works once and expires in an hour.
      </Notice>
    );
  }
  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: confirmUrl(),
        });
        setBusy(false);
        // Never reveal whether the email has an account.
        if (error && /rate|too many|security purposes/i.test(error.message)) return setError(authMessage(error.message));
        setDone(true);
      }}
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" size="lg" busy={busy} className="w-full">Send reset link</Button>
      <Link href="/login" className="justify-self-center text-sm underline underline-offset-4">Back to sign in</Link>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 8) return setError("Choose a password of at least 8 characters.");
        if (password !== confirm) return setError("The two passwords don't match.");
        setBusy(true);
        const { error } = await supabaseBrowser().auth.updateUser({ password });
        setBusy(false);
        if (error) {
          return setError(/same|different/i.test(error.message) ? "Choose a password you haven't used before." : authMessage(error.message));
        }
        router.replace("/account?password=updated");
        router.refresh();
      }}
    >
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" size="lg" busy={busy} className="w-full">Save new password</Button>
    </form>
  );
}
