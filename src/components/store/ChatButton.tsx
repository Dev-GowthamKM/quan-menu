"use client";
import { usePathname } from "next/navigation";
import { indianMobile } from "@/lib/phone";
import { cx } from "../ui/controls";
import { ChatIcon } from "../ui/icons";

/** A WhatsApp number as wa.me wants it: country code and digits only. */
function chatNumber(input: string) {
  const digits = input.replace(/[^\d+]/g, "");
  return indianMobile(digits) ?? (/^\+\d{8,15}$/.test(digits) ? digits.slice(1) : null);
}

/**
 * "Chat with us": opens WhatsApp with the store (Settings › Store details). Out of the way
 * of the bag and checkout, and above the add-to-bag bar on product pages on phones.
 */
export default function ChatButton({ number, storeName }: { number: string; storeName: string }) {
  const pathname = usePathname();
  const to = chatNumber(number);
  if (!to || /^\/(checkout|cart)(\/|$)/.test(pathname)) return null;
  const text = encodeURIComponent(`Hi ${storeName}, I have a question.`);
  return (
    <a
      href={`https://wa.me/${to}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={cx(
        "fixed right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-brand px-4 text-sm text-on-brand shadow-lg transition-transform hover:scale-105 md:right-6",
        pathname.startsWith("/products/") ? "bottom-24 lg:bottom-6" : "bottom-5 md:bottom-6",
      )}
    >
      <ChatIcon size={20} />
      <span className="hidden sm:inline">Chat with us</span>
    </a>
  );
}
