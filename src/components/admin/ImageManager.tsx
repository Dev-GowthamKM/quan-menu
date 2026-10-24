"use client";
import { useRef, useState } from "react";
import CatalogImage from "../ui/CatalogImage";
import { cx } from "../ui/controls";
import { ChevronLeft, ChevronRight, CloseIcon, UploadIcon } from "../ui/icons";
import { useAdminStore } from "./AdminStore";
import { datedPath, prepareImage, uploadFile } from "./upload";

export interface EditorImage {
  id?: string | null;
  key: string;
  url: string;
  storage_path?: string | null;
  alt: string;
  color?: string | null;
  width?: number | null;
  height?: number | null;
}

interface Pending {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

/**
 * Product images: drag files in (or pick them from the computer or phone), watch them
 * upload, drag tiles to reorder, and the first image is the main one. Each image can be
 * tied to a colour so the product page shows it when that colour is chosen.
 */
export default function ImageManager({ images, onChange, colors, folder = "products" }: { images: EditorImage[]; onChange: (next: EditorImage[]) => void; colors: string[]; folder?: string }) {
  const store = useAdminStore();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const latest = useRef(images);
  latest.current = images;

  const add = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith("image/")).slice(0, 30);
    const queue = list.map((f) => ({ key: crypto.randomUUID(), name: f.name, progress: 0 }));
    setPending((p) => [...p, ...queue]);
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const job = queue[i];
      try {
        const prepared = await prepareImage(file);
        const { path, url } = await uploadFile(datedPath(store.id, folder, file.name, prepared.ext), prepared.blob, prepared.type, (f) =>
          setPending((p) => p.map((x) => (x.key === job.key ? { ...x, progress: f } : x))),
        );
        const image: EditorImage = { key: job.key, url, storage_path: path, alt: "", color: null, width: prepared.width, height: prepared.height };
        latest.current = [...latest.current, image];
        onChange(latest.current);
        setPending((p) => p.filter((x) => x.key !== job.key));
      } catch (e) {
        setPending((p) => p.map((x) => (x.key === job.key ? { ...x, error: (e as Error).message } : x)));
      }
    }
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const update = (key: string, patch: Partial<EditorImage>) => onChange(images.map((im) => (im.key === key ? { ...im, ...patch } : im)));

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
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={cx("grid place-items-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition", over ? "border-ink bg-black/[0.03]" : "border-black/15")}
      >
        <UploadIcon className="text-stone" />
        <p className="mt-2">
          Drag images here or{" "}
          <button type="button" onClick={() => input.current?.click()} className="font-medium underline">choose files</button>
        </p>
        <p className="mt-1 text-xs text-stone">JPEG, PNG or WebP. Resized to 2000px and converted to WebP before uploading.</p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 && (
        <ul className="mt-3 grid gap-2" aria-live="polite">
          {pending.map((p) => (
            <li key={p.key} className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="truncate">{p.name}</span>
                {p.error ? (
                  <button type="button" className="text-red-700 underline" onClick={() => setPending((x) => x.filter((y) => y.key !== p.key))}>Dismiss</button>
                ) : (
                  <span className="tabular-nums text-taupe">{Math.round(p.progress * 100)}%</span>
                )}
              </div>
              {p.error ? (
                <p className="mt-1 text-red-700">{p.error}</p>
              ) : (
                <div className="mt-1.5 h-1 rounded bg-black/10" role="progressbar" aria-valuenow={Math.round(p.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${p.name}`}>
                  <div className="h-1 rounded bg-ink transition-all" style={{ width: `${Math.max(4, p.progress * 100)}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {images.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {images.map((im, i) => (
            <li
              key={im.key}
              draggable
              onDragStart={() => setDragKey(im.key)}
              onDragEnd={() => setDragKey(null)}
              onDragOver={(e) => {
                if (dragKey) e.preventDefault();
              }}
              onDrop={(e) => {
                if (!dragKey) return;
                e.preventDefault();
                move(images.findIndex((x) => x.key === dragKey), i);
                setDragKey(null);
              }}
              className={cx("overflow-hidden rounded-lg border bg-white", dragKey === im.key ? "opacity-40" : "", i === 0 ? "border-ink" : "border-black/10")}
            >
              <div className="relative aspect-[4/5] cursor-grab bg-bone active:cursor-grabbing">
                <CatalogImage src={im.url} alt={im.alt} fill sizes="200px" className="object-cover" />
                {i === 0 && <span className="absolute top-1.5 left-1.5 rounded bg-ink px-1.5 py-0.5 text-[10px] text-white">Main image</span>}
                <button type="button" onClick={() => onChange(images.filter((x) => x.key !== im.key))} className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-white/90 hover:bg-white" aria-label={`Remove image ${i + 1}`}>
                  <CloseIcon size={14} />
                </button>
              </div>
              <div className="grid gap-1.5 p-2">
                <input aria-label={`Alt text for image ${i + 1}`} placeholder="Alt text (describe the image)" value={im.alt} onChange={(e) => update(im.key, { alt: e.target.value })} className="h-8 rounded border border-black/10 px-2 text-xs" />
                {colors.length > 0 && (
                  <select aria-label={`Colour for image ${i + 1}`} value={im.color ?? ""} onChange={(e) => update(im.key, { color: e.target.value || null })} className="h-8 rounded border border-black/10 px-1.5 text-xs">
                    <option value="">All colours</option>
                    {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="grid size-7 place-items-center rounded border border-black/10 disabled:opacity-30" aria-label="Move earlier"><ChevronLeft size={14} /></button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === images.length - 1} className="grid size-7 place-items-center rounded border border-black/10 disabled:opacity-30" aria-label="Move later"><ChevronRight size={14} /></button>
                  </div>
                  {i > 0 && <button type="button" onClick={() => move(i, 0)} className="underline">Make main</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One image (logo, banner, tile) with upload, replace and remove. */
export function SingleImageField({ label, value, onChange, folder, aspect = "aspect-[16/9]" }: { label: string; value: string | null; onChange: (url: string | null) => void; folder: string; aspect?: string }) {
  const store = useAdminStore();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ progress?: number; error?: string }>({});
  const pick = async (file: File) => {
    setState({ progress: 0 });
    try {
      const prepared = await prepareImage(file, 2400);
      const { url } = await uploadFile(datedPath(store.id, folder, file.name, prepared.ext), prepared.blob, prepared.type, (f) => setState({ progress: f }));
      onChange(url);
      setState({});
    } catch (e) {
      setState({ error: (e as Error).message });
    }
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-taupe">{label}</span>
      <div className={cx("relative overflow-hidden rounded-lg border border-black/10 bg-bone", aspect)}>
        {value ? <CatalogImage src={value} alt="" fill sizes="400px" className="object-cover" /> : <span className="absolute inset-0 grid place-items-center text-xs text-stone">No image</span>}
        {state.progress !== undefined && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/10"><span className="block h-1 bg-ink" style={{ width: `${state.progress * 100}%` }} /></span>
        )}
      </div>
      <div className="flex gap-3 text-xs">
        <button type="button" className="underline" onClick={() => input.current?.click()}>{value ? "Replace" : "Upload"}</button>
        {value && <button type="button" className="text-red-700 underline" onClick={() => onChange(null)}>Remove</button>}
      </div>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ""; }} />
    </div>
  );
}
