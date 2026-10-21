"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatIndianMobile } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import PhoneSignIn, { type CodeChannel } from "../auth/PhoneSignIn";
import { Badge, Button, Field, Input, Notice } from "../../ui/controls";

/**
 * The account's email and mobile number, each verified, and its password. An account made
 * with a mobile number can add an email (confirmed by a link); an email account can add a
 * mobile number (confirmed by a code) to sign in with codes too.
 */
export default function SignInMethods({
  email,
  pendingEmail,
  phone,
  phoneSignIn,
}: {
  email: string;
  /** An email waiting for its confirmation link to be opened. */
  pendingEmail: string;
  /** The verified mobile number, as Supabase stores it ("919845012345"), or "". */
  phone: string;
  /** How codes are sent, when the store offers mobile sign-in (never for staff accounts). */
  phoneSignIn: CodeChannel | null;
}) {
  return (
    <div className="mt-4 grid gap-10 md:grid-cols-2">
      <div className="grid content-start gap-6">
        <EmailRow email={email} pendingEmail={pendingEmail} />
        <PhoneRow phone={phone} phoneSignIn={phoneSignIn} />
      </div>
      {email ? (
        <PasswordForm email={email} />
      ) : (
        <p className="text-sm leading-relaxed text-taupe">
          You sign in with a code sent to your mobile number. Add an email address to get order emails there and to be able to sign in with a password.
        </p>
      )}
    </div>
  );
}

function EmailRow({ email, pendingEmail }: { email: string; pendingEmail: string }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  if (email) {
    return (
      <div>
        <p className="text-xs font-medium text-taupe">Email</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="break-all">{email}</span> <Badge tone="green">Verified</Badge>
        </p>
        <p className="mt-1 text-xs text-stone">Contact us to change the email on your account.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium text-taupe">Email</p>
      {!adding ? (
        <>
          <p className="mt-1.5 text-sm text-taupe">
            {pendingEmail ? <>Waiting for you to confirm <span className="text-ink">{pendingEmail}</span>: open the link we emailed you.</> : "No email address yet."}
          </p>
          {msg && <Notice tone={msg.tone} className="mt-3">{msg.text}</Notice>}
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              setAdding(true);
              setMsg(null);
            }}
          >
            {pendingEmail ? "Use a different email" : "Add email"}
          </Button>
        </>
      ) : (
        <form
          className="mt-2 grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const { error } = await supabaseBrowser().auth.updateUser(
              { email: value.trim() },
              { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` },
            );
            setBusy(false);
            if (error) {
              const text = /already|registered|exists/i.test(error.message)
                ? "That email is already used by another account."
                : /rate|security purposes/i.test(error.message)
                  ? "Please wait a minute before trying again."
                  : /invalid|format/i.test(error.message)
                    ? "Enter a valid email address."
                    : "We couldn't add that email. Please try again.";
              return setMsg({ tone: "error", text });
            }
            setAdding(false);
            setMsg({ tone: "success", text: `We sent a link to ${value.trim()}. Open it to add the email to your account.` });
          }}
        >
          <Field label="Email address" htmlFor="si-email">
            <Input id="si-email" type="email" autoComplete="email" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <div className="flex gap-3">
            <Button type="submit" size="sm" busy={busy}>Send confirmation link</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function PhoneRow({ phone, phoneSignIn }: { phone: string; phoneSignIn: CodeChannel | null }) {
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState(false);
  if (!phone && !phoneSignIn) return null;
  return (
    <div>
      <p className="text-xs font-medium text-taupe">Mobile number for signing in</p>
      {phone && !adding && (
        <>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap">{formatIndianMobile(phone)}</span> <Badge tone="green">Verified</Badge>
          </p>
          <p className="mt-1 text-xs text-stone">
            {phoneSignIn ? "You can sign in with a code sent to this number." : "Signing in with a code is turned off at the moment."}
          </p>
        </>
      )}
      {!phone && !adding && <p className="mt-1.5 text-sm text-taupe">Add your mobile number to sign in with a one-time code instead of your password.</p>}
      {done && !adding && <Notice tone="success" className="mt-3">Your mobile number is verified.</Notice>}
      {phoneSignIn && !adding && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            setAdding(true);
            setDone(false);
          }}
        >
          {phone ? "Change number" : "Add mobile number"}
        </Button>
      )}
      {phoneSignIn && adding && (
        <div className="mt-3">
          <PhoneSignIn
            channel={phoneSignIn}
            mode="link"
            current={phone}
            onCancel={() => setAdding(false)}
            onLinked={() => {
              setAdding(false);
              setDone(true);
            }}
          />
        </div>
      )}
    </div>
  );
}

function PasswordForm({ email }: { email: string }) {
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="grid content-start gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.next.length < 8) return setMsg({ tone: "error", text: "Use at least 8 characters." });
        if (pw.next !== pw.confirm) return setMsg({ tone: "error", text: "The passwords don't match." });
        setBusy(true);
        const { error } = await supabaseBrowser().auth.updateUser({ password: pw.next });
        setBusy(false);
        setMsg(error ? { tone: "error", text: /same|different/i.test(error.message) ? "Choose a password you haven't used before." : "We couldn't change your password. Sign in again and retry." } : { tone: "success", text: "Password changed." });
        if (!error) {
          setPw({ next: "", confirm: "" });
          router.refresh();
        }
      }}
    >
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <Field label="New password" htmlFor="p-pw">
        <Input id="p-pw" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
      </Field>
      <Field label="Confirm new password" htmlFor="p-pw2">
        <Input id="p-pw2" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
      </Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button type="submit" variant="secondary" busy={busy} className="justify-self-start">Change password</Button>
    </form>
  );
}
