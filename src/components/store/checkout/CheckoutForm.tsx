"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { applyCoupon, getCart } from "@/server/cart";
import { placeOrder, reportPaymentFailure, verifyRazorpayPayment, type NextStep } from "@/server/checkout";
import { rememberCheckoutEmail } from "@/server/reminders";
import { deliveryWindow, formatDay } from "@/lib/format";
import { INDIAN_STATES } from "@/lib/india";
import { formatMoney } from "@/lib/money";
import type { Address, CartQuote, Tables } from "@/lib/types";
import CatalogImage from "../../ui/CatalogImage";
import { Button, Checkbox, cx, Field, Input, Notice, Select, Spinner, Textarea } from "../../ui/controls";
import { CheckIcon, LockIcon, ShieldIcon } from "../../ui/icons";
import { openRazorpay, type UiMethod } from "./razorpay-client";

type SavedAddress = Tables<"customer_addresses">;
type Method = UiMethod | "cod" | "stripe";

interface Props {
  initialQuote: CartQuote;
  user: { email: string; name: string; phone: string } | null;
  addresses: SavedAddress[];
  config: { storeName: string; razorpay: boolean; stripe: boolean; reservationMinutes: number; whatsapp: boolean; cartReminders: boolean };
}

const EMPTY: Address = { full_name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", postal_code: "", country: "IN" };
const STEPS = ["Contact", "Address", "Delivery", "Payment", "Review"] as const;

const METHODS: { id: Method; label: string; hint: string }[] = [
  { id: "upi", label: "UPI", hint: "Google Pay, PhonePe, Paytm or any UPI app" },
  { id: "card", label: "Credit or debit card", hint: "Visa, Mastercard, RuPay, Amex" },
  { id: "netbanking", label: "Net banking", hint: "All major Indian banks" },
  { id: "wallet", label: "Wallets", hint: "Paytm, PhonePe, Amazon Pay and more" },
];

/** One idempotency key per distinct checkout, kept across reloads and double clicks. */
function checkoutKey(fingerprint: string) {
  const storageKey = `taana_checkout_${fingerprint}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

function addressLine(a: Address | SavedAddress) {
  return [a.line1, a.line2, a.landmark, a.city, `${a.state} ${a.postal_code}`].filter(Boolean).join(", ");
}

export default function CheckoutForm({ initialQuote, user, addresses, config }: Props) {
  const router = useRouter();
  const [quote, setQuote] = useState<CartQuote>(initialQuote);
  const [step, setStep] = useState(0);
  const [contact, setContact] = useState({ email: user?.email ?? "", phone: user?.phone ?? "", whatsapp: false });
  const defaultSaved = addresses.find((a) => a.is_default) ?? addresses[0];
  const [savedId, setSavedId] = useState<string | "new">(defaultSaved?.id ?? "new");
  const [address, setAddress] = useState<Address>({ ...EMPTY, full_name: user?.name ?? "", phone: user?.phone ?? "" });
  const [saveAddress, setSaveAddress] = useState(true);
  const [rateId, setRateId] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>(config.razorpay ? "upi" : "cod");
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payState, setPayState] = useState<null | { kind: "waiting" | "confirming" | "dismissed" | "failed"; message?: string; retry?: () => void }>(null);

  const chosen: Address = useMemo(() => {
    if (savedId !== "new") {
      const a = addresses.find((x) => x.id === savedId);
      if (a) return { full_name: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, postal_code: a.postal_code, country: a.country };
    }
    return address;
  }, [savedId, addresses, address]);

  const provider = method === "cod" ? "cod" : method === "stripe" ? "stripe" : "razorpay";
  const rates = quote.shipping?.rates ?? [];
  const rate = rates.find((r) => r.id === rateId) ?? rates.find((r) => r.id === quote.shipping?.selected_rate_id) ?? null;

  const requote = async (opts: { address?: Address; rate?: string | null; pay?: Method } = {}) => {
    const q = await getCart({
      address: opts.address ?? chosen,
      rateId: opts.rate ?? rateId,
      paymentMethod: (opts.pay ?? method) === "cod" ? "cod" : null,
      email: contact.email || null,
    });
    setQuote(q);
    return q;
  };

  useEffect(() => {
    if (!quote.line_count) router.replace("/cart");
  }, [quote.line_count, router]);

  const goto = (n: number) => {
    setError(null);
    setStep(n);
    requestAnimationFrame(() => document.getElementById(`step-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  // Step handlers ---------------------------------------------------------------------
  const continueContact = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email.trim())) return setError("Enter a valid email address.");
    if (!/^\+?[0-9][0-9 ()-]{6,19}$/.test(contact.phone.trim())) return setError("Enter a valid mobile number for delivery updates.");
    if (!user) rememberCheckoutEmail(contact.email.trim()).catch(() => {});
    goto(1);
  };

  const continueAddress = async () => {
    const a = chosen;
    const missing =
      !a.full_name.trim() ? "Enter the recipient's full name." :
      !/^\+?[0-9][0-9 ()-]{6,19}$/.test(a.phone.trim()) ? "Enter a valid phone number for the courier." :
      !a.line1.trim() ? "Enter the house number and street." :
      !a.city.trim() ? "Enter the city." :
      !a.state ? "Choose the state." :
      !/^[1-9][0-9]{5}$/.test(a.postal_code) ? "Enter a valid 6-digit PIN code." : null;
    if (missing) return setError(missing);
    setBusy("address");
    try {
      const q = await requote({ address: a });
      if (q.shipping?.serviceable === false) return setError("Sorry, we don't deliver to this PIN code yet. Try another address.");
      setRateId(q.shipping?.selected_rate_id ?? null);
      goto(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const pickRate = async (id: string) => {
    setRateId(id);
    setBusy("rate");
    try {
      await requote({ rate: id });
    } finally {
      setBusy(null);
    }
  };

  const pickMethod = async (m: Method) => {
    setMethod(m);
    if ((m === "cod") !== (method === "cod")) {
      setBusy("method");
      try {
        await requote({ pay: m });
      } finally {
        setBusy(null);
      }
    }
  };

  const continuePayment = () => {
    if (method === "cod" && !quote.payment_methods?.cod) return setError(quote.payment_methods?.cod_reason || "Cash on delivery isn't available for this order.");
    goto(4);
  };

  const submitCoupon = async (code: string) => {
    setBusy("coupon");
    const res = await applyCoupon(code, contact.email || null);
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setError(null);
    await requote();
  };

  // Placing the order -----------------------------------------------------------------
  const fingerprint = JSON.stringify([quote.lines.map((l) => [l.variant_id, l.quantity]), chosen.postal_code, chosen.line1, rate?.id, provider, quote.coupon?.code ?? ""]);

  const startPayment = async (next: NextStep, orderNumber: string) => {
    if (next.type === "redirect") return router.push(next.url);
    if (next.type === "stripe") return window.location.assign(next.url);
    const url = new URL(next.orderUrl, window.location.origin);
    const key = url.searchParams.get("key") ?? "";
    setPayState({ kind: "waiting" });
    const open = () =>
      openRazorpay({
        session: next.session,
        storeName: config.storeName,
        orderNumber,
        prefill: next.prefill,
        method: method === "cod" || method === "stripe" ? undefined : method,
        timeoutSeconds: Math.max(config.reservationMinutes * 60 - 120, 300),
        onSuccess: async (r) => {
          setPayState({ kind: "confirming" });
          const res = await verifyRazorpayPayment({ orderNumber, key, ...r });
          if (!res.ok) setPayState({ kind: "failed", message: res.error, retry: open });
          router.push(res.ok ? res.data.url : next.orderUrl);
        },
        onFailure: (r) => {
          reportPaymentFailure(orderNumber, key, r.error?.metadata?.payment_id ?? null);
          setPayState({ kind: "failed", message: r.error?.description || "The payment didn't go through.", retry: open });
        },
        onDismiss: () => setPayState((s) => (s?.kind === "confirming" ? s : { kind: "dismissed", retry: open })),
      }).catch((e: Error) => setPayState({ kind: "failed", message: e.message, retry: open }));
    open();
  };

  const place = async () => {
    if (!agree) return setError("Please accept the terms to place your order.");
    if (!rate) return setError("Choose a delivery option.");
    setError(null);
    setBusy("place");
    const res = await placeOrder({
      idempotencyKey: checkoutKey(fingerprint),
      email: contact.email,
      phone: contact.phone,
      address: { ...chosen, country: "IN" },
      billing: null,
      rateId: rate.id,
      paymentMethod: provider,
      note,
      saveAddress: !!user && savedId === "new" && saveAddress,
      whatsapp: config.whatsapp && contact.whatsapp,
    });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      requote().catch(() => {});
      return;
    }
    await startPayment(res.data.next, res.data.order.order_number);
  };

  // Render ----------------------------------------------------------------------------
  const currency = quote.currency;
  const total = quote.grand_total;

  return (
    <div className="container-page grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_27rem]">
      <div>
        <ol className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] tracking-[0.14em] uppercase" aria-label="Checkout steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cx("flex items-center gap-2", i === step ? "text-ink" : i < step ? "text-taupe" : "text-stone/60")} aria-current={i === step ? "step" : undefined}>
              <span className={cx("grid size-5 place-items-center rounded-full text-[10px]", i < step ? "bg-ink text-ivory" : i === step ? "border border-ink" : "border border-line")}>
                {i < step ? <CheckIcon size={11} /> : i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>

        {error && <Notice tone="error" className="mt-6">{error}</Notice>}

        {/* 1. Contact */}
        <Section index={0} step={step} title="Contact details" summary={`${contact.email} · ${contact.phone}`} onEdit={() => goto(0)}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Email" htmlFor="co-email" hint={user ? "Order updates go to your account email." : "We'll send your order confirmation here."}>
              <Input id="co-email" type="email" autoComplete="email" value={contact.email} readOnly={!!user} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </Field>
            <Field label="Mobile number" htmlFor="co-phone" hint="For delivery updates from the courier.">
              <Input id="co-phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
            </Field>
          </div>
          {config.whatsapp && (
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={contact.whatsapp} onChange={(e) => setContact({ ...contact, whatsapp: e.target.checked })} className="mt-0.5 size-4 accent-ink" />
              <span>Send my order updates on WhatsApp <span className="block text-xs text-taupe">From {config.storeName}, to this mobile number. You can turn them off any time on your order page.</span></span>
            </label>
          )}
          {!user && config.cartReminders && (
            <p className="mt-4 text-xs text-stone">If you don&apos;t finish checking out, we&apos;ll email you one reminder about your bag. Every reminder has an unsubscribe link.</p>
          )}
          {!user && (
            <p className="mt-4 text-sm text-taupe">
              Have an account? <Link href="/login?next=/checkout" className="text-ink underline underline-offset-4">Sign in</Link> for saved addresses, or continue as a guest.
            </p>
          )}
          <Button size="lg" className="mt-6" onClick={continueContact}>Continue to address</Button>
        </Section>

        {/* 2. Address */}
        <Section index={1} step={step} title="Delivery address" summary={`${chosen.full_name}, ${addressLine(chosen)}`} onEdit={() => goto(1)}>
          {addresses.length > 0 && (
            <fieldset className="mb-6 grid gap-3">
              <legend className="sr-only">Saved addresses</legend>
              {addresses.map((a) => (
                <label key={a.id} className={cx("flex cursor-pointer gap-3 border p-4 text-sm", savedId === a.id ? "border-ink bg-paper" : "border-line")}>
                  <input type="radio" name="saved" className="mt-1 accent-ink" checked={savedId === a.id} onChange={() => setSavedId(a.id)} />
                  <span>
                    <span className="font-medium">{a.full_name}</span>{a.label ? <span className="ml-2 text-xs text-stone">{a.label}</span> : null}
                    <span className="mt-1 block text-taupe">{addressLine(a)}</span>
                    <span className="block text-taupe">{a.phone}</span>
                  </span>
                </label>
              ))}
              <label className={cx("flex cursor-pointer items-center gap-3 border p-4 text-sm", savedId === "new" ? "border-ink bg-paper" : "border-line")}>
                <input type="radio" name="saved" className="accent-ink" checked={savedId === "new"} onChange={() => setSavedId("new")} />
                Use a new address
              </label>
            </fieldset>
          )}
          {savedId === "new" && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" htmlFor="a-name" className="sm:col-span-2">
                <Input id="a-name" autoComplete="shipping name" value={address.full_name} onChange={(e) => setAddress({ ...address, full_name: e.target.value })} />
              </Field>
              <Field label="House number, building and street" htmlFor="a-line1" className="sm:col-span-2">
                <Input id="a-line1" autoComplete="shipping address-line1" value={address.line1} onChange={(e) => setAddress({ ...address, line1: e.target.value })} />
              </Field>
              <Field label="Area, colony (optional)" htmlFor="a-line2">
                <Input id="a-line2" autoComplete="shipping address-line2" value={address.line2} onChange={(e) => setAddress({ ...address, line2: e.target.value })} />
              </Field>
              <Field label="Landmark (optional)" htmlFor="a-landmark">
                <Input id="a-landmark" value={address.landmark} onChange={(e) => setAddress({ ...address, landmark: e.target.value })} />
              </Field>
              <Field label="PIN code" htmlFor="a-pin">
                <Input id="a-pin" inputMode="numeric" maxLength={6} autoComplete="shipping postal-code" value={address.postal_code} onChange={(e) => setAddress({ ...address, postal_code: e.target.value.replace(/\D/g, "") })} />
              </Field>
              <Field label="City" htmlFor="a-city">
                <Input id="a-city" autoComplete="shipping address-level2" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
              </Field>
              <Field label="State" htmlFor="a-state">
                <Select id="a-state" autoComplete="shipping address-level1" value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })}>
                  <option value="">Choose a state</option>
                  {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Phone for delivery" htmlFor="a-phone">
                <Input id="a-phone" type="tel" autoComplete="shipping tel" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} />
              </Field>
              {user && <Checkbox className="sm:col-span-2" label="Save this address to my account" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />}
            </div>
          )}
          <Button size="lg" className="mt-6" busy={busy === "address"} onClick={continueAddress}>Continue to delivery</Button>
        </Section>

        {/* 3. Delivery */}
        <Section
          index={2}
          step={step}
          title="Delivery method"
          summary={rate ? `${rate.name} · ${rate.price ? formatMoney(rate.price, currency) : "Free"}` : ""}
          onEdit={() => goto(2)}
        >
          <fieldset className="grid gap-3">
            <legend className="sr-only">Delivery options</legend>
            {rates.map((r) => {
              const w = deliveryWindow(r.min_days, r.max_days);
              return (
                <label key={r.id} className={cx("flex cursor-pointer items-center gap-3 border p-4 text-sm", rate?.id === r.id ? "border-ink bg-paper" : "border-line")}>
                  <input type="radio" name="rate" className="accent-ink" checked={rate?.id === r.id} onChange={() => pickRate(r.id)} disabled={busy === "rate"} />
                  <span className="flex-1">
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-taupe">Arrives {formatDay(w.from)} – {formatDay(w.to)}{r.description ? ` · ${r.description}` : ""}</span>
                  </span>
                  <span className="tabular-nums">{r.price ? formatMoney(r.price, currency) : <span className="text-ok">Free</span>}</span>
                </label>
              );
            })}
          </fieldset>
          <Button size="lg" className="mt-6" onClick={() => goto(3)} disabled={!rate || busy === "rate"}>Continue to payment</Button>
        </Section>

        {/* 4. Payment */}
        <Section index={3} step={step} title="Payment" summary={method === "cod" ? "Cash on delivery" : method === "stripe" ? "International card (Stripe)" : `${METHODS.find((m) => m.id === method)?.label} via Razorpay`} onEdit={() => goto(3)}>
          <fieldset className="grid gap-3">
            <legend className="sr-only">Payment method</legend>
            {config.razorpay &&
              METHODS.map((m) => (
                <PayOption key={m.id} checked={method === m.id} onChange={() => pickMethod(m.id)} label={m.label} hint={m.hint} />
              ))}
            {config.stripe && <PayOption checked={method === "stripe"} onChange={() => pickMethod("stripe")} label="International card" hint="Cards issued outside India, via Stripe" />}
            <PayOption
              checked={method === "cod"}
              onChange={() => pickMethod("cod")}
              disabled={!quote.payment_methods?.cod}
              label={`Cash on delivery${quote.payment_methods?.cod_fee ? ` (+${formatMoney(quote.payment_methods.cod_fee, currency)})` : ""}`}
              hint={quote.payment_methods?.cod ? "Pay the courier in cash or UPI when your order arrives" : quote.payment_methods?.cod_reason || "Not available"}
            />
            {!config.razorpay && !config.stripe && (
              <Notice tone="warning">Online payment is not set up yet, so only cash on delivery is available.</Notice>
            )}
          </fieldset>
          <p className="mt-4 flex items-center gap-2 text-xs text-stone">
            <ShieldIcon size={16} /> Online payments are processed by Razorpay. We never see or store your card details.
          </p>
          <Button size="lg" className="mt-6" onClick={continuePayment} busy={busy === "method"}>Review order</Button>
        </Section>

        {/* 5. Review */}
        <Section index={4} step={step} title="Review and place order" onEdit={() => goto(4)}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-stone">Deliver to</dt><dd className="mt-1">{chosen.full_name}<br />{addressLine(chosen)}<br />{chosen.phone}</dd></div>
            <div><dt className="text-stone">Delivery</dt><dd className="mt-1">{rate?.name} {rate && `· ${formatDay(deliveryWindow(rate.min_days, rate.max_days).from)} – ${formatDay(deliveryWindow(rate.min_days, rate.max_days).to)}`}</dd></div>
          </dl>
          <Field label="Note for us (optional)" htmlFor="co-note" className="mt-6">
            <Textarea id="co-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gift message, delivery instructions..." />
          </Field>
          <Checkbox
            className="mt-5 items-start"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            label={<span className="text-sm text-taupe">I agree to the <Link href="/pages/terms" target="_blank" className="underline">terms of service</Link> and <Link href="/pages/returns" target="_blank" className="underline">returns policy</Link>.</span>}
          />
          <Button size="lg" className="mt-6 w-full sm:w-auto" busy={busy === "place"} disabled={!quote.can_checkout && quote.issues.length > 0} onClick={place}>
            <LockIcon size={16} />
            {method === "cod" ? `Place order · ${formatMoney(total, currency)}` : `Pay ${formatMoney(total, currency)}`}
          </Button>
          {payState && <PaymentStatus state={payState} />}
        </Section>
      </div>

      <OrderSummary quote={quote} coupon={coupon} setCoupon={setCoupon} onApply={submitCoupon} applying={busy === "coupon"} />
    </div>
  );
}

function Section({ index, step, title, summary, onEdit, children }: { index: number; step: number; title: string; summary?: string; onEdit: () => void; children: React.ReactNode }) {
  const done = index < step;
  const open = index === step;
  return (
    <section id={`step-${index}`} className="scroll-mt-32 border-b border-line py-7" aria-labelledby={`step-${index}-title`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={`step-${index}-title`} className={cx("font-serif text-2xl", !open && !done && "text-stone/70")}>
          {index + 1}. {title}
        </h2>
        {done && (
          <button type="button" onClick={onEdit} className="text-xs underline underline-offset-4">Change</button>
        )}
      </div>
      {done && summary && <p className="mt-2 text-sm text-taupe">{summary}</p>}
      {open && <div className="mt-6 animate-fade-in">{children}</div>}
    </section>
  );
}

function PayOption({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: () => void; label: string; hint: string; disabled?: boolean }) {
  return (
    <label className={cx("flex items-center gap-3 border p-4 text-sm", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer", checked ? "border-ink bg-paper" : "border-line")}>
      <input type="radio" name="method" className="accent-ink" checked={checked} disabled={disabled} onChange={onChange} />
      <span>
        <span className="font-medium">{label}</span>
        <span className="block text-taupe">{hint}</span>
      </span>
    </label>
  );
}

function PaymentStatus({ state }: { state: { kind: string; message?: string; retry?: () => void } }) {
  if (state.kind === "waiting") return <p className="mt-4 flex items-center gap-2 text-sm text-taupe"><Spinner className="size-4" /> Complete the payment in the Razorpay window…</p>;
  if (state.kind === "confirming") return <p className="mt-4 flex items-center gap-2 text-sm text-taupe" role="status"><Spinner className="size-4" /> Confirming your payment with Razorpay…</p>;
  return (
    <Notice tone={state.kind === "failed" ? "error" : "warning"} className="mt-4">
      {state.kind === "failed" ? `Payment failed: ${state.message}` : "The payment window was closed before paying."} Your items are reserved for a little while.{" "}
      {state.retry && <button type="button" onClick={state.retry} className="font-medium underline">Try again</button>}
    </Notice>
  );
}

function OrderSummary({ quote, coupon, setCoupon, onApply, applying }: { quote: CartQuote; coupon: string; setCoupon: (s: string) => void; onApply: (code: string) => void; applying: boolean }) {
  const c = quote.currency;
  return (
    <aside className="h-fit bg-paper p-6 lg:sticky lg:top-36" aria-label="Order summary">
      <h2 className="font-serif text-2xl">Order summary</h2>
      <ul className="mt-5 grid gap-4">
        {quote.lines.map((l) => (
          <li key={l.variant_id} className="flex gap-3 text-sm">
            <span className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden bg-bone">
              <CatalogImage src={l.image_url} alt="" fill sizes="56px" className="object-cover" />
              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-ink text-[10px] text-ivory">{l.quantity}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.title}</span>
              <span className="block text-xs text-taupe">{[l.color, l.size].filter(Boolean).join(" / ")}</span>
              {l.issue && <span className="block text-xs text-sale">{l.issue === "insufficient_stock" ? `Only ${l.available} left` : "Unavailable"}</span>}
            </span>
            <span className="tabular-nums">{formatMoney(l.line_subtotal || l.unit_price * l.quantity, c)}</span>
          </li>
        ))}
      </ul>
      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onApply(coupon);
        }}
      >
        <label htmlFor="co-coupon" className="sr-only">Discount code</label>
        <Input id="co-coupon" placeholder="Discount code" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className="h-10" />
        <Button type="submit" variant="secondary" className="h-10!" busy={applying} disabled={!coupon}>Apply</Button>
      </form>
      {quote.coupon && (
        <p className={cx("mt-2 text-xs", quote.coupon.valid ? "text-ok" : "text-sale")}>
          {quote.coupon.code}: {quote.coupon.message}
          {quote.coupon.valid && (
            <button type="button" className="ml-2 underline" onClick={() => onApply("")}>Remove</button>
          )}
        </p>
      )}
      <dl className="mt-6 grid gap-2 border-t border-line pt-5 text-sm">
        <Row label="Subtotal" value={formatMoney(quote.subtotal, c)} />
        {quote.discount_total > 0 && <Row label="Discount" value={`−${formatMoney(quote.discount_total, c)}`} tone="text-ok" />}
        <Row label="Delivery" value={quote.shipping_total === null ? "Calculated after address" : quote.shipping_total === 0 ? "Free" : formatMoney(quote.shipping_total, c)} />
        {quote.cod_fee > 0 && <Row label="Cash on delivery fee" value={formatMoney(quote.cod_fee, c)} />}
        {quote.tax_mode === "exclusive" && <Row label={quote.tax_label ?? "Tax"} value={formatMoney(quote.tax_total, c)} />}
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-4">
          <dt className="font-medium">Total</dt>
          <dd className="font-serif text-2xl tabular-nums">{formatMoney(quote.grand_total, c)}</dd>
        </div>
      </dl>
      {quote.tax_mode === "inclusive" && quote.tax_total > 0 && (
        <p className="mt-2 text-right text-xs text-stone">Includes {formatMoney(quote.tax_total, c)} {quote.tax_label}</p>
      )}
    </aside>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-taupe">{label}</dt>
      <dd className={cx("tabular-nums", tone)}>{value}</dd>
    </div>
  );
}
