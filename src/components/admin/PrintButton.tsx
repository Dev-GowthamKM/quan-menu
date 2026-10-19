"use client";
import { PrintIcon } from "../ui/icons";

export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="no-print inline-flex h-9 items-center gap-2 rounded-md bg-ink px-4 text-sm text-white">
      <PrintIcon size={15} /> Print
    </button>
  );
}
