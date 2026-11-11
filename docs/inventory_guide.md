# Inventory: screen, fields, data sources, and planning flow

This guide explains the Inventory page field by field, the database data behind it, what the upload does, and how inventory affects MRP. It also calls out controls that look operational but are currently demonstrations, so planners know which values they can rely on.

## 1. Purpose of Inventory

Inventory is the supply position for each **material at each plant**. MRP compares forecast-driven component requirements with opening stock and expected receipts. Incorrect stock, reservations, or receipt timing can therefore change suggested order quantities and dates.

Inventory is not the material catalog. Upload material definitions, units, costs, and default policies in **Master Data → Material master** first. Upload plant records in **Master Data → Plant master**, and optionally plant-specific stock rules in **Plant constraints**. Then load inventory for those plant/material pairs.

## 2. Tenant and page loading

The top-bar tenant selector determines which workspace's inventory the API reads and where a CSV import is written. The page requests `/api/inventory`; the server uses the selected tenant's database context and returns active materials paired with active plants. A plant with no inventory upload is still returned with stock values shown as zero. The API also accepts an optional `plantCode` query filter, although the current page does not expose a plant selector.

Treat displayed inventory as tenant data loaded from the database. If the request fails, the current page catches the error and displays an empty list, which can look like a tenant with no inventory; check the browser/network and server logs before concluding that the database is empty.

## 3. Page header and summary cards

| Label | Meaning and current behavior |
| --- | --- |
| **Inventory** | Page for reviewing material stock by plant. A displayed material code includes both material and plant, for example `PK-BAG-45 · P_VAL`. |
| **Search** | Filters the loaded list by displayed material/plant code, name, and category. It is a client-side text filter. |
| **Filters** | Currently shows a notification only; no filter panel or query is connected. |
| **Upload type: Inventory & stock** | Selects the inventory CSV importer. The picker is part of the shared upload control. |
| **Upload CSV** | Sends CSV content to `/api/import/csv` for the selected tenant. On success the page reloads inventory. It accepts `.csv`, not `.xlsx`, and the shared uploader limits files to 10 MB. |
| **Add Inventory** | Opens a sample form. The form submission updates local browser state only; it does not create a database record. Do not use it for a durable stock update. |
| **Total Items** | Count of API rows currently loaded. Because the API cross-joins active materials and plants, this can include a material/plant pair with no uploaded inventory row (zero stock). |
| **Total Inventory Value** | Sum of displayed stock value: current stock multiplied by material unit cost, across loaded rows. It is based on the API's material cost, not the price field in the local Add form. |
| **Low Stock Items** | Count of rows whose server-derived status is `Low Stock`. |
| **Out of Stock Items** | Count of rows whose server-derived status is `Out of Stock`. |
| **vs last month / change arrow** | Decorative sample comparison labels; no historical inventory comparison is calculated by this page. |

## 4. Tabs and inventory table

### Tabs

| Tab | Intended meaning | Current implementation |
| --- | --- | --- |
| **All Items** | All loaded material/plant rows. | Works. |
| **Low Stock** | Available quantity below the configured minimum. | Works as a filter over the API-derived `Low Stock` status. |
| **Out of Stock** | Zero current on-hand quantity. | Works as a filter. |
| **In Transit** | Materials with an inbound shipment not yet received. | Tab exists, but the API does not currently produce this status, so it normally shows no rows. The CSV transit quantity is still used by MRP. |
| **Reserved** | Stock set aside for orders or other demand. | Tab exists, but the API does not currently produce this status, so it normally shows no rows. Reserved quantity is stored and displayed but current forward MRP does not subtract it. |
| **Non-Moving** | Stock without recent movement. | Tab exists, but transaction history is not connected and the API does not produce this status. |

### Table columns

| Column | Meaning / source |
| --- | --- |
| Selection checkbox | Visual row-selection control only; no bulk action is connected. |
| **Material Code** | Material master `material_code`, combined with `plant_code` in the display code. The pair identifies the inventory record. |
| **Material Name** | Material master `description`. |
| **Category** | Material master `category` (for example Raw, Packing, Intermediate). |
| **Unit** | Material master `uom`. All inventory and BOM quantities must use compatible units. |
| **Current Stock** | Imported `on_hand_qty`, returned as `current_stock`. This is physical/opening on-hand stock. Missing inventory row is displayed as zero. |
| **Reserved** | Imported `reserved_qty`, returned as `reserved_stock`. It represents a quantity committed elsewhere. The displayed available stock subtracts this number, but current forward MRP calculation starts with on-hand and does not subtract reservations. |
| **Available Stock** | Page display calculation: `max(current stock − reserved, 0)`. This display calculation is not the current forward MRP netting balance. |
| **Min. Stock** | First available value in this precedence: plant constraint `min_stock_qty`, inventory `safety_stock_min`, material master `safety_stock_min`, otherwise zero. The UI labels this as a minimum stock level. |
| **Max. Stock** | First available value: plant constraint `max_storage_capacity`, inventory `max_capacity`, material master `max_capacity`, otherwise zero. MRP uses this as the capacity threshold. |
| **Last Receipt Date** | Currently mapped from `in_transit_due_date`. This is the expected date for the CSV's in-transit quantity, not a verified last-received transaction date. Blank date displays as an em dash. |
| **Inventory Value** | `current_stock × material unit_cost`, formatted with a rupee symbol. The current display hard-codes INR formatting even if tenant currency differs. |
| **Status** | API rule: on-hand = 0 → Out of Stock; else if on-hand minus reserved is below the selected minimum → Low Stock; otherwise In Stock. It does not currently check in-transit receipts for this badge. |
| **Actions** | Opens a notification only; no row-level persistent edit/delete operation is connected. |

The footer's result count reflects client-side filtered rows. Page-number buttons are visual only; the page currently loads all API rows and does not paginate server results.

## 5. Inventory CSV: required columns and exact meanings

Use **Upload type → Inventory & stock**. The file must have a header row and at least one data row. Required header names are exact:

`plant_code,material_code,on_hand_qty,reserved_qty,in_transit_qty,in_transit_due_date,scheduled_receipts_qty`

| CSV field | Required? | Meaning, validation, and use |
| --- | --- | --- |
| `plant_code` | Yes | Existing plant key from Plant master. Together with `material_code`, identifies one stock position. |
| `material_code` | Yes | Existing material key from Material master. Each row must refer to a known material. |
| `on_hand_qty` | Yes | Current physical stock quantity. Must be a number ≥ 0. |
| `reserved_qty` | Yes | Quantity already allocated. Must be a number ≥ 0 and cannot exceed `on_hand_qty`. It is reflected in the page's Available Stock, but is not deducted by current forward MRP. |
| `in_transit_qty` | Yes | Quantity already ordered/shipped and expected to arrive. Must be a number ≥ 0. |
| `in_transit_due_date` | Yes header; blank value allowed | Expected arrival date for the in-transit quantity, in ISO `YYYY-MM-DD` format when supplied. A blank date is allowed; the forward MRP engine treats undated transit as arriving in the first planning bucket. If quantity is zero, leave date blank or provide a valid date. |
| `scheduled_receipts_qty` | Yes | Quantity of other near-term/open scheduled receipts. Must be a number ≥ 0. Current schema stores one undated balance and MRP applies it in the first planning bucket. For later dated receipts, the database has a separate scheduled-receipt table, but this CSV importer does not populate it. |

### Example

```csv
plant_code,material_code,on_hand_qty,reserved_qty,in_transit_qty,in_transit_due_date,scheduled_receipts_qty
P_VAL,PK-BAG-45,12000,500,2000,2026-12-15,300
P_VAL,RM-CLINKER,800,0,0,,0
```

Use a comma-delimited UTF-8 CSV. Dates should be ISO `YYYY-MM-DD` regardless of the date style Excel displays. The header is mandatory even when the due-date cells are blank. Do not enter text such as `N/A` in numeric/date fields; leave an optional date cell empty. Rows must have the same number of columns as the header, and duplicate plant/material keys in one file are rejected.

## 6. What upload does to existing records

The server validates the full file and runs it in a database transaction. If any row fails, the import is rolled back. On success, each row is inserted or **updates** the existing inventory row for the same tenant + plant + material key. Uploading a second file for the same key replaces those inventory values; it does not append an inventory history record. The CSV does not create missing plants or materials. Upload those master records first.

Validation includes non-negative numeric quantities, `reserved_qty ≤ on_hand_qty`, valid ISO date format when supplied, unique plant/material pairs within the file, and valid foreign-key references. The database stores quantities with four decimal places. Check the upload success message and reload the Inventory list; if the upload returns an error, use its row number and field name to correct the file.

## 7. Add Inventory form and detail panel: what is real

### Add Inventory form

The form visually asks for Material Code, Material Name, Material Type, Category, Unit of Measure, Description, Opening Stock, Min/Max Stock Level, Safety Stock, Primary/Preferred Supplier, Last Purchase Price, Currency, Storage Location, Shelf/Bin, Lead Time, and Minimum Order Qty. These fields resemble a full stock-maintenance workflow, but **the current form is a local demo**. Submit adds a temporary item to browser state only. It does not validate against tenant masters, save supplier/location data, or update the inventory API. Save as Draft is also a notification-only action. Use CSV import for persisted inventory.

### Row detail modal and tabs

Click a row to open the detail modal. The headline code, category, name, current/available/reserved stock, inventory value, min/max, and receipt date are derived from the loaded API row. Some other details are placeholders:

| Detail label / tab | Current behavior |
| --- | --- |
| **Overview / Stock Details** | Displays a mixture of API values and fixed sample values. Safety Stock is hard-coded as `100 Kg`; Opening Stock is hard-coded as `200 Kg`; Last Issue Date is fixed. These are not database-backed transaction facts. |
| **Stock Transactions** | Tab title changes, but no transaction query is loaded. The Recent Transactions table is empty because the movement array is empty. |
| **Suppliers** | Placeholder tab; no supplier data is loaded into this modal. |
| **Purchase History** | Placeholder tab; no purchase history query is connected. |
| **Usage History** | Placeholder tab; no consumption history query is connected. |
| **Related Materials** | Placeholder tab; no relationship list is connected. |
| **Stock Movement (Last 6 Months)** | Static illustrative chart values, not actual receipts/issues. |
| **Status / Reorder Required / Lead Time** | Status is API-derived; reorder flag compares current on-hand with minimum only. Lead time is currently fixed at 10 days in this modal and does not display the MRP lead-time-buckets policy. |
| **Edit / row action / View All** | Notification-only actions; do not persist changes or retrieve transaction history. |

The form/detail design indicates future product scope. For current operations, rely on the tenant-backed list and CSV import, not on placeholder detail values.

## 8. How Inventory changes MRP

The MRP engine groups each inventory position by plant and material and processes receipts by planning bucket. Conceptually:

1. Start with `on_hand_qty` as projected stock.
2. Add gross material requirement for the bucket, calculated by exploding forecast through BOM and applying material scrap percentage.
3. Add `scheduled_receipts_qty` in the first bucket.
4. Add `in_transit_qty` in the bucket containing its due date; an undated transit quantity is applied in the first bucket.
5. Compare projected stock to the effective minimum/safety-stock value. A gap creates net requirement and a suggested planned order.
6. Use material/plant lead time, MOQ, and order multiple to determine release timing and order size; compare projected stock to capacity for alerts.

Important boundaries in the current implementation:

- `reserved_qty` is imported and displayed but is not subtracted from the forward MRP starting inventory.
- `reorder_level` is a separate planning field; it is not imported in this inventory CSV and does not drive the current forward MRP netting calculation.
- One `scheduled_receipts_qty` total has no receipt date, so it is assumed to be available in the first bucket.
- `in_transit_due_date` controls arrival timing in MRP but is mislabeled as Last Receipt Date in the inventory table.
- The inventory status badge checks on-hand/reserved/minimum only; it does not account for inbound stock.
- Inventory Value is an estimate from on-hand quantity × unit cost, not a finance ledger valuation.

## 9. Recommended operating sequence and verification

1. Select the correct tenant from the header and confirm its name.
2. Upload Plant master and Material master in **Master Data**. Upload Plant constraints if plant-specific minimums/capacity are needed.
3. Prepare one row per plant/material. Confirm codes match exactly and units match the material master and BOM.
4. Include all seven required CSV headers. Keep empty transit dates as empty cells, not omitted columns or `N/A`.
5. Upload via **Inventory → Upload type → Inventory & stock → Upload CSV**.
6. Confirm the success message reports the number of rows uploaded. For an error, correct the named row/column; imports are atomic, so a failed file should not partially update rows.
7. Search for a known material and plant. Check current stock, reserved, available, min/max, and stock status against the CSV and master values.
8. Run MRP with a matching demand scenario. Inspect the material plan's starting stock and receipt periods. Compare a simple case manually: opening stock + first-bucket scheduled receipt + due transit − gross requirement, then assess the safety-stock gap.
9. Do not use the demo Add form, movement chart, placeholder history tabs, or decorative month-over-month indicators as database validation.

For sample rows and end-to-end tenant setup see [Tenant validation guide](tenant_validation_guide.md). For the CSV field definitions that inventory depends on, see [Master Data guide](master_data_guide.md). For the full MRP calculation, see [Operational MRP workflow](mrp_operational_workflow.md).
