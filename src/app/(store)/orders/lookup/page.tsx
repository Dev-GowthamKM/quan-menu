import type { Metadata } from "next";
import AuthShell from "@/components/store/auth/AuthShell";
import LookupForm from "@/components/store/order/LookupForm";

export const metadata: Metadata = { title: "Track your order", description: "Check the status of your order with your order number and email." };

export default function LookupPage() {
  return (
    <AuthShell title="Track your order" subtitle="Enter your order number and the email you used at checkout.">
      <LookupForm />
    </AuthShell>
  );
}
