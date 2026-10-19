import type { Metadata } from "next";
import AccountNav from "@/components/store/account/AccountNav";
import { requireCustomerPage } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My account", robots: { index: false, follow: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCustomerPage("/account");
  const name = (user.user_metadata?.full_name as string) || user.email || "";
  return (
    <div className="container-page py-10 md:py-14">
      <p className="label-caps text-stone">My account</p>
      <h1 className="mt-2 font-serif text-4xl md:text-5xl">Hello{name ? `, ${name.split(" ")[0].split("@")[0]}` : ""}</h1>
      <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-16">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
