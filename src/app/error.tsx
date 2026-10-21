"use client";
import { startTransition } from "react";
import { useRouter } from "next/navigation";

/** Shown instead of a blank screen when a page throws. Bilingual: tourists can land here too. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  // Errors usually come from the server (the database didn't answer), so fetch the page again before re-drawing it.
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <main className="page">
      <div className="card">
        <h1>Có lỗi xảy ra · Something went wrong</h1>
        <p>Hãy thử lại. Nếu vẫn lỗi, tải lại trang.</p>
        <p lang="en">Please try again. If it keeps happening, reload the page.</p>
        <div className="row">
          <button className="btn primary" onClick={retry}>Thử lại · Try again</button>
          <a className="btn" href="/">Trang chủ · Home</a>
        </div>
      </div>
    </main>
  );
}
