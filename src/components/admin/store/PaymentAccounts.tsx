"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeRazorpayKeys, saveRazorpayKeys } from "@/server/admin/payments";
import { formatDateTime } from "@/lib/format";
import { Badge, Button, cx } from "../../ui/controls";
import { TextField } from "../fields";
import { useToast } from "../Toaster";
import { adminInput, Card } from "../ui";

export interface SavedKey {
  name: string;
  hint: string;
  updated_at: string;
}

const LABELS: Record<string, string> = {
  razorpay_key_id: "Key id",
  razorpay_key_secret: "Key secret",
  razorpay_webhook_secret: "Webhook secret",
};

/**
 * Settings › Payment accounts: the store's own Razorpay keys. The saved keys never come
 * back to the browser; only their last four characters are shown.
 */
export default function PaymentAccounts({
  saved,
  webhookUrl,
  canEdit,
  ready,
  usingServerKeys,
}: {
  saved: SavedKey[];
  webhookUrl: string;
  /** Owners only. */
  canEdit: boolean;
  /** The server can encrypt keys (STORE_SECRETS_KEY is set). */
  ready: boolean;
  /** The home store without its own keys takes payments with the server's environment keys. */
  usingServerKeys: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState({ keyId: "", keySecret: "", webhookSecret: "" });
  const [error, setError] = useState<string | null>(null);
  const byName = new Map(saved.map((s) => [s.name, s]));
  const connected = byName.has("razorpay_key_id") && byName.has("razorpay_key_secret");
  const disabled = !canEdit || !ready;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return toast(res.error ?? "Something went wrong.", "error");
      }
      setError(null);
      setV({ keyId: "", keySecret: "", webhookSecret: "" });
      toast(res.message ?? "Saved.");
      router.refresh();
    });

  return (
    <div className="grid gap-5">
      <Card
        title="Razorpay"
        actions={<Badge tone={connected || usingServerKeys ? "green" : "neutral"}>{connected ? "Store's own keys" : usingServerKeys ? "Server keys" : "Not connected"}</Badge>}
      >
        <div className="grid gap-4">
          <p className="text-sm text-taupe">
            Customers&apos; online payments (UPI, cards, netbanking, wallets) go to the Razorpay account these keys belong to. Create them in the
            Razorpay Dashboard under <em>Account &amp; Settings › API Keys</em>. Use test keys (rzp_test_) until the store is ready to take real
            money. Keys are encrypted before they&apos;re saved, and only their last four characters are ever shown again.
          </p>
          {usingServerKeys && !connected && (
            <p className="rounded-md bg-black/[0.03] px-3 py-2 text-sm text-taupe">
              This store takes payments with the keys set on the server (RAZORPAY_KEY_ID). Saving keys here replaces them for this store.
            </p>
          )}
          {saved.length > 0 && (
            <dl className="grid gap-1.5 text-sm">
              {Object.keys(LABELS).map((name) => {
                const s = byName.get(name);
                return (
                  <div key={name} className="flex flex-wrap items-baseline gap-x-3">
                    <dt className="w-32 text-taupe">{LABELS[name]}</dt>
                    <dd className="font-mono">{s ? `••••${s.hint}` : <span className="font-sans text-stone">Not saved</span>}</dd>
                    {s && <dd className="text-xs text-stone">saved {formatDateTime(s.updated_at)}</dd>}
                  </div>
                );
              })}
            </dl>
          )}
          {!ready && <p className="text-sm text-red-700">Set STORE_SECRETS_KEY on the server before saving keys (see README › Payment accounts).</p>}
          {!canEdit && <p className="text-sm text-stone">Only the store&apos;s owners can change its payment account.</p>}
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveRazorpayKeys(v));
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Key id"
                value={v.keyId}
                onChange={(e) => setV({ ...v, keyId: e.target.value.trim() })}
                placeholder={byName.has("razorpay_key_id") ? "Leave empty to keep the saved key" : "rzp_test_…"}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                inputClassName="font-mono"
              />
              <TextField
                label="Key secret"
                type="password"
                value={v.keySecret}
                onChange={(e) => setV({ ...v, keySecret: e.target.value.trim() })}
                placeholder={byName.has("razorpay_key_secret") ? "Leave empty to keep the saved secret" : ""}
                autoComplete="new-password"
                disabled={disabled}
              />
            </div>
            <TextField
              label="Webhook secret"
              type="password"
              value={v.webhookSecret}
              onChange={(e) => setV({ ...v, webhookSecret: e.target.value.trim() })}
              placeholder={byName.has("razorpay_webhook_secret") ? "Leave empty to keep the saved secret" : "Any long random text"}
              hint="Razorpay signs every webhook with it, so nobody else can mark an order paid."
              autoComplete="new-password"
              disabled={disabled}
            />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" busy={pending} disabled={disabled}>Save keys</Button>
              {connected && canEdit && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Remove this store's Razorpay keys? Online payments stop until new keys are saved.")) run(() => removeRazorpayKeys());
                  }}
                >
                  Remove keys
                </Button>
              )}
            </div>
          </form>
        </div>
      </Card>

      <Card title="Razorpay webhook">
        <div className="grid gap-3 text-sm">
          <p className="text-taupe">
            Webhooks confirm payments even when a customer closes the page before returning to the store. In the Razorpay Dashboard, open{" "}
            <em>Account &amp; Settings › Webhooks</em>, add this URL with the webhook secret above, and choose the events{" "}
            <code className="text-xs">payment.authorized</code>, <code className="text-xs">payment.captured</code>, <code className="text-xs">payment.failed</code>,{" "}
            <code className="text-xs">order.paid</code>, <code className="text-xs">refund.processed</code> and <code className="text-xs">refund.failed</code>.
          </p>
          <input readOnly value={webhookUrl} aria-label="Webhook URL" className={cx(adminInput, "w-full font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
        </div>
      </Card>
    </div>
  );
}
