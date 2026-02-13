# UAT Report: Inventory & Invoicing System
**Date:** 2026-02-13
**Reviewer:** Claw (AI)
**Scope:** Inventory integrity across all invoice lifecycle events

---

## 🔴 CRITICAL ISSUES

### 1. Missing `inventoryAvailabilityService.js` — APP WILL CRASH
**Files affected:** `assetController.js`, `invoiceController.js`

Both controllers import from `../services/inventoryAvailabilityService` but **this file does not exist** in the repo. This means the app will crash on:
- Deleting an asset (`getReservedQuantity`)
- Bulk deleting assets (`computeBulkAvailability`)
- Permanent deleting assets (`computeBulkAvailability`)
- **Adding items to invoices** (`computeAvailability`, `checkAndReserve`)

This is the most critical blocker. The add-to-invoice flow is completely broken without this service.

**Fix needed:** Create `backend/services/inventoryAvailabilityService.js` that exports:
- `getReservedQuantity(assetId)` — returns sum of qty on active (non-CANCELLED, non-PAID) non-voided invoice items
- `computeAvailability(assetId, { transaction })` — returns `{ available, asset }` with SELECT FOR UPDATE locking
- `computeBulkAvailability(assetIds)` — returns Map of assetId → `{ reserved }` 
- `checkAndReserve` (imported but may not be used)

---

### 2. Double Quantity Restoration on Payment Void After Partial Return
**Files affected:** `invoiceController.js` (voidTransaction, createTransaction)

**Scenario:**
1. Invoice has Item A (qty: 5) → PAID → `asset.quantity -= 5`
2. Return 2 units of Item A → `asset.quantity += 2` (return flow)
3. Refund recorded for the 2 returned items
4. Now void the ORIGINAL payment → invoice goes PAID → non-PAID
5. Code runs: `item.asset.quantity += item.quantity` (adds back **5**, not 3)
6. **Result:** Inventory is inflated by 2 — the returned units get double-counted

**Root cause:** The PAID→non-PAID restoration in `voidTransaction` and `createTransaction` uses `item.quantity` instead of `item.quantity - item.quantity_returned_total`.

**Fix:**
```javascript
// In both voidTransaction and createTransaction PAID→non-PAID blocks:
if (item.asset && !item.voided_at) {
  const unreturned = item.quantity - (item.quantity_returned_total || 0);
  item.asset.quantity += unreturned;  // Only restore what hasn't been returned
  await item.asset.save({ transaction: dbTransaction });
  await item.asset.updateComputedStatus(dbTransaction);
}
```

---

### 3. Inconsistent `recalculateInvoiceTotals` — Two Different Implementations
**Files affected:** `invoiceController.js`, `returnController.js`

The return controller's version includes `CustomerCreditApplication` in the net paid calculation. The invoice controller's version does **not**. This means:

- If a customer has store credit applied to an invoice, and then a payment is recorded via `createTransaction`, the invoice totals will be calculated **without** considering the credit — potentially marking an invoice as UNPAID when it should be PARTIALLY_PAID.

**Fix:** Extract into a shared utility or ensure both implementations are identical.

---

## 🟡 MEDIUM ISSUES

### 4. No Available Quantity Check on Invoice Item Quantity Increment
When adding an item that already exists on the invoice, the code increments `existingItem.quantity += quantity`. The availability check runs against `available` (which accounts for existing reservations), but the check `quantity > available` only validates the **additional** quantity being added, which is correct. ✅ (This is actually fine on review.)

### 5. `addItem` Blocks Adding to PARTIALLY_PAID Invoices
The check `['PAID', 'PARTIALLY_PAID', 'CANCELLED'].includes(invoice.status)` prevents adding items to partially paid invoices. This might be intentional, but it means:
- If a customer is paying in installments and wants to add another item, you can't do it without voiding the payment first.
- Consider whether this is desired business behavior.

### 6. Invoice Cancel Doesn't Adjust `quantity` for UNPAID Invoices
When cancelling an UNPAID invoice with items on it, the code calls `updateComputedStatus` which correctly removes "Processing" status. However, `asset.quantity` is never explicitly touched. This is **correct** because for non-PAID invoices, `quantity` (on-hand) was never decremented — the reservation was virtual (tracked via invoice_items). ✅

### 7. `computeStatus` Could Return Wrong Status After Return
The `computeStatus` method checks for items on PAID invoices where `quantity > quantity_returned_total`. After a full return, this correctly excludes fully-returned items. However, if a partial return happens, the asset will still show as "Sold" even though some units are back in stock. This is a display issue — the actual `quantity` field is correct.

---

## 🟢 WHAT'S WORKING WELL

### Correct Inventory Flow (when service file exists):
| Event | Quantity Change | Status Change |
|-------|----------------|---------------|
| Add item to invoice | No change (virtual reservation via invoice_items) | → Processing |
| Remove item from invoice | No change | → In Stock |
| Invoice PAID | `quantity -= item.qty` | → Sold |
| Payment voided (PAID→non-PAID) | `quantity += item.qty` ⚠️ (needs return-awareness fix) | → Processing/In Stock |
| Item voided on PAID invoice | `quantity += voidQty` | Recomputed |
| Invoice cancelled | No qty change (correct) | → In Stock |
| Return finalized | `quantity += returnQty` | Recomputed |

### Good Patterns:
- **Transaction-based operations** — all critical paths use DB transactions with rollback
- **Audit trail** — InventoryItemEvent logs every state change
- **Soft deletes** — assets use paranoid mode, invoices have is_deleted flag
- **Reservation is virtual** — computed from invoice_items, not a mutable counter (reduces race conditions)
- **Void pattern** — voided items/payments are soft-deleted with reason tracking
- **beforeSave hooks** — InvoiceItem recalculates line totals automatically
- **Return flow** — well-implemented with store credit, exchange, and refund paths

---

## 📋 RECOMMENDED PRIORITY

1. **Create `inventoryAvailabilityService.js`** — App literally cannot function without it
2. **Fix double-restore on payment void after return** — Data integrity risk
3. **Unify `recalculateInvoiceTotals`** — Correctness issue with store credits
4. **Add integration tests** for the full lifecycle: create invoice → add items → pay → partial return → void payment → verify quantities

---

## Stock Taking Feature (Future)
Based on the current architecture, a Stock Taking feature would:
1. Create a "count session" with expected quantities per asset (from `asset.quantity`)
2. User scans/counts physical items, enters actual count
3. Compare actual vs. system: generate discrepancy report
4. Allow adjustments (with audit trail via InventoryItemEvent)
5. Key query: `assets WHERE status IN ('In Stock', 'Processing') AND deleted_at IS NULL`

The foundation is solid for this — you already have asset_tag for scanning, quantity tracking, and the event logging system.
