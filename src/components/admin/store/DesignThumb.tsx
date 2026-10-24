import type { CSSProperties } from "react";
import type { Design } from "@/lib/designs";
import { HEADING_FONTS, mix, themeTokens, type HeadingFont, type ThemeColors } from "@/lib/theme";

/**
 * A small drawing of a store in a design: its header, main banner and product cards, in the
 * given colours and heading font. Not a screenshot: it shows how the parts are arranged, so
 * designs can be told apart at a glance in Settings › Appearance and the New store form.
 */
export default function DesignThumb({
  design,
  colors,
  heading = "cormorant",
  italic = false,
  storeName,
  className,
}: {
  design: Pick<Design, "header" | "hero" | "card" | "corners" | "buttons" | "headingCase">;
  colors: ThemeColors;
  heading?: HeadingFont;
  italic?: boolean;
  /** Shown as the logo in a larger drawing. */
  storeName?: string;
  className?: string;
}) {
  const t = themeTokens(colors);
  const c = (k: string) => t[`--color-${k}`];
  const photo = `linear-gradient(155deg, ${c("sand")}, ${mix(c("sand"), colors.accent, 0.55)})`;
  const dark = "linear-gradient(170deg, #3b3b3b, #0d0d0d)";
  const radius = { sharp: 0, soft: 2, round: 6 }[design.corners];
  const pill = design.buttons === "pill" ? 99 : design.buttons === "soft" ? 2 : 0;
  const face: CSSProperties = {
    fontFamily: HEADING_FONTS[heading].css,
    fontStyle: italic && HEADING_FONTS[heading].italic ? "italic" : "normal",
    textTransform: design.headingCase === "uppercase" ? "uppercase" : "none",
  };
  const line = (w: string, h = 3, bg = c("ink"), extra: CSSProperties = {}, key?: number) => <span key={key} style={{ display: "block", width: w, height: h, borderRadius: 2, background: bg, ...extra }} />;
  const logo = (size: number, color = c("ink")) => (
    <span style={{ ...face, fontSize: size, lineHeight: 1, color, letterSpacing: design.header === "classic" || design.header === "overlay" ? "0.2em" : undefined, whiteSpace: "nowrap" }}>
      {storeName ? storeName.slice(0, 18) : "Aa"}
    </span>
  );
  const dots = (n: number, color = c("ink")) => (
    <span style={{ display: "flex", gap: "6%", width: "36%", justifyContent: "center" }}>
      {Array.from({ length: n }, (_, i) => line("100%", 2, color, { opacity: 0.6 }, i))}
    </span>
  );

  const header = (() => {
    switch (design.header) {
      case "inline":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "6%", height: "11%", padding: "0 5%", borderBottom: `1px solid ${c("line")}` }}>
            {logo(9)}
            <span style={{ display: "flex", gap: 6, flex: 1 }}>{[0, 1, 2, 3].map((i) => line("9%", 2, c("ink"), { opacity: 0.55 }, i))}</span>
            {line("8%", 4)}
          </div>
        );
      case "bold":
        return (
          <div style={{ borderBottom: `2px solid ${c("ink")}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4%", height: 22, padding: "0 4%" }}>
              {logo(10)}
              <span style={{ flex: 1, height: 9, border: `1.5px solid ${c("ink")}`, borderRadius: pill }} />
              {line("7%", 4)}
            </div>
            <div style={{ display: "flex", gap: 4, padding: "3px 4% 4px", borderTop: `2px solid ${c("ink")}`, background: c("paper") }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} style={{ width: "14%", height: 7, borderRadius: pill, border: `1.5px solid ${i === 4 ? "#9b2c2c" : c("ink")}`, background: i === 4 ? "#9b2c2c" : undefined }} />
              ))}
            </div>
          </div>
        );
      case "centered":
        return (
          <div style={{ display: "grid", justifyItems: "center", gap: 4, padding: "5px 0 5px" }}>
            {logo(12)}
            <span style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 18, height: 7, borderRadius: pill, background: i === 0 ? c("bone") : undefined, border: `1px solid ${c("line")}` }} />)}
            </span>
          </div>
        );
      case "heritage":
        return (
          <div>
            <div style={{ height: 6, background: c("bone") }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4%", height: 18 }}>
              {line("10%", 1, c("accent"))}
              {logo(10)}
              {line("10%", 1, c("accent"))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 4px", borderTop: `1px solid ${c("line")}`, borderBottom: `1px solid ${c("line")}` }}>{dots(5)}</div>
          </div>
        );
      case "overlay":
        // Over a full-screen photo it's drawn in the photo; otherwise a plain bar with the menu button.
        return design.hero === "cinema" ? null : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 20, padding: "0 5%", borderBottom: `1px solid ${c("line")}` }}>
            {line("12%", 3)}
            {logo(9)}
            <span />
          </div>
        );
      default:
        return (
          <div style={{ borderBottom: `1px solid ${c("line")}` }}>
            <div style={{ height: 5, background: c("brand") }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 18 }}>{logo(10)}</div>
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: 4 }}>{dots(5)}</div>
          </div>
        );
    }
  })();

  const heroText = (color: string, align: "left" | "center" = "left", size = 15) => (
    <div style={{ display: "grid", gap: 4, justifyItems: align === "center" ? "center" : "start", textAlign: align }}>
      {line("30%", 2, c("accent"))}
      <span style={{ ...face, fontSize: size, lineHeight: 0.95, color, fontWeight: design.headingCase === "uppercase" ? 700 : 500 }}>{storeName ? "New season" : "Aa Bb"}</span>
      {line("50%", 2, color, { opacity: 0.4 })}
      <span style={{ width: 26, height: 7, borderRadius: pill, background: c("brand"), marginTop: 2 }} />
    </div>
  );

  const hero = (() => {
    switch (design.hero) {
      case "full":
        return (
          <div style={{ position: "relative", height: "44%", background: photo }}>
            <div style={{ position: "absolute", left: "5%", bottom: "8%", width: "42%", padding: "6px 7px", background: c("ivory") }}>{heroText(c("ink"), "left", 11)}</div>
          </div>
        );
      case "type":
        return (
          <div style={{ position: "relative", display: "flex", alignItems: "center", height: "44%", padding: "0 5%", background: c("sand"), borderBottom: `2px solid ${c("ink")}` }}>
            <div style={{ width: "52%" }}>{heroText(c("ink"), "left", 18)}</div>
            <span style={{ position: "absolute", right: "8%", top: "14%", width: "30%", height: "70%", background: photo, border: `1.5px solid ${c("ink")}`, borderRadius: radius, transform: "rotate(-4deg)", boxShadow: `3px 3px 0 ${c("ink")}` }} />
            <span style={{ position: "absolute", right: "34%", top: "8%", width: 18, height: 18, borderRadius: 99, background: c("brand"), border: `1.5px solid ${c("ink")}` }} />
          </div>
        );
      case "framed":
        return (
          <div style={{ height: "44%", padding: "2% 4%" }}>
            <div style={{ position: "relative", height: "100%", background: photo, borderRadius: radius * 1.5 }}>
              <div style={{ position: "absolute", left: "5%", bottom: "9%", width: "42%", padding: "5px 7px", borderRadius: radius, background: c("paper") }}>{heroText(c("ink"), "left", 11)}</div>
            </div>
          </div>
        );
      case "arch":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "6%", height: "44%", padding: "0 6%", background: c("bone") }}>
            <div style={{ flex: 1 }}>{heroText(c("ink"), "center", 13)}</div>
            <span style={{ width: "30%", height: "84%", background: photo, borderRadius: "999px 999px 0 0", outline: `1px solid ${c("accent")}`, outlineOffset: 2 }} />
          </div>
        );
      case "cinema":
        return (
          <div style={{ position: "relative", height: "56%", background: dark }}>
            {design.header === "overlay" && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", height: 20 }}>{logo(9, "#fff")}</div>}
            <div style={{ position: "absolute", left: "6%", bottom: "10%" }}>
              <span style={{ ...face, fontSize: 20, lineHeight: 0.95, color: "#fff" }}>{storeName ? "Night edit" : "Aa Bb"}</span>
            </div>
          </div>
        );
      default:
        return (
          <div style={{ display: "flex", height: "44%" }}>
            <div style={{ display: "flex", alignItems: "center", width: "50%", padding: "0 6%", background: c("bone") }}>{heroText(c("ink"))}</div>
            <div style={{ width: "50%", background: photo }} />
          </div>
        );
    }
  })();

  const card = (i: number) => {
    const img = (ratio: string, r = radius, extra: CSSProperties = {}) => <span style={{ display: "block", aspectRatio: ratio, background: photo, borderRadius: r, ...extra }} />;
    switch (design.card) {
      case "minimal":
        return (
          <div style={{ display: "grid", gap: 3 }}>
            {img("3 / 4")}
            <span style={{ display: "flex", justifyContent: "space-between" }}>{line("50%", 2)}{line("20%", 2)}</span>
          </div>
        );
      case "sticker":
        return (
          <div style={{ position: "relative", display: "grid", gap: 3, padding: 3, border: `1.5px solid ${c("ink")}`, borderRadius: radius, background: c("paper") }}>
            {img("1 / 1", Math.max(0, radius - 2))}
            {i === 0 && <span style={{ position: "absolute", top: 1, left: 1, width: 12, height: 7, borderRadius: 99, background: "#9b2c2c", transform: "rotate(-8deg)" }} />}
            {line("70%", 2)}
            {line("35%", 3)}
          </div>
        );
      case "soft":
        return (
          <div style={{ display: "grid", gap: 3, justifyItems: "center" }}>
            {img("4 / 5", radius + 2, { width: "100%" })}
            {line("60%", 2)}
            {line("30%", 2, c("accent"))}
          </div>
        );
      case "framed":
        return (
          <div style={{ display: "grid", gap: 3, justifyItems: "center", padding: 3, border: `1px solid ${c("line")}`, borderRadius: radius, background: c("paper") }}>
            {img("4 / 5", radius, { width: "100%" })}
            {line("55%", 2)}
            {line("28%", 2, c("accent"))}
          </div>
        );
      case "overlay":
        return (
          <div style={{ position: "relative" }}>
            {img("3 / 4", radius, { background: i % 2 ? dark : photo })}
            <span style={{ position: "absolute", left: 4, right: 4, bottom: 4, display: "grid", gap: 2 }}>{line("60%", 2, "#fff")}{line("30%", 2, "#fff", { opacity: 0.7 })}</span>
          </div>
        );
      default:
        return (
          <div style={{ display: "grid", gap: 3 }}>
            {img("4 / 5")}
            {line("40%", 2, c("stone"))}
            {line("65%", 2)}
          </div>
        );
    }
  };

  return (
    <div
      className={className}
      style={{ position: "relative", aspectRatio: "4 / 3", overflow: "hidden", background: c("ivory"), color: c("ink"), borderRadius: 4, border: "1px solid rgb(0 0 0 / 0.08)" }}
      aria-hidden
    >
      {header}
      {hero}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "4%", padding: "4% 5%" }}>{[0, 1, 2].map((i) => <div key={i}>{card(i)}</div>)}</div>
    </div>
  );
}
