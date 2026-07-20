import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	employees: {
		employeeCreatedBy: r.one.employees({
			from: r.employees.createdBy,
			to: r.employees.id,
			alias: "employees_createdBy_employees_id"
		}),
		employeesCreatedBy: r.many.employees({
			alias: "employees_createdBy_employees_id"
		}),
		employeeLastUpdatedBy: r.one.employees({
			from: r.employees.lastUpdatedBy,
			to: r.employees.id,
			alias: "employees_lastUpdatedBy_employees_id"
		}),
		employeesLastUpdatedBy: r.many.employees({
			alias: "employees_lastUpdatedBy_employees_id"
		}),
		role: r.one.roles({
			from: r.employees.roleId,
			to: r.roles.id,
			alias: "employees_roleId_roles_id"
		}),
		modules: r.many.modules({
			from: r.employees.id.through(r.pages.createdBy),
			to: r.modules.id.through(r.pages.moduleId)
		}),
		purchaseOrders: r.many.purchaseOrders(),
		roles: r.many.roles({
			alias: "roles_createdBy_employees_id"
		}),
	},
	roles: {
		employees: r.many.employees({
			alias: "employees_roleId_roles_id"
		}),
		pages: r.many.pages(),
		employee: r.one.employees({
			from: r.roles.createdBy,
			to: r.employees.id,
			alias: "roles_createdBy_employees_id"
		}),
	},
	grn: {
		purchaseOrder: r.one.purchaseOrders({
			from: r.grn.poId,
			to: r.purchaseOrders.id
		}),
	},
	purchaseOrders: {
		grns: r.many.grn(),
		employee: r.one.employees({
			from: r.purchaseOrders.createdBy,
			to: r.employees.id
		}),
		vendorBills: r.many.vendorBills(),
	},
	modules: {
		employees: r.many.employees(),
	},
	pages: {
		roles: r.many.roles({
			from: r.pages.id.through(r.rolePages.pageId),
			to: r.roles.id.through(r.rolePages.roleId)
		}),
	},
	vendorBills: {
		purchaseOrder: r.one.purchaseOrders({
			from: r.vendorBills.poId,
			to: r.purchaseOrders.id
		}),
	},
}))