import Flyer from "@/components/Flyer";
import { UiProvider } from "@/components/Ui";
import { SITE_URL } from "@/lib/config";
import { uiLang } from "@/lib/server-ui";

export const metadata = { title: "Tờ rơi giới thiệu · Quán" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 60) : "");

/** A printable page to hand to stall owners. ?ten=…&sdt=… fills in the helper's name and phone. */
export default async function FlyerPage({ searchParams }: Search) {
  const sp = await searchParams;
  return (
    <UiProvider lang={await uiLang()}>
      <Flyer siteUrl={SITE_URL} name={one(sp.ten)} phone={one(sp.sdt)} />
    </UiProvider>
  );
}
