"use client";

/**
 * Free menu reading in the vendor's browser with Tesseract (open source). The engine and its
 * Vietnamese data are served from this site (public/ocr, copied by scripts/copy-ocr.mjs), so there
 * is no API key, no per-photo cost, and the photo never leaves the phone.
 */
export type OcrStage = "load" | "read";

/** Large phone photos are scaled down to ~2400px; the reader is slower and no more accurate above that. */
async function prepare(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export async function readMenuPhoto(file: File, onProgress: (stage: OcrStage, pct: number) => void): Promise<string> {
  const canvas = await prepare(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("vie", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    gzip: true,
    logger: (m: { status: string; progress: number }) =>
      onProgress(m.status === "recognizing text" ? "read" : "load", Math.round((m.progress || 0) * 100)),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
