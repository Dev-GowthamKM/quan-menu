"use client";
import { useState } from "react";
import { cx } from "../ui/controls";
import { CloseIcon } from "../ui/icons";

/**
 * A list of short values (tags, sizes) typed one at a time. Enter or comma adds a value,
 * Backspace on an empty field removes the last one; pasting "S, M, L" adds all three.
 */
export default function ChipsInput({
  id, label, values, onChange, placeholder, suggestions = [], max = 40, maxLength = 40, onRemove,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
  maxLength?: number;
  /** Return false to keep the value (for example after a declined confirmation). */
  onRemove?: (value: string) => boolean;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(/[,\n]/).map((p) => p.trim().slice(0, maxLength)).filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase()) && next.length < max) next.push(p);
    onChange(next);
    setText("");
  };
  const remove = (v: string) => {
    if (onRemove && onRemove(v) === false) return;
    onChange(values.filter((x) => x !== v));
  };
  const listId = suggestions.length ? `${id}-suggestions` : undefined;

  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-taupe">{label}</label>
      <div className="mt-1.5 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-black/15 bg-white px-1.5 py-1 focus-within:border-ink">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-black/[0.06] py-0.5 pr-1 pl-2 text-xs">
            {v}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${v}`} className="grid size-4 place-items-center rounded hover:bg-black/10">
              <CloseIcon size={11} />
            </button>
          </span>
        ))}
        <input
          id={id}
          list={listId}
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,\n]/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && values.length) {
              remove(values[values.length - 1]);
            }
          }}
          onBlur={() => add(text)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[,\n]/.test(t)) {
              e.preventDefault();
              add(t);
            }
          }}
          placeholder={values.length ? "" : placeholder}
          className={cx("h-7 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none")}
        />
        {listId && (
          <datalist id={listId}>
            {suggestions.filter((s) => !values.includes(s)).map((s) => <option key={s} value={s} />)}
          </datalist>
        )}
      </div>
    </div>
  );
}
