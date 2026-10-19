"use client";

/** Shown instead of a blank screen when a page throws. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container-page grid min-h-[60dvh] place-items-center py-24 text-center">
      <div className="max-w-md">
        <p className="label-caps text-stone">Something went wrong</p>
        <h1 className="mt-4 font-serif text-4xl">We couldn&apos;t load this page</h1>
        <p className="mt-4 text-taupe">Please try again. If it keeps happening, contact us{error.digest ? ` and mention reference ${error.digest}` : ""}.</p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={reset} className="inline-flex h-11 items-center bg-ink px-6 text-sm text-ivory hover:bg-ink/85">Try again</button>
          <a href="/" className="inline-flex h-11 items-center border border-ink px-6 text-sm hover:bg-ink hover:text-ivory">Home</a>
        </div>
      </div>
    </main>
  );
}
