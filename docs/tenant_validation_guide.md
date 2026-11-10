# New tenant MRP validation guide

Use this guide to create an isolated sample tenant, load its master and operating data, import three demand scenarios, and verify a 12-month MRP run. All quantities and customer names in this pack are synthetic.

## Sample files

Files are in `database/sample-data/tenant-validation/`.

| File | Portal page and upload type | Data included |
| --- | --- | --- |
| `01_plant_master.csv` | Master Data / Plant master | Morocco plant `P_VAL` |
| `02_material_master.csv` | Master Data / Material master | 5 raw and packaging materials, units, costs, lead times, order multiples, and capacities |
| `03_finished_goods.csv` | Master Data / Finished goods | 3 products: bulk, 50 kg bagged, and 45 kg bagged cement |
| `04_plant_constraints.csv` | Master Data / Plant constraints | Minimum/reorder stock, maximum capacity, lead times, MOQ, and order multiples for each material |
| `05_bom.csv` | Master Data / Bill of materials | 11 component rows defining the three product recipes |
| `06_inventory.csv` | Inventory / Inventory & stock | Opening stock for five materials and four dated inbound receipts |
| `07_demand_monthly_12m.csv` | Demand Planning / Monthly demand forecast | 36 monthly rows (3 products x 12 months), Nov 2026-Oct 2027 |
| `08_demand_scenario_workbook_12m.xlsx` | Demand Planning / Import demand workbook | Three worksheets (System, Consensus, Custom); each has 6 customer/product rows and 12 months |

The plant, material, finished-good, BOM, inventory, and demand codes match across files. The workbook has Sold To, Ship To, Customer, and Channel dimensions. Its two customer rows per finished good are shares of the total, so do not import both customer detail and a separate parent total.

## 1. Create a clean tenant

Sign in with an administrator account. Open the tenant selector and choose **Add tenant**. For example:

- Tenant code: `val-mor`
- Tenant name: `Validation Morocco`

Select the new tenant. Confirm its name is visible in the header before uploading. Use a new empty tenant so codes do not conflict with existing records.

## 2. Upload master data in order

Open **Master Data**. Select the matching upload type for each file and upload one file at a time:

1. Plant master: `01_plant_master.csv`
2. Material master: `02_material_master.csv`
3. Finished goods: `03_finished_goods.csv`
4. Plant constraints: `04_plant_constraints.csv`
5. Bill of materials: `05_bom.csv`

Wait for a success message after each upload. This order matters because later records reference the plant, products, and materials created earlier.

## 3. Upload inventory and base demand

1. Open **Inventory**, choose **Inventory & stock**, and upload `06_inventory.csv`.
2. Open **Demand Planning**, choose **Monthly demand forecast**, and upload `07_demand_monthly_12m.csv`.

The inventory file contains 5 rows. Four materials have inbound quantities with due dates; the limestone row has zero in transit, so its due date is blank. The demand CSV should import 36 rows, covering 3 finished goods over 12 months from `2026-11-01` to `2027-10-01`.

## 4. Import all three workbook scenarios

On **Demand Planning**, choose **Import demand workbook**. Do not use **Upload CSV** for the Excel workbook. Import it three times, once per worksheet:

| Worksheet | Scenario type |
| --- | --- |
| `System Forecast` | System forecast |
| `Consensus Forecast` | Consensus forecast |
| `Custom Forecast` | Custom forecast |

For each import:

1. Select `08_demand_scenario_workbook_12m.xlsx` and the worksheet in the table.
2. Keep header row 1 and period size **Monthly**.
3. Confirm the portal finds plant code `P_VAL`, the matching `FG-CEM-*` product codes, and the 12 date columns from Nov 2026 through Oct 2027.
4. The preview should show 6 source rows and 12 period columns. Leave the customer fields as dimensions.
5. Click **Import selected scenario**. Expect 72 demand periods (6 rows x 12 months).

Each upload creates a separate saved version. Importing another scenario or reimporting a worksheet should append a new version; it should not replace previous imports.

## 5. Run 12-month MRP for each scenario

Open **Dashboard** and set:

- Demand scenario: choose **Existing demand forecast** first to check the base CSV, then choose each imported workbook scenario.
- Country: **Morocco (MAR)**.
- Plant: **P_VAL** (or **All plants**).
- Planning horizon: **12 months**.
- Time buckets: **Monthly**.
- Planning start date: **2026-11-01**.

**Where to find Demand aggregation:** first select one of the imported workbook scenarios in the **Demand scenario** dropdown. The **Demand aggregation** dropdown then appears immediately below it in the planning filters. It is hidden when **Existing demand forecast** is selected because that forecast has no workbook customer dimensions. Choose **Ship To detail** for this sample.

Click **Run MRP** once per scenario. The application runs one selected scenario at a time. If the scenario list does not update after import, use **Refresh list** beneath the selector.

## 6. What to verify

- The tenant header reads **Validation Morocco** during upload and while viewing results.
- Master Data contains one plant, five materials, three finished goods, five constraints, and 11 BOM rows.
- Inventory contains five material rows and the inbound quantities appear in their due months.
- Existing/base demand contains 36 monthly values. Each imported scenario contains 72 monthly customer-level values.
- The scenario selector lists System Forecast, Consensus Forecast, and Custom Forecast. All three should span Nov 2026-Oct 2027.
- The three scenario runs have different demand totals and, consequently, different planned orders. Consensus is higher than System; Custom follows a different monthly profile.
- Scenario dimensions include Sold To, Ship To, Customer, and Channel. The dimension filters should expose the sample customer values.
- The MRP output has 12 monthly buckets. On a narrow screen, scroll the table horizontally to see the later months.
- Reload Dashboard and confirm all scenario versions remain. Switch to another tenant and confirm its scenario list is separate; switch back to verify the validation tenant data is still present.

## Troubleshooting

**No scenarios in the Dashboard selector:** Confirm each worksheet import showed success, confirm the correct tenant is selected, then click **Refresh list**. If refresh reports an API error, inspect Render application logs for `/api/demand/scenario-import` or `/api/demand/scenarios`.

**Plant or product mapping is required:** Upload all five master files first. Confirm `P_VAL`, `FG-CEM-BULK`, `FG-CEM-50`, and `FG-CEM-45` exist in the selected tenant.

**No date columns detected:** Keep worksheet header row 1. Select the 12 month columns from Nov 2026 through Oct 2027 and set period size to Monthly.

**Only three months shown:** Set Planning Horizon to 12 months and Planning start date to `2026-11-01`. The sample forecast data spans 12 months. Charts may need horizontal scrolling depending on screen width.

**Duplicate key or missing reference error:** Use a clean tenant and upload in the order shown. Do not load this synthetic pack into a production tenant.

## Regenerate the pack

From the repository root, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate_tenant_validation_pack.ps1
```

This regenerates the CSV files and the three-worksheet Excel workbook.
