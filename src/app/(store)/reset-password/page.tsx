import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/store/auth/AuthForms";
import AuthShell from "@/components/store/auth/AuthShell";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  // The emailed link signs the customer in first (via /auth/confirm or /auth/callback).
  if (!(await getUser())) redirect("/login?error=link");
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm />
    </AuthShell>
  );
}
