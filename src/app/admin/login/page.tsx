import { redirect } from "next/navigation";
import { LoginForm } from "@/components/store/auth/AuthForms";
import { getRole, getUser } from "@/lib/auth";
import { safeNext } from "@/lib/order-link";
import { formatIndianMobile } from "@/lib/phone";
import { signOut } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string; denied?: string }> }) {
  const sp = await searchParams;
  const [user, role] = await Promise.all([getUser(), getRole()]);
  if (user && role) redirect(safeNext(sp.next, "/admin"));
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-semibold tracking-[0.25em] uppercase">Store admin</p>
        <h1 className="mt-3 text-center text-2xl font-semibold">Sign in to manage the store</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
          {user && !role ? (
            <div className="grid gap-4 text-sm">
              <p>You&apos;re signed in as <b>{user.email || formatIndianMobile(user.phone)}</b>, which doesn&apos;t have staff access.</p>
              <p className="text-taupe">Ask the store owner to add you under Admin › Staff, then sign in again.</p>
              <form action={signOut}><button className="underline">Sign out</button></form>
            </div>
          ) : (
            <LoginForm next={safeNext(sp.next, "/admin")} admin notice={sp.denied ? "That account doesn't have staff access." : null} />
          )}
        </div>
        <p className="mt-6 text-center text-xs text-stone"><a href="/" className="underline">Back to the store</a></p>
      </div>
    </main>
  );
}
