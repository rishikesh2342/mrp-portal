# MRP sample data and operating workflow

## Files

The generated CSVs are in `database/sample-data/`:

| File | Grain / key | What it contains |
|---|---|---|
| `plant_master.csv` | `plant_code` | Ten demand locations inferred from SKU description suffixes |
| `material_master.csv` | `material_code` | Synthetic cement raw and packaging materials; cost/UOM/stock parameters |
| `fg_master.csv` | `(plant_code, fg_code)` | 65 workbook SKUs assigned to inferred locations |
| `demand_source_monthly.csv` | `(plant_code, fg_code, period_start)` | Source workbook monthly totals, including the blank actuals |
| `demand_allocation_detail.csv` | `(plant_code, fg_code, source_month, bucket_date)` | Unaggregated monthly-to-week allocation, for reconciliation |
| `demand_input.csv` | `(plant_code, fg_code, bucket_date)` | Weekly demand allocated from the source monthly totals |
| `inventory_input.csv` | `(plant_code, material_code, as_of_date)` | Synthetic opening stock, reservations, and in-transit examples |
| `plant_constraints.csv` | `(plant_code, material_code)` | Synthetic per-site stock limits, lead times, MOQ, and order multiples |
| `bom_input.csv` | `(plant_code, fg_code, component_material_code)` | Synthetic recipes and packaging usage |

The source workbook provides a month, SKU, description, Actual - Volume, and Consensus FC - Volume. Actual - Volume is blank. Its demand values cover November 2026 through January 2027. The source has no plant column, so the generator maps trailing location labels in descriptions to ten inferred sites. Confirm that mapping with the business before treating it as production master data. Quantities are assumed to be metric tonnes for finished goods and recipe mass components; packaging components use their own UOM. BOMs, inventory, constraints, costs, and plant names are dummy validation data, not workbook facts.

`demand_input.csv` allocates each source month across weekly buckets in proportion to overlapping calendar days, rounds to two decimals, and assigns the rounding remainder to the last overlapping week. The weekly totals therefore conserve each source month's forecast total within the source precision. The planning buckets begin on 2026-11-01 and the last bucket begins 2027-01-31. `source_months` retains provenance when one weekly bucket overlaps two source months.

To regenerate from the workbook:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate_sample_inputs.ps1 -WorkbookPath 'C:\Users\Rishi\Downloads\2026-10-01_demand_data.xlsx'
```

## Where data belongs in the portal

| Load | UI screen | Upload type |
|---|---|---|
| Plants, materials, finished goods, plant constraints, BOM | Master Data | Select the matching type in the Upload type dropdown |
| Demand forecast | Demand Planning | Weekly demand forecast |
| On hand, reserved, and in-transit stock | Inventory | Inventory & stock |
| Calculate and review plan | Dashboard, then Material Requirement | Run MRP on Dashboard; review persisted results on Material Requirement |

CSV upload is now wired through the portal API. On API startup, it applies the idempotent `database/006_operational_mrp_job.sql` extension when the base MRP table exists. The API database role therefore needs permission to alter/create these MRP objects. If the base schema is missing, apply `schema.sql` and `002_forward_mrp.sql` before starting the API. The upload endpoint accepts `.csv` files up to 10 MB and commits each upload as one transaction.

## Load order from the UI

1. Start the API (`npm run api`) and web app (`npm run dev`) after the base schema is installed. Wait for the API log `Operational MRP schema is ready.`
2. Open **Master Data**. Set Upload type to **Plant master** and upload `plant_master.csv`.
3. Upload `material_master.csv` as **Material master**.
4. Upload `fg_master.csv` as **Finished goods**.
5. Upload `plant_constraints.csv` as **Plant constraints**.
6. Upload `bom_input.csv` as **Bill of materials**.
7. Open **Inventory** and upload `inventory_input.csv` as **Inventory & stock**.
8. Open **Demand Planning** and upload `demand_input.csv` as **Weekly demand forecast**.
9. `demand_source_monthly.csv` and `demand_allocation_detail.csv` are traceability/reconciliation files and are not planning-table uploads. Actuals are blank; do not copy them as zero actuals.
10. Open **Dashboard**, run MRP for Morocco (MAR), start date 2026-11-01, weekly buckets, and a three-month horizon. Then open **Material Requirement** to review the calculated plan.

Each upload is independently transactional. The API upserts master, inventory, and demand rows by their natural keys. BOM upload replaces the BOM components only for the `(plant_code, fg_code)` pairs in that file. Reuploading one data file does not automatically reimport the other files.

The UI maps file columns automatically and reports a row or database reference error as a toast. Fix the CSV or upload the referenced master data first, then retry. The sample files include headers and provenance columns; the API ignores extra columns that are not used by the selected dataset.

## Upload validation rules

Reject an upload before committing if any of these checks fail:

- Required header names and types match the declared CSV; dates are ISO `YYYY-MM-DD`, numeric fields parse using `.` decimal, booleans are true/false.
- Primary keys are unique within the file; updates match the database natural keys listed above.
- Every plant, FG, and component reference exists and is active; every FG demand plant matches its FG master row.
- Quantities, costs, safety/reorder/min/max values, lead times, MOQ, and order multiples are nonnegative; demand and receipts cannot be negative. Scrap must satisfy `0 <= scrap_factor < 1`.
- UOMs agree along each BOM line. For bagged cement, bags per tonne are `1000 / bag_weight_kg`; do not load bag counts as tonnes.
- BOM has exactly one parent type, all effective date intervals are valid, and no component loop exists.
- Opening stock is as-of the planning start. Reserved stock cannot exceed physical on-hand unless the business permits negative available stock. An in-transit due date is recommended; when it is blank, the MRP engine treats the quantity as arriving in the first planning bucket. Use a dated receipt when its expected arrival period is known.
- Forecast bucket dates use the configured weekly/monthly cadence and have no duplicate plant/SKU/bucket. Workbook monthly totals must reconcile to the allocated weekly sum, including rounding.
- Reject missing required values, unexpected extra columns unless explicitly ignored as provenance, malformed SKU values, and values outside configured capacity. Warn rather than reject for orders below MOQ and forecasts with no BOM until corrected.

## Run the SQL MRP job

`database/006_operational_mrp_job.sql` defines a PostgreSQL procedure function that explodes active BOMs, applies component scrap using the workbook formula (usage × BOM ratio × (1 + scrap)), nets projected stock against demand and dated receipts, preserves the target stock level, sets replenishment to the greater of net requirement and MOQ, offsets releases by lead time, flags expedite/capacity conditions, and stores rows in `mrp.mrp_results`.

For the attached file's three months:

```sql
SELECT mrp.fn_run_three_month_mrp('MAR', DATE '2026-11-01', 'Weekly', 'demo');
```

Copy the returned UUID, then review:

```sql
SELECT plant_code, bucket_date, material_code, gross_req, scheduled_receipts,
       net_req, planned_orders, projected_inventory, order_release_date,
       expedite_now, capacity_exceeded_flag
FROM mrp.mrp_results
WHERE run_id = '<returned-uuid>'::uuid
ORDER BY plant_code, bucket_date, material_code;
```

The portal's JavaScript engine is also configured for a three-month horizon; weekly mode emits the 14 weekly bucket starts from 2026-11-01 through 2027-01-31. SQL results are persisted for the Material Requirement view.

## Test protocol and KPI monitoring

Run these checks for each sample load and after changing BOM, stock, or lead-time rules:

1. Reconcile source monthly demand to the sum of weekly buckets by plant/SKU/source month (tolerance 0.01 tonne).
2. Check referential integrity and duplicates for all natural keys; verify every demanded FG has an active BOM.
3. Hand-calculate one bulk SKU and one bagged SKU: demand × BOM ratio × (1 + scrap), then compare gross requirements with the run.
4. Exercise the included validation rows: low clinker at Settat, zero bag stock with a dated inbound at Bouskoura, and excess gypsum at Fes. Confirm replenishment, inbound timing, and no unnecessary order respectively.
5. Check projected inventory never goes below zero unless negative available stock is explicitly allowed; verify MOQ sizing, lead-time release dates, and capacity flags.
6. Rerun with unchanged inputs and compare result rows. Results should match apart from run ID/timestamps; importing the same CSV should update, not duplicate.

Monitor per run: forecast WAPE `SUM(ABS(actual-forecast))/NULLIF(SUM(actual),0)`, signed forecast bias `SUM(forecast-actual)/NULLIF(SUM(actual),0)`, count of below-safety-stock buckets, expedite-now orders, capacity exceptions, planned order value, and order quantity by material/UOM. Actuals are blank in the provided workbook, so forecast accuracy KPIs remain unavailable until actuals are loaded. OTIF and supplier lead-time adherence also require receipt confirmations and actual receipt dates, which are not in this data set.
