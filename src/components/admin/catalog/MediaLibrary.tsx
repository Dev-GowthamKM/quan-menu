"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteMedia } from "@/server/admin/catalog";
import { storageUrl } from "@/lib/env";
import { formatDate } from "@/lib/format";
import CatalogImage from "../../ui/CatalogImage";
import { Badge, Button, cx } from "../../ui/controls";
import { CopyIcon, TrashIcon, UploadIcon } from "../../ui/icons";
import { useToast } from "../Toaster";
import { useAdminStore } from "../AdminStore";
import { datedPath, prepareImage, uploadFile } from "../upload";

export interface MediaFile {
  path: string;
  created_at: string;
  size: number;
  mimetype: string | null;
  used: boolean;
}

interface Job {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Bulk image uploads (resized in the browser, with progress) and clean-up of unused files. */
export default function MediaLibrary({ files }: { files: MediaFile[] }) {
  const store = useAdminStore();
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [over, setOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const upload = async (list: FileList | File[]) => {
    const images = [...list].filter((f) => f.type.startsWith("image/")).slice(0, 100);
    if (!images.length) return toast("Choose image files (JPEG, PNG or WebP).", "error");
    const queue = images.map((f) => ({ key: crypto.randomUUID(), name: f.name, progress: 0 }));
    setJobs((j) => [...j, ...queue]);
    let done = 0;
    // Three at a time: quick on a good connection, gentle on a phone.
    const work = images.map((file, i) => async () => {
      const job = queue[i];
      try {
        const prepared = await prepareImage(file);
        await uploadFile(datedPath(store.id, "library", file.name, prepared.ext), prepared.blob, prepared.type, (f) =>
          setJobs((all) => all.map((x) => (x.key === job.key ? { ...x, progress: f } : x))),
        );
        done++;
        setJobs((all) => all.filter((x) => x.key !== job.key));
      } catch (e) {
        setJobs((all) => all.map((x) => (x.key === job.key ? { ...x, error: (e as Error).message } : x)));
      }
    });
    const runners = Array.from({ length: 3 }, async () => {
      while (work.length) await work.shift()!();
    });
    await Promise.all(runners);
    if (done) {
      toast(`${done} image${done === 1 ? "" : "s"} uploaded.`);
      router.refresh();
    }
  };

  const remove = (paths: string[]) =>
    start(async () => {
      const res = await deleteMedia(paths);
      if (!res.ok) return toast(res.error, "error");
      toast(res.message ?? "Deleted.", res.data.kept ? "info" : "ok");
      setSelected(new Set());
      router.refresh();
    });

  const copy = async (path: string) => {
    try {
      await navigator.clipboard.writeText(storageUrl(path));
      toast("Link copied.");
    } catch {
      toast(storageUrl(path), "info");
    }
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
        className={cx("mb-4 grid place-items-center rounded-lg border-2 border-dashed bg-white px-4 py-8 text-center text-sm", over ? "border-ink" : "border-black/15")}
      >
        <UploadIcon className="text-stone" />
        <p className="mt-2">Drag images here or <button type="button" className="font-medium underline" onClick={() => input.current?.click()}>choose files</button></p>
        <p className="mt-1 text-xs text-stone">Up to 100 at a time. Large photos are resized to 2000px and converted to WebP. Use these file names in CSV imports.</p>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
      </div>

      {jobs.length > 0 && (
        <ul className="mb-4 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.key} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate">{j.name}</span>
                {j.error ? <button type="button" className="text-red-700 underline" onClick={() => setJobs((all) => all.filter((x) => x.key !== j.key))}>Dismiss</button> : <span className="tabular-nums">{Math.round(j.progress * 100)}%</span>}
              </div>
              {j.error ? <p className="mt-1 text-red-700">{j.error}</p> : <div className="mt-1.5 h-1 rounded bg-black/10"><div className="h-1 rounded bg-ink" style={{ width: `${Math.max(4, j.progress * 100)}%` }} /></div>}
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 && (
        <div className="sticky top-2 z-20 mb-3 flex items-center gap-3 rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-lg">
          {selected.size} selected
          <button type="button" className="ml-auto inline-flex items-center gap-1.5 text-red-200 hover:text-white" disabled={pending} onClick={() => remove([...selected])}><TrashIcon size={14} /> Delete unused</button>
          <button type="button" className="text-white/70 hover:text-white" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-black/15 bg-white px-6 py-14 text-center text-sm text-taupe">No files here yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {files.map((f) => {
            const name = f.path.split("/").pop() ?? f.path;
            const checked = selected.has(f.path);
            return (
              <li key={f.path} className={cx("overflow-hidden rounded-lg border bg-white", checked ? "border-ink" : "border-black/10")}>
                <label className="relative block aspect-square cursor-pointer bg-bone">
                  <CatalogImage src={storageUrl(f.path)} alt={name} fill sizes="200px" className="object-cover" />
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(f.path);
                      else next.delete(f.path);
                      setSelected(next);
                    }}
                    aria-label={`Select ${name}`}
                    className="absolute top-2 left-2 size-4 accent-ink"
                  />
                  <span className="absolute top-1.5 right-1.5">{f.used ? <Badge tone="green">In use</Badge> : <Badge>Unused</Badge>}</span>
                </label>
                <div className="grid gap-0.5 p-2 text-xs">
                  <p className="truncate font-medium" title={f.path}>{name}</p>
                  <p className="text-stone">{kb(f.size)} · {formatDate(f.created_at)}</p>
                  <div className="mt-1 flex gap-2">
                    <button type="button" onClick={() => copy(f.path)} className="inline-flex items-center gap-1 underline"><CopyIcon size={11} /> Copy link</button>
                    {!f.used && <button type="button" onClick={() => remove([f.path])} disabled={pending} className="ml-auto text-red-700 underline">Delete</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {files.length > 0 && <div className="mt-2 flex justify-end"><Button size="sm" variant="ghost" onClick={() => setSelected(new Set(files.filter((f) => !f.used).map((f) => f.path)))}>Select unused on this page</Button></div>}
    </div>
  );
}
