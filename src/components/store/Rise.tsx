import { Fragment, type CSSProperties } from "react";

/**
 * A heading's words, each in its own mask, so that in cinematic designs the heading rises into
 * place line by line (globals.css, "Rising headlines"). The heading carries data-rise: rising
 * as it scrolls into view (Motion.tsx works out the lines), or data-rise="load" for one on
 * screen from the start. Elsewhere, and for shoppers who ask for less motion, it's plain text.
 */
export default function Rise({ text }: { text: string }) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => (
      <Fragment key={i}>
        {i > 0 && " "}
        <span className="rise-w" style={{ "--i": i } as CSSProperties}>
          <span className="rise-i">{word}</span>
        </span>
      </Fragment>
    ));
}
