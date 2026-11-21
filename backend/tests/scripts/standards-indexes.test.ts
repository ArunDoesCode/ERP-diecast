/**
 * docs/specs/api-standards/spec.md (v1) BR-STD-22 (the 17 indexes of design/data.md exist by name with the
 * given columns) and the Money limit table (the 23 money columns are bigint).
 *
 * Reads the catalog of the test DB (`pg_indexes`, `information_schema`); it changes nothing. The test DB must be
 * migrated to the branch head (`bun run db:test:prepare` or `db:test:rebuild`).
 * Written by test-writer from the spec only.
 */
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "../../src/db/client";

// [index name, table, ordered columns] — design/data.md "New indexes (17)"
const INDEXES: [string, string, string[]][] = [
  [
    "idx_role_permissions_permission_key",
    "role_permissions",
    ["permission_key"],
  ],
  ["idx_refresh_tokens_employee_id", "refresh_tokens", ["employee_id"]],
  ["idx_sco_items_sco_id", "subcontracting_order_items", ["sco_id"]],
  ["idx_qa_tests_grn_item_id", "qa_tests", ["grn_item_id"]],
  ["idx_purchase_returns_po_id", "purchase_returns", ["po_id"]],
  ["idx_purchase_returns_supplier_id", "purchase_returns", ["supplier_id"]],
  ["idx_purchase_return_items_pro_id", "purchase_return_items", ["pro_id"]],
  ["idx_sinv_po_id", "supplier_invoices", ["po_id"]],
  [
    "idx_supplier_bank_details_supplier_id",
    "supplier_bank_details",
    ["supplier_id"],
  ],
  ["idx_supplier_payments_invoice_id", "supplier_payments", ["invoice_id"]],
  [
    "idx_inventory_ledger_reftype_id",
    "inventory_ledger",
    ["reference_type", "id"],
  ],
  ["idx_grns_status_id", "grns", ["status", "id"]],
  ["idx_approval_requests_policy_id", "approval_requests", ["policy_id"]],
  ["idx_sco_items_raw_item_id", "subcontracting_order_items", ["raw_item_id"]],
  ["idx_sco_items_service_id", "subcontracting_order_items", ["service_id"]],
  [
    "idx_sco_items_finished_item_id",
    "subcontracting_order_items",
    ["finished_item_id"],
  ],
  ["idx_sco_challan_lines_item_id", "sco_challan_lines", ["item_id"]],
];

// [table, column] — design/data.md "Stock and money": the 23 columns that were 32-bit
const MONEY_COLUMNS: [string, string][] = [
  ["purchase_requests", "estimated_amount_paise"],
  ["purchase_orders", "subtotal_paise"],
  ["purchase_orders", "tax_amount_paise"],
  ["purchase_orders", "total_amount_paise"],
  ["purchase_order_items", "unit_price_paise"],
  ["purchase_order_items", "line_value_paise"],
  ["purchase_order_items", "line_tax_paise"],
  ["subcontracting_orders", "subtotal_paise"],
  ["subcontracting_orders", "tax_amount_paise"],
  ["subcontracting_orders", "total_amount_paise"],
  ["subcontracting_order_items", "service_unit_price_paise"],
  ["sco_challans", "value_paise"],
  ["sco_challan_lines", "unit_issue_cost_paise"],
  ["supplier_invoices", "billed_amount_paise"],
  ["supplier_payments", "amount_paid_paise"],
  // purchase-returns data.md: debit_note_amount_paise moved to purchase_debit_notes
  ["purchase_debit_notes", "taxable_paise"],
  ["purchase_debit_notes", "total_paise"],
  ["purchase_debit_notes", "bill_offset_paise"],
  // supplier-invoice data.md: totals on the rebuilt supplier_invoices
  ["supplier_invoices", "total_paise"],
  ["supplier_invoices", "taxable_paise"],
  ["purchase_return_items", "unit_price_paise"],
  ["supplier_items", "supplier_unit_price_paise"],
  ["supplier_services", "service_unit_price_paise"],
  ["item_master", "average_cost_paise"],
  ["item_master", "standard_rate_paise"],
  ["inventory_ledger", "unit_cost_paise"],
  ["employees", "daily_rate_paise"],
];

async function indexDef(name: string): Promise<string | undefined> {
  const rows = (await db.execute(
    sql`select indexdef from pg_indexes where schemaname = 'public' and indexname = ${name}`,
  )) as unknown as { indexdef: string }[];
  return rows[0]?.indexdef;
}

describe("BR-STD-22 the 17 new indexes exist by name", () => {
  test("BR-STD-22 there are 17 distinct index names in the plan", () => {
    expect(new Set(INDEXES.map((i) => i[0])).size).toBe(17);
  });

  for (const [name, table, columns] of INDEXES) {
    test(`BR-STD-22 ${name} on ${table}(${columns.join(", ")})`, async () => {
      const def = await indexDef(name);
      expect(def).toBeDefined();
      expect(def).toContain(`ON public.${table} `);
      expect(def).toContain(`(${columns.join(", ")})`);
    });
  }
});

describe("BR-STD-39 the 23 money columns are 64-bit", () => {
  test("BR-STD-39 the plan lists 22 original money columns plus the reshaped ones", () => {
    expect(MONEY_COLUMNS.length).toBe(22 + 5);
  });

  for (const [table, column] of MONEY_COLUMNS) {
    test(`BR-STD-39 ${table}.${column} is bigint`, async () => {
      const rows = (await db.execute(
        sql`select data_type from information_schema.columns
            where table_schema = 'public' and table_name = ${table} and column_name = ${column}`,
      )) as unknown as { data_type: string }[];
      expect(rows[0]?.data_type).toBe("bigint");
    });
  }
});
