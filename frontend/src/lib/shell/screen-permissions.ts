/** Permission that opens a screen, by route prefix (longest prefix wins). Used only to name the missing key on the denied page. */
const SCREEN_PERMISSIONS: [string, string][] = [
	["/supplier-ratings", "supplier.rating.view"],
	["/delivery-notes/new", "dispatch.manage"],
	["/delivery-notes", "dispatch.view"],
	["/sale-orders", "so.view"],
	["/rfq", "rfq.view"],
	["/rate-contracts", "contract.view"],
	["/supplier-invoices", "invoice.view"],
	["/purchase-returns", "purchase_return.view"],
	["/inventory/stock-transfers", "stock_transfer.manage"],
	["/inventory", "inventory.view"],
	["/grn", "grn.view"],
	["/subcontracting", "sco.view"],
	["/purchase-orders", "po.manage"],
	["/bom", "bom.manage"],
];

export function permissionForPath(path: string): string | undefined {
	return SCREEN_PERMISSIONS.find(
		([prefix]) => path === prefix || path.startsWith(`${prefix}/`),
	)?.[1];
}
