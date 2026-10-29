import { describe, expect, it } from "vitest";
import { fontFile, parseFaces } from "./font-files";

// As the build writes them (app/fonts.ts through next/font): one rule per alphabet, the Latin one
// with its range shortened to u+00??, and a fallback face with no file.
const css = [
  "@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-stretch:100%;font-display:swap;src:url(/_next/static/media/23d669af23d19c95-s.woff2) format(\"woff2\");unicode-range:u+0100-02ba,u+02bd-02c5,u+2c60-2c7f,u+a720-a7ff}",
  "@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-stretch:100%;font-display:swap;src:url(/_next/static/media/1a4aa50920b5315c-s.woff2) format(\"woff2\");unicode-range:u+00??,u+0131,u+0152-0153,u+2000-206f,u+feff,u+fffd}",
  "@font-face{font-family:Archivo;font-style:italic;font-weight:100 900;font-stretch:100%;font-display:swap;src:url(/_next/static/media/d38dd3a93f59421d-s.woff2) format(\"woff2\");unicode-range:u+00??,u+0131,u+0152-0153}",
  "@font-face{font-family:Archivo Fallback;src:local(\"Arial\");ascent-override:88.96%;descent-override:21.28%;line-gap-override:0.00%;size-adjust:98.70%}",
  "@font-face{font-family:Cormorant Garamond;font-style:normal;font-weight:400;font-display:swap;src:url(/_next/static/media/aaaa-s.woff2) format(\"woff2\");unicode-range:U+0000-00FF,U+0131}",
  "@font-face{font-family:Cormorant Garamond;font-style:normal;font-weight:500;font-display:swap;src:url(/_next/static/media/7b89a4fd5e90ede0-s.p.woff2) format(\"woff2\");unicode-range:u+00??,u+0131}",
  "@font-face{font-family:Cormorant Garamond;font-style:normal;font-weight:500;font-display:swap;src:url(/_next/static/media/393d45a2251e223a-s.woff2) format(\"woff2\");unicode-range:u+0460-052f,u+1c80-1c8a}",
].join("");

describe("font files", () => {
  const faces = parseFaces(css);

  it("keeps each face's Latin file and skips other alphabets and fallbacks", () => {
    expect(faces.map((f) => f.url)).toEqual([
      "/_next/static/media/1a4aa50920b5315c-s.woff2",
      "/_next/static/media/d38dd3a93f59421d-s.woff2",
      "/_next/static/media/aaaa-s.woff2",
      "/_next/static/media/7b89a4fd5e90ede0-s.p.woff2",
    ]);
  });

  it("finds the file for a weight and style, within a variable font's range", () => {
    expect(fontFile("Archivo", 800, false, faces)).toBe("/_next/static/media/1a4aa50920b5315c-s.woff2");
    expect(fontFile("Archivo", 400, true, faces)).toBe("/_next/static/media/d38dd3a93f59421d-s.woff2");
    expect(fontFile("Cormorant Garamond", 500, false, faces)).toBe("/_next/static/media/7b89a4fd5e90ede0-s.p.woff2");
    expect(fontFile("Cormorant Garamond", 400, false, faces)).toBe("/_next/static/media/aaaa-s.woff2");
  });

  it("has nothing for a weight, style or family the build doesn't have", () => {
    expect(fontFile("Cormorant Garamond", 700, false, faces)).toBeNull();
    expect(fontFile("Cormorant Garamond", 500, true, faces)).toBeNull();
    expect(fontFile("Inter", 400, false, faces)).toBeNull();
    expect(fontFile("Archivo", 400, false, [])).toBeNull();
  });
});
