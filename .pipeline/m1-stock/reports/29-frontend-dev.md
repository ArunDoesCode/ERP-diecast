# Report 29 — frontend-dev
- CR-20: grn/queries.ts invalidateGrnAndPO now also invalidates assetKeys.stock().
- CR-21: asset/queries.ts — item create +stock; item update +movements; location create/update +stock +movements.
- SPEC-24: NOT done. `pr_estimate` lives in src/types/purchase-orders.ts:116 (LastRateSource) and
  src/components/views/purchase-orders/PurchaseOrderDetailView.tsx:1046 (label map) — both outside "May edit".
  Fix: rename to `item_average` in both (label e.g. "Item average").
- tsc + lint: see return.
