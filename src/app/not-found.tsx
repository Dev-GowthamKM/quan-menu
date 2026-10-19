import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container-page grid min-h-[70dvh] place-items-center py-24 text-center">
      <div className="max-w-md">
        <p className="label-caps text-stone">Error 404</p>
        <h1 className="mt-4 font-serif text-5xl">This page has moved on</h1>
        <p className="mt-4 text-taupe">The page you were looking for doesn&apos;t exist, or the product is no longer available.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="inline-flex h-11 items-center bg-ink px-6 text-sm text-ivory hover:bg-ink/85">Shop the collection</Link>
          <Link href="/" className="inline-flex h-11 items-center border border-ink px-6 text-sm hover:bg-ink hover:text-ivory">Home</Link>
        </div>
      </div>
    </main>
  );
}
