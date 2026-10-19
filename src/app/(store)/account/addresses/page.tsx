import AddressBook from "@/components/store/account/AddressBook";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AddressesPage() {
  const sb = await supabaseServer();
  const { data } = await sb.from("customer_addresses").select("*").order("is_default", { ascending: false }).order("created_at");
  return (
    <div>
      <h2 className="font-serif text-2xl">Addresses</h2>
      <AddressBook addresses={data ?? []} />
    </div>
  );
}
