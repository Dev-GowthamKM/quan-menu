import type { Metadata } from "next";
import ProductImport from "@/components/admin/products/ProductImport";
import { PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/lib/auth";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportProductsPage() {
  await requireStaffPage();
  return (
    <>
      <PageHeader
        title="Import products"
        back={{ href: "/admin/products", label: "Products" }}
        description="Add or update many products from a spreadsheet. Every file is checked first and nothing is saved until you choose to import."
      />
      <ProductImport />
    </>
  );
}
