import { describe, expect, it } from "vitest";
import { cleanCell, csvCell, parseCsv, toCsv } from "@/lib/csv";
describe("csv", () => {
  it("round trips tricky values", () => {
    const rows = [["a", "b, c", 'say "hi"', "line1\nline2", "=SUM(A1)", "-5", "  pad  "]];
    const text = toCsv(rows);
    const back = parseCsv(text);
    expect(back[0].map(cleanCell)).toEqual(["a", "b, c", 'say "hi"', "line1\nline2", "=SUM(A1)", "-5", "pad"]);
    expect(csvCell("=1+1")).toBe("'=1+1");
  });
  it("detects semicolons and CRLF", () => {
    expect(parseCsv("h1;h2\r\n1;\"x;y\"\r\n")).toEqual([["h1", "h2"], ["1", "x;y"]]);
  });
});
