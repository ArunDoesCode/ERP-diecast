# Report 39 — security-auditor, suppliers (saved by coordinator)
FINDINGS: 0 blocker, 0 major, 2 minor
| SEC-40 | minor | backend | supplier.types.ts optText/nameField/emailField/supplierSku | free-text fields unbounded → multi-MB values stored and echoed in lists/history | .max(): name 200, email 254, phone 30, address 500, sku 100 |
| SEC-41 | minor | backend | supplier.types.ts qtyField | qty has no upper bound (1e300 accepted) | .max(1e9) |
Checked clean: authz on all 11 routes; IDOR (rows scoped by supplierId); validation; injection (sortBy enum, q escaped); data exposure (fixed messages, failed rows stripped, history shows name only); audit rows in the same tx; no deps/secrets; no dangerouslySetInnerHTML.
