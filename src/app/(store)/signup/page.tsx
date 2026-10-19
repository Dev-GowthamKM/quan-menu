import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignupForm } from "@/components/store/auth/AuthForms";
import AuthShell from "@/components/store/auth/AuthShell";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/order-link";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getUser()) redirect(next);
  return (
    <AuthShell title="Create an account" subtitle="Track orders, save addresses and keep a wishlist.">
      <SignupForm next={next} />
    </AuthShell>
  );
}
