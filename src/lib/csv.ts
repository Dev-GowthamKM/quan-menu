// CSV reading and writing (RFC 4180): quoted fields, embedded commas, quotes and line
// breaks, a UTF-8 byte-order mark, and comma, semicolon or tab separators (spreadsheets
// in some regions save with semicolons).

type Delimiter = "," | ";" | "\t";

export function detectDelimiter(text: string): Delimiter {
  const end = text.search(/\r?\n/);
  const firstLine = end === -1 ? text : text.slice(0, end);
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch as Delimiter]++;
  }
  const best = (Object.entries(counts) as [Delimiter, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

/** Parses CSV text into rows of cells. */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * One CSV cell. Values a spreadsheet would run as a formula (=, +, -, @ at the start)
 * get a leading apostrophe so opening an export can't execute anything.
 */
export function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]) {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Undoes the apostrophe added by csvCell when a file comes back in. */
export function cleanCell(s: string) {
  const t = s.trim();
  return /^'[=+\-@]/.test(t) ? t.slice(1) : t;
}
