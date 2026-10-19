"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteAddress, saveAddress, type AddressInput } from "@/server/account";
import { INDIAN_STATES } from "@/lib/india";
import type { Tables } from "@/lib/types";
import { Badge, Button, Checkbox, Field, Input, Notice, Select } from "../../ui/controls";
import { Dialog } from "../../ui/Dialog";

type Row = Tables<"customer_addresses">;
const BLANK: AddressInput = { label: "", full_name: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", postal_code: "", country: "IN", is_default: false };

export default function AddressBook({ addresses }: { addresses: Row[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AddressInput | null>(null);
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});

  const set = (k: keyof AddressInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEditing({ ...editing!, [k]: e.target.value });

  return (
    <div className="mt-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {addresses.map((a) => (
          <div key={a.id} className="border border-line bg-paper p-5 text-sm">
            <div className="flex items-center gap-2">
              <p className="font-medium">{a.full_name}</p>
              {a.label && <span className="text-xs text-stone">{a.label}</span>}
              {a.is_default && <Badge tone="dark">Default</Badge>}
            </div>
            <p className="mt-2 leading-relaxed text-taupe">
              {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
              {a.landmark && <>{a.landmark}<br /></>}
              {a.city}, {a.state} {a.postal_code}<br />
              {a.phone}
            </p>
            <div className="mt-4 flex gap-4 text-xs">
              <button type="button" className="underline underline-offset-4" onClick={() => setEditing({ ...a, id: a.id, country: "IN" })}>Edit</button>
              {!a.is_default && (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={async () => {
                    await saveAddress({ ...a, id: a.id, country: "IN", is_default: true });
                    router.refresh();
                  }}
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                className="text-sale underline underline-offset-4"
                onClick={async () => {
                  if (!confirm("Remove this address?")) return;
                  await deleteAddress(a.id);
                  router.refresh();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setEditing({ ...BLANK, is_default: addresses.length === 0 })} className="grid min-h-40 place-items-center border border-dashed border-line text-sm hover:border-ink">
          + Add a new address
        </button>
      </div>

      <Dialog open={!!editing} onClose={() => { setEditing(null); setState({}); }} title={editing?.id ? "Edit address" : "New address"} size="md">
        {editing && (
          <form
            className="grid gap-5 p-5 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setState({ busy: true });
              const res = await saveAddress(editing);
              if (!res.ok) return setState({ error: res.error });
              setEditing(null);
              setState({});
              router.refresh();
            }}
          >
            <Field label="Full name" htmlFor="ad-name"><Input id="ad-name" required autoComplete="name" value={editing.full_name} onChange={set("full_name")} /></Field>
            <Field label="Label (optional)" htmlFor="ad-label"><Input id="ad-label" placeholder="Home, Office" value={editing.label ?? ""} onChange={set("label")} /></Field>
            <Field label="House number, building and street" htmlFor="ad-line1" className="sm:col-span-2"><Input id="ad-line1" required autoComplete="address-line1" value={editing.line1} onChange={set("line1")} /></Field>
            <Field label="Area, colony (optional)" htmlFor="ad-line2"><Input id="ad-line2" autoComplete="address-line2" value={editing.line2 ?? ""} onChange={set("line2")} /></Field>
            <Field label="Landmark (optional)" htmlFor="ad-landmark"><Input id="ad-landmark" value={editing.landmark ?? ""} onChange={set("landmark")} /></Field>
            <Field label="PIN code" htmlFor="ad-pin"><Input id="ad-pin" required inputMode="numeric" maxLength={6} autoComplete="postal-code" value={editing.postal_code} onChange={set("postal_code")} /></Field>
            <Field label="City" htmlFor="ad-city"><Input id="ad-city" required autoComplete="address-level2" value={editing.city} onChange={set("city")} /></Field>
            <Field label="State" htmlFor="ad-state">
              <Select id="ad-state" required value={editing.state} onChange={set("state")}>
                <option value="">Choose a state</option>
                {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Phone" htmlFor="ad-phone"><Input id="ad-phone" required type="tel" autoComplete="tel" value={editing.phone} onChange={set("phone")} /></Field>
            <Checkbox className="sm:col-span-2" label="Use as my default address" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} />
            {state.error && <Notice tone="error" className="sm:col-span-2">{state.error}</Notice>}
            <div className="flex justify-end gap-3 sm:col-span-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" busy={state.busy}>Save address</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
