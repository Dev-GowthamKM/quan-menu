import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/store/auth/AuthForms";
import AuthShell from "@/components/store/auth/AuthShell";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we'll send you a link to choose a new password.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
