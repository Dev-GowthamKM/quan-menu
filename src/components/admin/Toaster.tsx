"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cx } from "../ui/controls";
import { CloseIcon } from "../ui/icons";

type Tone = "ok" | "error" | "info";
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});

/** Short confirmations and errors for admin actions, announced to screen readers. */
export function useToast() {
  return useContext(Ctx);
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const toast = useCallback((text: string, tone: Tone = "ok") => {
    const id = ++next.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 9000 : 4500);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] grid w-[min(24rem,calc(100%-2rem))] gap-2" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg",
              t.tone === "error" ? "bg-red-700 text-white" : t.tone === "info" ? "bg-white text-ink ring-1 ring-black/10" : "bg-ink text-white",
            )}
          >
            <p className="flex-1">{t.text}</p>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="opacity-70 hover:opacity-100">
              <CloseIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
