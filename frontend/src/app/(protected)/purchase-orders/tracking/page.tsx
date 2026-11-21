import { redirect } from "next/navigation";

// BR-FF-41: the order list lives at /purchase-orders.
export default function PurchaseOrderTrackingPage() {
	redirect("/purchase-orders");
}
