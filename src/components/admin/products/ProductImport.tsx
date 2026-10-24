"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyImportStatuses, importProducts, lookupMedia, type ImportProduct, type ImportResult } from "@/server/admin/catalog";
import { storageUrl } from "@/lib/env";
import { toCsv } from "@/lib/csv";
import { COLUMNS, imageBaseName, isUrl, parseProductCsv, type ParsedFile, type ParsedProduct, type RowIssue } from "@/lib/product-csv";
import { Button, cx } from "../../ui/controls";
import { DownloadIcon, UploadIcon } from "../../ui/icons";
import { Card } from "../ui";
import { useAdminStore } from "../AdminStore";
import { datedPath, pathFromUrl, prepareImage, uploadFile } from "../upload";

const BATCH = 25;
const MAX_ROWS = 5000;

interface DroppedImage {
  key: string;
  file: File;
  base: string;
  state: "waiting" | "uploading" | "done" | "error";
  progress: number;
  path?: string;
  error?: string;
}

interface ReportRow {
  rows: number[];
  handle: string;
  result: "create" | "update" | "error";
  message: string;
}

type Phase = "idle" | "checking" | "checked" | "importing" | "done";

export default function ProductImport() {
  const store = useAdminStore();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [images, setImages] = useState<DroppedImage[]>([]);
  const [over, setOver] = useState(false);
  const [options, setOptions] = useState({ update_existing: true, create_missing: false, publish: "draft" as "draft" | "file" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ label: "", done: 0, total: 0 });
  const [report, setReport] = useState<ReportRow[]>([]);
  const [skipErrors, setSkipErrors] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const busy = phase === "checking" || phase === "importing";
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const reset = () => {
    setPhase("idle");
    setReport([]);
    setSkipErrors(false);
    setPublished(null);
    setFatal(null);
  };

  const accept = async (files: FileList | File[]) => {
    const list = [...files];
    const csv = list.find((f) => /\.(csv|txt|tsv)$/i.test(f.name) || f.type === "text/csv");
    const imgs = list.filter((f) => f.type.startsWith("image/"));
    if (csv) {
      reset();
      const text = await csv.text();
      const result = parseProductCsv(text);
      if (result.rowCount > MAX_ROWS) {
        setFatal(`This file has ${result.rowCount} rows. Split it into files of at most ${MAX_ROWS} rows.`);
        return;
      }
      setFileName(csv.name);
      setParsed(result);
    }
    if (imgs.length) {
      reset();
      setImages((prev) => [
        ...prev.filter((p) => !imgs.some((f) => imageBaseName(f.name) === p.base)),
        ...imgs.map((file) => ({ key: crypto.randomUUID(), file, base: imageBaseName(file.name), state: "waiting" as const, progress: 0 })),
      ]);
    }
    if (!csv && !imgs.length) setFatal("Drop a .csv file (and, optionally, the images it names).");
  };

  /** Uploads dropped images that haven't been uploaded yet; returns base name -> storage path. */
  const uploadImages = async () => {
    const map: Record<string, string> = {};
    for (const im of imagesRef.current) {
      if (im.state === "done" && im.path) {
        map[im.base] = im.path;
        continue;
      }
      setImages((list) => list.map((x) => (x.key === im.key ? { ...x, state: "uploading", progress: 0, error: undefined } : x)));
      try {
        const prepared = await prepareImage(im.file);
        const { path } = await uploadFile(datedPath(store.id, "library", im.file.name, prepared.ext), prepared.blob, prepared.type, (f) =>
          setImages((list) => list.map((x) => (x.key === im.key ? { ...x, progress: f } : x))),
        );
        map[im.base] = path;
        setImages((list) => list.map((x) => (x.key === im.key ? { ...x, state: "done", progress: 1, path } : x)));
      } catch (e) {
        setImages((list) => list.map((x) => (x.key === im.key ? { ...x, state: "error", error: (e as Error).message } : x)));
      }
    }
    return map;
  };

  /** Turns parsed products into import payloads, resolving image file names. */
  const prepare = async (): Promise<{ payloads: { p: ParsedProduct; payload: ImportProduct }[]; issues: ReportRow[] } | null> => {
    if (!parsed) return null;
    setProgress({ label: "Uploading images", done: 0, total: 0 });
    const uploaded = await uploadImages();
    const names = new Set<string>();
    for (const p of parsed.products) for (const r of p.imageRefs) if (!isUrl(r.ref) && !uploaded[imageBaseName(r.ref)]) names.add(imageBaseName(r.ref));
    let library: Record<string, string> = {};
    if (names.size) {
      const res = await lookupMedia([...names]);
      if (!res.ok) {
        setFatal(res.error);
        return null;
      }
      library = res.data;
    }
    const badRows = new Map<number, string[]>();
    for (const e of parsed.errors) badRows.set(e.row, [...(badRows.get(e.row) ?? []), e.message]);
    const issues: ReportRow[] = [];
    const payloads: { p: ParsedProduct; payload: ImportProduct }[] = [];
    for (const p of parsed.products) {
      const messages = p.rows.flatMap((r) => (badRows.get(r) ?? []).map((m) => `Row ${r}: ${m}`));
      const imagesOut: NonNullable<ImportProduct["images"]> = [];
      for (const ref of p.imageRefs) {
        if (isUrl(ref.ref)) {
          imagesOut.push({ url: ref.ref, storage_path: pathFromUrl(ref.ref) ?? undefined, alt: ref.alt });
          continue;
        }
        const path = uploaded[imageBaseName(ref.ref)] ?? library[imageBaseName(ref.ref)];
        if (path) imagesOut.push({ url: storageUrl(path), storage_path: path, alt: ref.alt });
        else messages.push(`Image "${ref.ref}" isn't in the media library. Drop it here with the CSV, or upload it in Media library.`);
      }
      if (messages.length) {
        issues.push({ rows: p.rows, handle: p.handle, result: "error", message: messages.join(" ") });
        continue;
      }
      const { imageRefs: _refs, status: _status, publish_at: _publish, ...rest } = p;
      void _refs; void _status; void _publish;
      payloads.push({ p, payload: { ...rest, ...(imagesOut.length ? { images: imagesOut } : {}) } });
    }
    for (const e of parsed.errors) if (e.row === 1) issues.unshift({ rows: [1], handle: "", result: "error", message: e.message });
    return { payloads, issues };
  };

  const runBatches = async (payloads: ImportProduct[], dryRun: boolean, label: string) => {
    const out: ImportResult[] = [];
    setProgress({ label, done: 0, total: payloads.length });
    for (let i = 0; i < payloads.length; i += BATCH) {
      const res = await importProducts(payloads.slice(i, i + BATCH), { ...options, dry_run: dryRun });
      if (!res.ok) throw new Error(res.error);
      out.push(...res.data);
      setProgress({ label, done: Math.min(i + BATCH, payloads.length), total: payloads.length });
    }
    return out;
  };

  const toReport = (results: ImportResult[]): ReportRow[] =>
    results.map((r) => ({ rows: r.rows, handle: r.handle, result: r.ok ? (r.action ?? "update") : "error", message: r.ok ? (r.action === "create" ? "Will be created" : "Will be updated") : r.error ?? "Error" }));

  const check = async () => {
    setFatal(null);
    setPhase("checking");
    try {
      const prep = await prepare();
      if (!prep) return setPhase("idle");
      const results = await runBatches(prep.payloads.map((x) => x.payload), true, "Checking products");
      setReport([...prep.issues, ...toReport(results)]);
      setPhase("checked");
    } catch (e) {
      setFatal((e as Error).message);
      setPhase("idle");
    }
  };

  const runImport = async () => {
    setFatal(null);
    setPhase("importing");
    try {
      const prep = await prepare();
      if (!prep) return setPhase("checked");
      const results = await runBatches(prep.payloads.map((x) => x.payload), false, "Importing products");
      const rows: ReportRow[] = [
        ...prep.issues,
        ...results.map((r) => ({
          rows: r.rows, handle: r.handle, result: r.ok ? (r.action ?? "update") : ("error" as const),
          message: r.ok ? (r.action === "create" ? "Created as a draft" : "Updated") : r.error ?? "Error",
        })),
      ];
      const failed = rows.filter((r) => r.result === "error").length;
      if (options.publish === "file") {
        if (failed === 0) {
          const byHandle = new Map(prep.payloads.map((x) => [x.p.handle, x.p]));
          const items = results
            .filter((r) => r.ok && r.id)
            .map((r) => ({ id: r.id!, p: byHandle.get(r.handle) }))
            .filter((x) => x.p?.status || x.p?.publish_at)
            .map((x) => ({ id: x.id, status: x.p!.status ?? "draft", published_at: x.p!.publish_at ?? null }));
          if (items.length) {
            setProgress({ label: "Applying statuses", done: 0, total: 1 });
            const res = await applyImportStatuses(items);
            if (!res.ok) throw new Error(`Products were imported, but statuses couldn't be applied: ${res.error}`);
            setPublished(`Statuses from the file were applied to ${res.data.count} product${res.data.count === 1 ? "" : "s"}.`);
          }
        } else {
          setPublished(`Nothing was published: ${failed} product${failed === 1 ? "" : "s"} had errors, so new products stayed as drafts. Fix the rows below and import the file again.`);
        }
      }
      setReport(rows);
      setPhase("done");
    } catch (e) {
      setFatal((e as Error).message);
      setPhase("checked");
    }
  };

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, error: 0 };
    for (const r of report) c[r.result]++;
    return c;
  }, [report]);

  const downloadReport = () => {
    const rows = [["rows", "handle", "result", "message"], ...report.map((r) => [r.rows.join(" "), r.handle, r.result, r.message])];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const products = parsed?.products.length ?? 0;
  const canImport = phase === "checked" && counts.create + counts.update > 0 && (counts.error === 0 || skipErrors);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Card title="1. Choose your file">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (!busy) accept(e.dataTransfer.files);
            }}
            className={cx("grid place-items-center rounded-lg border-2 border-dashed px-4 py-10 text-center text-sm transition", over ? "border-ink bg-black/[0.03]" : "border-black/15")}
          >
            <UploadIcon className="text-stone" />
            <p className="mt-2">
              Drag your CSV here, together with any images it names, or{" "}
              <button type="button" disabled={busy} className="font-medium underline" onClick={() => input.current?.click()}>choose files</button>
            </p>
            <p className="mt-1 text-xs text-stone">One row per variant. Up to {MAX_ROWS.toLocaleString("en-IN")} rows per file.</p>
            <input ref={input} type="file" accept=".csv,text/csv,image/*" multiple hidden onChange={(e) => { if (e.target.files) accept(e.target.files); e.target.value = ""; }} />
          </div>
          {fatal && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{fatal}</p>}
          {parsed && (
            <div className="mt-4 grid gap-2 text-sm">
              <p>
                <b>{fileName}</b>: {parsed.rowCount} rows, {products} {products === 1 ? "product" : "products"}
                {parsed.errors.length > 0 && <span className="text-red-700"> · {parsed.errors.length} {parsed.errors.length === 1 ? "problem" : "problems"} found</span>}
              </p>
              {parsed.warnings.map((w) => <p key={w} className="text-xs text-amber-800">{w}</p>)}
            </div>
          )}
          {images.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-taupe">{images.length} {images.length === 1 ? "image" : "images"} to add to the media library</p>
              <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto text-xs">
                {images.map((im) => (
                  <li key={im.key} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate">{im.file.name}</span>
                    {im.state === "error" ? (
                      <span className="text-red-700">{im.error}</span>
                    ) : im.state === "done" ? (
                      <span className="text-emerald-700">Uploaded</span>
                    ) : im.state === "uploading" ? (
                      <span className="tabular-nums text-taupe">{Math.round(im.progress * 100)}%</span>
                    ) : (
                      <span className="text-stone">Waiting</span>
                    )}
                    {!busy && im.state !== "done" && (
                      <button type="button" className="text-stone underline" onClick={() => setImages((l) => l.filter((x) => x.key !== im.key))}>Remove</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="2. Check, then import">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" onClick={check} disabled={!parsed || !products || busy} busy={phase === "checking"}>
              Check file
            </Button>
            <Button size="sm" onClick={runImport} disabled={!canImport || busy} busy={phase === "importing"}>
              {counts.error && skipErrors ? `Import ${counts.create + counts.update} without errors` : `Import ${counts.create + counts.update || ""} products`}
            </Button>
            {report.length > 0 && (
              <button type="button" onClick={downloadReport} className="ml-auto inline-flex items-center gap-1.5 text-sm underline"><DownloadIcon size={14} /> Download report</button>
            )}
          </div>
          {busy && (
            <div className="mt-4" aria-live="polite">
              <p className="text-xs text-taupe">{progress.label}{progress.total ? ` · ${progress.done} of ${progress.total}` : "…"}</p>
              <div className="mt-1.5 h-1.5 rounded bg-black/10" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.done}>
                <div className="h-1.5 rounded bg-ink transition-all" style={{ width: `${progress.total ? Math.max(3, (progress.done / progress.total) * 100) : 3}%` }} />
              </div>
            </div>
          )}
          {phase === "checked" && (
            <div className="mt-4 grid gap-2 text-sm">
              <p>
                {counts.create} to create · {counts.update} to update · <span className={counts.error ? "font-medium text-red-700" : undefined}>{counts.error} with errors</span>. Nothing has been saved yet.
              </p>
              {counts.error > 0 && (
                <label className="inline-flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                  <input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} className="mt-0.5 size-4 accent-ink" />
                  <span>Import the products without errors and skip the rest. Statuses from the file won&apos;t be applied, so new products stay as drafts.</span>
                </label>
              )}
            </div>
          )}
          {phase === "done" && (
            <div className="mt-4 grid gap-2 text-sm">
              <p className="font-medium">
                Done: {counts.create} created, {counts.update} updated{counts.error ? `, ${counts.error} skipped because of errors` : ""}.
              </p>
              {published && <p className={published.startsWith("Nothing") ? "text-amber-800" : "text-emerald-800"}>{published}</p>}
              {options.publish === "draft" && counts.create > 0 && <p className="text-taupe">New products are drafts. Review them, then publish from the product list.</p>}
              <p><Link href="/admin/products?status=draft" className="underline">View drafts</Link> · <Link href="/admin/products" className="underline">All products</Link></p>
            </div>
          )}

          {report.length > 0 && (
            <div className="mt-4 max-h-[28rem] overflow-auto rounded-md border border-black/10">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#fafaf9] text-left text-xs text-taupe">
                  <tr><th className="px-3 py-2 font-medium">Rows</th><th className="px-3 py-2 font-medium">Handle</th><th className="px-3 py-2 font-medium">Result</th></tr>
                </thead>
                <tbody>
                  {[...report].sort((a, b) => Number(b.result === "error") - Number(a.result === "error") || a.rows[0] - b.rows[0]).map((r, i) => (
                    <tr key={`${r.handle}-${i}`} className="border-t border-black/5 align-top">
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-stone tabular-nums">{r.rows.length > 3 ? `${r.rows[0]}–${r.rows[r.rows.length - 1]}` : r.rows.join(", ")}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{r.handle || "—"}</td>
                      <td className={cx("px-3 py-2", r.result === "error" ? "text-red-800" : "text-emerald-800")}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        <Card title="Options">
          <fieldset disabled={busy} className="grid gap-3 text-sm">
            <label className="inline-flex items-start gap-2">
              <input type="checkbox" checked={options.update_existing} onChange={(e) => { setOptions({ ...options, update_existing: e.target.checked }); reset(); }} className="mt-0.5 size-4 accent-ink" />
              <span>Update existing products with the same handle<span className="block text-xs text-stone">Blank cells keep current values. Variants not in the file are left alone.</span></span>
            </label>
            <label className="inline-flex items-start gap-2">
              <input type="checkbox" checked={options.create_missing} onChange={(e) => { setOptions({ ...options, create_missing: e.target.checked }); reset(); }} className="mt-0.5 size-4 accent-ink" />
              <span>Create missing brands and categories</span>
            </label>
            <div className="grid gap-2 border-t border-black/10 pt-3">
              <p className="text-xs font-medium text-taupe">Publishing</p>
              <label className="inline-flex items-start gap-2">
                <input type="radio" name="publish" checked={options.publish === "draft"} onChange={() => setOptions({ ...options, publish: "draft" })} className="mt-0.5 size-4 accent-ink" />
                <span>Import new products as drafts<span className="block text-xs text-stone">Existing products keep their status. Publish when you&apos;re ready.</span></span>
              </label>
              <label className="inline-flex items-start gap-2">
                <input type="radio" name="publish" checked={options.publish === "file"} onChange={() => setOptions({ ...options, publish: "file" })} className="mt-0.5 size-4 accent-ink" />
                <span>Use the status column<span className="block text-xs text-stone">Applied only if every product imports without errors.</span></span>
              </label>
            </div>
          </fieldset>
        </Card>
        <Card title="Format">
          <p className="text-sm text-taupe">One row per variant; rows with the same handle form one product. Prices are in rupees.</p>
          <a href="/admin/products/import/template" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline"><DownloadIcon size={14} /> Download the template</a>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-taupe hover:text-ink">All columns</summary>
            <dl className="mt-2 grid gap-2 text-xs">
              {COLUMNS.map(([name, help]) => (
                <div key={name}>
                  <dt className="font-mono font-medium">{name}</dt>
                  <dd className="text-stone">{help}</dd>
                </div>
              ))}
            </dl>
          </details>
        </Card>
      </div>
    </div>
  );
}

export type { RowIssue };
