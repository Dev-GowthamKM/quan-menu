"use client";
import { useRouter } from "next/navigation";
import type { StallRef } from "@/lib/types";
import { useUi } from "./Ui";

interface Props {
  stalls: StallRef[];
  /** The stall open in the editor; null while a new one is unsaved. */
  current: string | null;
  dirty: boolean;
}

/** Switches between the stalls on this account, for a helper who sets up menus for several vendors. */
export default function StallBar({ stalls, current, dirty }: Props) {
  const { t } = useUi();
  const router = useRouter();
  const go = (href: string) => {
    if (dirty && !window.confirm(t.leaveUnsaved)) return;
    router.push(href);
  };
  return (
    <div className="stallbar">
      <label className="f" htmlFor="stall-pick">{t.stallLabel}</label>
      <select id="stall-pick" value={current ?? ""}
        onChange={(e) => {
          const s = stalls.find((x) => x.id === e.target.value);
          go(s ? `/dashboard?s=${encodeURIComponent(s.slug)}` : "/dashboard?new=1");
        }}>
        {!current && <option value="">{t.newStall}</option>}
        {stalls.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.published ? "" : ` · ${t.pillDraft}`}</option>
        ))}
      </select>
      {current && <button className="btn" type="button" onClick={() => go("/dashboard?new=1")}>{t.addStall}</button>}
      {stalls.length < 2 && current && <small className="status">{t.helperHint}</small>}
    </div>
  );
}
