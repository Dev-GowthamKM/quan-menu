"use client";
import { CATALOG_BUCKET, storageUrl, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { supabaseBrowser } from "@/lib/supabase/client";

export const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const MAX_BYTES = 10 * 1024 * 1024;

export interface Prepared {
  blob: Blob;
  width: number;
  height: number;
  type: string;
  ext: string;
}

/**
 * Phone and camera photos are often 5-15 MB. Shrink to at most 2000px on the long side
 * and re-encode as WebP in the browser, so uploads are fast and pages stay light.
 */
export async function prepareImage(file: File, maxSide = 2000): Promise<Prepared> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} can't be read. Use JPEG, PNG or WebP (iPhone HEIC photos: export as JPEG first).`);
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (file.type === "image/gif" || (scale === 1 && file.size < 400_000 && ACCEPTED.includes(file.type))) {
    return { blob: file, width, height, type: file.type, ext: file.name.split(".").pop()?.toLowerCase() || "jpg" };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Couldn't convert ${file.name}.`))), "image/webp", 0.86),
  );
  if (blob.size > MAX_BYTES) throw new Error(`${file.name} is still over 10 MB after resizing.`);
  return { blob, width, height, type: "image/webp", ext: "webp" };
}

export function safeFileName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return base || "image";
}

/**
 * Uploads straight from the browser to Supabase Storage with the staff member's session,
 * reporting progress. Storage policies only let staff write to the catalog bucket.
 */
export async function uploadFile(path: string, blob: Blob, contentType: string, onProgress?: (fraction: number) => void, upsert = false) {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again.");
  const url = `${SUPABASE_URL}/storage/v1/object/${CATALOG_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Cache-Control", "max-age=31536000");
    xhr.setRequestHeader("x-upsert", upsert ? "true" : "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (/exists/i.test(body.message || body.error)) message = "A file with that name already exists.";
        else if (/row-level security|unauthorized/i.test(body.message || "")) message = "Your account can't upload images.";
        else if (body.message) message = body.message;
      } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(blob);
  });
  return { path, url: storageUrl(path) };
}

export function datedPath(folder: string, name: string, ext: string) {
  const d = new Date();
  return `${folder}/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${safeFileName(name)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/** The storage path of one of our uploaded files, from its public URL. */
export function pathFromUrl(url: string) {
  const marker = `/storage/v1/object/public/${CATALOG_BUCKET}/`;
  const i = url.indexOf(marker);
  return i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}
