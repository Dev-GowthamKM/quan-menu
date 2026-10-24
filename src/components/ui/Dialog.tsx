"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./icons";
import { cx } from "./controls";

/**
 * Modal dialog and slide-over drawer on the native <dialog> element: focus is trapped,
 * Escape closes it and the page behind is inert, without extra libraries.
 */
export function Dialog({
  open,
  onClose,
  title,
  side = "center",
  size = "md",
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  side?: "center" | "right" | "left";
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) {
      d.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl", full: "max-w-none" }[size];
  const placement =
    side === "center"
      ? cx("m-auto w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)]", width)
      : cx("my-0 h-dvh max-h-dvh w-full", width, side === "right" ? "mr-0 ml-auto" : "ml-0 mr-auto");

  return (
    <dialog
      ref={ref}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cx(
        "bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px] open:flex open:flex-col",
        placement,
        className,
      )}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {(title || side !== "center") && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <div className="font-serif text-xl">{title}</div>
          <button type="button" onClick={onClose} className="-mr-2 p-2 text-ink/70 hover:text-ink" aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
    </dialog>
  );
}
