"use client";
import { useEffect, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { cx } from "../ui/controls";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** iPhones and iPads (which report themselves as Macs with a touch screen). */
function appleTouchDevice() {
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * The store as an app. Registers the service worker that shows the store's offline page
 * (public/sw.js) and keeps that page in the store's current look. Offers to install the store
 * where the browser can (Chrome, Edge, Android), and explains Add to Home Screen on iPhones and
 * iPads. Shows nothing once the store is installed.
 */
export default function InstallApp({ storeName, className }: { storeName: string; className?: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [apple, setApple] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          // The offline page is copied when the service worker installs; refresh it once a visit.
          try {
            if (sessionStorage.getItem("offline-page")) return;
            sessionStorage.setItem("offline-page", "1");
          } catch {
            // Storage is off (private browsing): refresh it anyway.
          }
          return caches.open("offline-v1").then((cache) => cache.add(new Request("/offline", { cache: "reload" })));
        })
        .catch(() => {});
    }
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (installed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setPrompt(null);
      setApple(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setApple(appleTouchDevice());
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt && !apple) return null;

  const install = async () => {
    if (!prompt) return setHelp(true);
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    setPrompt(null);
  };

  return (
    <>
      <button type="button" onClick={install} className={cx("self-start underline underline-offset-4", className)}>
        Get the {storeName} app
      </button>
      <Dialog open={help} onClose={() => setHelp(false)} title={`Add ${storeName} to your Home Screen`} size="sm">
        <ol className="grid list-decimal gap-2 pl-5 text-sm leading-relaxed">
          <li>Open the Share menu: in Safari, the square with an arrow pointing up.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. {storeName} opens from your Home Screen like an app.</li>
        </ol>
      </Dialog>
    </>
  );
}
