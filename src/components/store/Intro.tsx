import type { CSSProperties } from "react";

// Decides before anything is drawn whether this visit opens with the curtain: only on the home
// page, once a visit (sessionStorage), and never for shoppers who ask for less motion. While it
// plays, <html> carries "intro-playing" (globals.css shows the curtain and holds the page's own
// opening animations until it lifts); a tap or a key lifts it at once.
const SCRIPT = `(function(){var d=document.documentElement;if(location.pathname!=="/"||d.classList.contains("intro-seen"))return;var seen=false;try{seen=!!sessionStorage.getItem("intro-seen");sessionStorage.setItem("intro-seen","1")}catch(e){}if(seen||matchMedia("(prefers-reduced-motion: reduce)").matches){d.classList.add("intro-seen");return}d.classList.add("intro-playing");var end=function(){d.classList.remove("intro-playing");d.classList.add("intro-seen");removeEventListener("pointerdown",end);removeEventListener("keydown",end)};setTimeout(end,2000);addEventListener("pointerdown",end);addEventListener("keydown",end)})()`;

/** The store's name on a curtain in its brand colour, rising letter by letter (word by word in scripts whose letters join), before the curtain lifts. */
export default function Intro({ name }: { name: string }) {
  const pieces = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(name) ? Array.from(name) : name.split(/(\s+)/);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      <div aria-hidden className="intro fixed inset-0 z-[100] place-items-center overflow-hidden bg-brand px-6 text-center text-on-brand">
        <p className="font-serif text-[clamp(2.75rem,11vw,9rem)] leading-none">
          {pieces.map((piece, i) =>
            piece.trim() ? (
              <span key={i} className="intro-piece" style={{ "--i": i } as CSSProperties}>
                {piece}
              </span>
            ) : (
              " "
            ),
          )}
        </p>
        <span className="intro-line" />
      </div>
    </>
  );
}
