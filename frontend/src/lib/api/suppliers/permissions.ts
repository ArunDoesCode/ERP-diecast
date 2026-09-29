// perm: supplier.manage — create/edit suppliers and price lists.
// Viewing (supplier.view) is open to the roles that can reach the screen.
const SUPPLIER_MANAGE_ROLES = ["super-admin", "back_office"];

export function canManageSuppliers(role?: string | null) {
	return !!role && SUPPLIER_MANAGE_ROLES.includes(role);
}
