/**
 * fetch that gives up after `ms`. A slow or stuck Supabase call then fails fast
 * (the page treats it as "not signed in") instead of hanging the request until
 * Vercel kills it.
 */
export function timedFetch(ms: number): typeof fetch {
  return (input, init) => {
    const ctrl = new AbortController();
    const outer = init?.signal;
    if (outer) {
      if (outer.aborted) ctrl.abort(outer.reason);
      else outer.addEventListener("abort", () => ctrl.abort(outer.reason), { once: true });
    }
    // Left running on success: aborting a finished request does nothing.
    setTimeout(() => ctrl.abort(new Error(`Supabase did not answer within ${ms} ms`)), ms);
    return fetch(input, { ...init, signal: ctrl.signal });
  };
}
