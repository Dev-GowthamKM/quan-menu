import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TableCodes from "@/components/TableCodes";
import { UiProvider } from "@/components/Ui";
import { DEMO, SITE_URL } from "@/lib/config";
import { EXAMPLE_MENU } from "@/lib/demo";
import { EXAMPLE_CAFE } from "@/lib/demo-cafe";
import { uiLang } from "@/lib/server-ui";
import { supabasePublic } from "@/lib/supabase/public";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mã QR cho từng bàn · Quán", robots: { index: false, follow: false } };

/** The stall's name, for live menus only: a code for a draft would open "menu not found". */
async function stallName(slug: string): Promise<string | null> {
  if (slug === "demo") return EXAMPLE_MENU.name;
  if (slug === "demo-cafe") return EXAMPLE_CAFE.name;
  if (DEMO) return null;
  const { data, error } = await supabasePublic().from("stalls").select("name").eq("slug", slug).eq("published", true).maybeSingle();
  if (error) throw new Error(`Stall ${slug} could not be loaded: ${error.message}`);
  return data?.name ?? null;
}

/** A printable sheet with one QR code per table: each opens the menu with ?b=<table>. ?n= sets how many. */
export default async function TableCodesPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const name = await stallName(slug);
  if (!name) notFound();
  const count = Math.max(1, Math.min(60, Math.round(Number(sp.n)) || 8));
  return (
    <UiProvider lang={await uiLang()}>
      <TableCodes name={name} slug={slug} siteUrl={SITE_URL} count={count} />
    </UiProvider>
  );
}
