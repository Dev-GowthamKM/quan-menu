// Copies the free, open-source OCR engine (Tesseract) and its Vietnamese data into public/ocr,
// so menu photos can be read in the vendor's browser without any paid API or outside CDN.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));
const out = join(process.cwd(), "public", "ocr");
mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

copyFileSync(join(pkgDir("tesseract.js"), "dist", "worker.min.js"), join(out, "worker.min.js"));
const core = pkgDir("tesseract.js-core");
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]) {
  copyFileSync(join(core, f), join(out, "core", f));
}
copyFileSync(join(pkgDir("@tesseract.js-data/vie"), "4.0.0_best_int", "vie.traineddata.gz"), join(out, "lang", "vie.traineddata.gz"));
console.log("OCR files copied to public/ocr");
