import { SupplierDetailsView } from "@/components/views/suppliers/SupplierDetailsView";

type SupplierDetailsPageProps = {
  params: Promise<{ supplierId: string }>;
};

export default async function SupplierDetailsPage({
  params,
}: SupplierDetailsPageProps) {
  const resolved = await params;
  const supplierId = Number(resolved.supplierId);

  if (Number.isNaN(supplierId) || supplierId <= 0) {
    throw new Error("Invalid supplier id");
  }

  return <SupplierDetailsView supplierId={supplierId} />;
}
