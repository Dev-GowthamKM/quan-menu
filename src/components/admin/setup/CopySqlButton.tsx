"use client";
import { useState } from "react";
import { Button } from "../../ui/controls";
import { CopyIcon } from "../../ui/icons";

/**
 * Copies the database update to the clipboard, so it can be pasted into Supabase's SQL
 * editor (also from a phone). The text is fetched as part of the tap, which Safari needs.
 */
export default function CopySqlButton({ href }: { href: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "failed">("idle");
  const copy = async () => {
    setState("busy");
    const text = fetch(href, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) })]);
      } else {
        await navigator.clipboard.writeText(await text);
      }
      setState("copied");
    } catch {
      try {
        await navigator.clipboard.writeText(await text);
        setState("copied");
      } catch {
        setState("failed");
      }
    }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" busy={state === "busy"} onClick={copy}>
        <CopyIcon size={14} /> {state === "copied" ? "Copied" : "Copy the update"}
      </Button>
      <span role="status" className="text-xs text-taupe">
        {state === "copied" && "Now paste it into a new query in Supabase's SQL editor and click Run."}
        {state === "failed" && "This browser didn't allow copying. Download the file instead."}
      </span>
    </span>
  );
}
