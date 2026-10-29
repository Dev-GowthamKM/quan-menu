"use client";
import { cx } from "./controls";
import { PrintIcon } from "./icons";

/** Prints the page (or saves it as a PDF, from the print dialog). Hidden on the printout itself. */
export default function PrintButton({
  label = "Print",
  className = "inline-flex h-9 items-center gap-2 rounded-md bg-ink px-4 text-sm text-white",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => window.print()} className={cx("no-print", className)}>
      <PrintIcon size={15} /> {label}
    </button>
  );
}
