# Dashboard (Forward MRP Plan): field-by-field guide

This guide explains the Dashboard's Forward MRP Plan in everyday language: what to select, what each filter changes, how the charts and table should be read, what the planner can override, and which parts are stored in the tenant database. It describes the implementation in this project as it exists today.

## 1. What this page does

The page calculates a time-phased material plan for the currently selected tenant. It takes a demand forecast for finished goods, expands that demand through the Bill of Materials (BOM), and compares the resulting material needs with stock and incoming supply. It then recommends material orders by time bucket and highlights releases that need early attention or stock that exceeds capacity.

The output is a **planning recommendation**, not a purchase order, production order, supplier confirmation, or approval. Running MRP stores a run header and result rows in the current tenant database. Running it again creates another saved run; it does not overwrite the previous run.

## 2. What data feeds the plan

The run uses active tenant data from:

1. **Plant master**: active plants and their country.
2. **Material master**: item code, unit, cost, scrap percentage, safety stock, lead time, MOQ, order multiple, and default capacity.
3. **Finished goods**: active forecastable products and type.
4. **Bill of materials**: plant-specific recipe linking a finished good or MAKE material to component materials and quantities.
5. **Inventory**: opening on-hand, scheduled-receipt balance, in-transit quantity and due date.
6. **Plant constraints**: plant/material-specific minimum, capacity, MOQ, and lead-time overrides.
7. **Demand forecast**: either the tenant's regular weekly/monthly forecast table, or one chosen imported workbook scenario.

All reference codes must match. For example, a forecast's plant and finished-good codes must correspond to active records, and each BOM component must exist in the material master. The tenant selector in the global header scopes the options, forecast and saved run.

## 3. Header controls

| Label | Meaning and behavior |
| --- | --- |
| **Planning Workspace / MRP** | Section label identifying this page as the forward material planning workspace. |
| **Forward MRP Plan** | The page title. “Forward” means the calculation spans upcoming weekly or monthly periods. |
| **Scenario inputs** | Opens a what-if panel. Any forecast or on-hand quantity entered there overrides the saved input for this calculation only. It does not alter the uploaded forecast, inventory, or master records. The recalculation is saved as an MRP run like other runs. |
| **Run MRP** | Sends selected tenant, scenario, filters, horizon, buckets, and start date to the server. The server calculates, saves a run and its result rows in a transaction, then returns the results for charts and table. While running it shows **Calculating** and is disabled. |
| **Error panel / Retry** | Shows a returned validation/database/calculation error. Retry calls the run again with current controls. Correct missing masters, mismatched bucket types, or invalid selections before retrying. |
| **No forecast demand found** | Informational notice when demand total is zero inside the chosen date range and filters. Check the scenario, date, country, plant/product filters, mapping, and bucket type. A run may still return rows with zero demand. |

The page loads MRP choices and saved scenarios from the active tenant. It also automatically runs once after master-data options load if there is no result yet. Use **Run MRP** after changing planning controls to refresh the shown output; changing a filter alone does not automatically recalculate the current result.

## 4. Planning filters: every field

| Field | Plain-language meaning | Effect / notes |
| --- | --- | --- |
| **Demand scenario** | Which forecast version should drive this run. | `Existing demand forecast` reads ordinary uploaded weekly/monthly demand. Other choices are saved workbook imports and show scenario name/type, period grain, worksheet, and import time. Each upload is retained as a separate version. Actual and previous-year sheets are reference-only and cannot be selected as forecast. |
| **Refresh list** | Reloads available workbook scenario versions for the current tenant. | Use it after importing a scenario if the selector was already open or page stayed loaded. |
| **Demand aggregation** | Which customer hierarchy level to use when imported rows include multiple hierarchy levels. | Shown only for a saved scenario. Choices: Ship To detail, Sold To, Product total. It selects one level to avoid adding parent and child totals together. This is not a summation of all three levels. |
| **Scenario dimension filters** | Filters for workbook fields such as customer, channel, region, or other imported dimensions. | Shown only when scenario rows contain dimensions. `All` includes every value. Each selected dimension narrows matching rows before aggregation. Dimension names originate in the workbook and can vary. |
| **Country** | Country whose active plants are planned. | Country selection resets the plant selection to all plants in that country and clears the finished-good selection. Currency for cost charts is taken from the country configuration. |
| **Plant** | One or more sites within the country. | All plants is represented by no explicit plant restriction. Selecting plants limits demand and material planning to those plants. |
| **Product type** | Restricts demand-driving finished goods by type. | Current configured types are Bulk and Bagged. Empty/all means no type restriction. |
| **Finished good** | Restricts which forecasted parent products create component demand. | Options depend on selected country/plants and product type. Empty/all means all eligible finished goods. |
| **Material category** | Which result material classes to show and include in the spend/KPI rollups. | Current categories include Raw, Packing, and Intermediate. This is an output visibility filter: the engine calculates supply requirements, then filters visible result rows. Do not treat it as excluding components from BOM explosion. |
| **Material** | Which material result rows to show. | Options are active tenant materials. This filters visible result rows after calculation; it does not change the original finished-good forecast or its BOM arithmetic. |
| **Planning Horizon** | How far ahead the calculation extends. | 3, 6, or 12 months. With monthly buckets, those are 3/6/12 periods. With weekly buckets, the engine generates weekly periods until the chosen month horizon ends, so a 12-month view is about 52/53 buckets. |
| **Time buckets** | How the horizon is split into periods. | Monthly uses calendar months, starting on the first day of the selected month. Weekly uses consecutive 7-day buckets starting on the selected date (the UI does not force the date to Sunday). Imported scenario grain must match this selection. |
| **Planning start date** | First day from which demand and stock are projected. | The input hint says first day of planning window. Monthly runs normalize it to the first of that calendar month. Weekly runs start on the actual date entered. Forecast rows outside the date range are not included. |

### Workbook scenario notes

Workbook import is performed in **Demand Planning**, not from the Dashboard. The workbook reader lets the planner choose a worksheet and scenario name/type, map plant and product columns, choose weekly/monthly period columns, and map codes to the portal's plant and finished-good codes. Extra columns are stored as dimensions. Dashboard then runs one selected scenario version at a time.

`Actuals (reference only)` and `Previous year (reference only)` appear disabled in the selector because they are context for forecast comparison, not forecasts to consume. Scenario dimensions and customer aggregation are applied to imported scenario rows; the regular demand table does not have this workbook-level customer aggregation behavior.

## 5. Scenario inputs: what-if adjustments

| Field | Meaning |
| --- | --- |
| **Plant** | Plant for the temporary forecast/on-hand adjustment. The list is limited to plants selected in the main filters. |
| **Finished Good** | Finished good whose forecast quantity will be temporarily replaced in the chosen period. |
| **Forecast bucket** | Period in the current displayed horizon to which the temporary forecast applies. |
| **Override forecast quantity** | If filled, replaces the saved forecast quantity for that plant + finished good + bucket in this calculation. Zero is allowed. Blank means keep saved demand. |
| **Material** | Material whose opening on-hand value will be temporarily replaced. |
| **Override on-hand quantity** | If filled, replaces the saved on-hand value for that plant + material for this calculation. Zero is allowed. Blank means keep saved inventory. It does not change receipts/reserved quantities or write an inventory upload. |
| **Recalculate scenario** | Runs and saves a new calculation with these temporary overrides. |
| **Cancel / close** | Closes the panel without applying the what-if values. |

Overrides do not persist to Master Data, Inventory, or Demand Planning. A future run without the same override uses the stored forecast and stock again.

## 6. KPI cards

| KPI | What it tells you | How to interpret it carefully |
| --- | --- | --- |
| **Forecast Demand** | Total forecast quantity included in the run after selected country/plant, product and dimension choices. | The current screen appends “tons” regardless of the finished goods' actual unit. If products have mixed units or use each/kg, treat this label as a display limitation and check product UOMs. |
| **Planned Order Value** | Total suggested order quantity × material unit cost for visible planned-order rows. | It is an estimated value, grouped by configured country currency in the chart/control output. It is not a purchase order commitment. |
| **Raw / Packing Spend** | Planned order value split between materials categorized `Raw` and `Packing`. | Intermediate category is not part of these two amounts. Values reflect displayed/selected material rows. |
| **Expedite / Stockout Alerts** | Number of visible rows with a planned order whose release date is on or before the first bucket. | This is a release-timing alert count, not necessarily a confirmed physical stockout or a count of unique materials. Inspect the row and release date. |
| **Capacity Exceeded Buckets** | Count of visible material/time rows whose projected inventory exceeds configured capacity. | This counts material-period instances, not unique materials. Capacity alerts do not cap the planned order quantity. |

## 7. Charts and their labels

### Forward Procurement Projection

Shows the estimated planned procurement value by bucket. The bars are the sum of planned order quantity multiplied by unit cost for the selected currency. **Currency** chooses which configured currency to display. Horizontal labels are bucket periods. The y-axis is monetary value in that currency. A tall bar means more order value is planned in that period, not necessarily more physical units.

### Material Consumption & Planned Qty

Shows two quantities for the chosen material over time:

- **Gross material requirement**: material quantity needed before stock/inbound supply offsets it.
- **Planned order**: recommended replenishment quantity.

The **Material** selector changes which material is charted. The y-axis uses that material's unit of measure, such as ton, kg, or each. The chart tooltip reports the period, gross requirement, and planned quantity. A planned-order bar can be zero even when gross demand is positive if starting stock and receipts cover it.

### Plant Capacity Utilization

For up to eight visible plant/material groups that have a configured maximum, this shows peak projected stock divided by that material's capacity during the horizon. `100%` means at the limit or above it; a bar styled as exceeded means peak stock is greater than capacity. This is a peak inventory-to-capacity comparison, not factory production-line utilization. If no material capacity is configured, the page says no capacity limits are configured.

## 8. Time-Phased Material Plan: every column and row

Each main row is one **plant + material**. Expand the chevron to see the calculation components for each period.

| Column / value | Meaning |
| --- | --- |
| **Plant** | Site whose stock and demand are being planned. |
| **Material** | Material identifier. Chevron expands/collapses the bucket details. |
| **Description** | Readable name from Material master. |
| **Category** | Raw, Packing, Intermediate, etc., from Material master. |
| **On Hand** | Opening inventory quantity used at the start of the horizon. It is repeated for context and is not the closing balance for each future period. |
| **Min / Max** | Effective safety-stock minimum and capacity threshold. Minimum is a replenishment target; max is checked for an over-capacity alert. |
| **M0 / M+1 or W0 / W+1 ...** | Period index (`M` for month, `W` for week) and period start date. `W0` is first week, `W+1` next week. The number of visible buckets equals the output horizon/grain. |
| **Bold value in a bucket** | Projected inventory at the end of that bucket after demand, receipts, and the planned order are applied. |
| **+N order** | Suggested planned order quantity for that period. This quantity is already included in bold projected inventory; do not add it again. |
| **Expedite** | Planned order release date is on or before the first period's start. It means release needs attention by the beginning of this plan window, not necessarily that it is overdue today. |
| **Capacity** | Projected stock is greater than the configured capacity limit. |

Expanded detail rows:

| Detail row | Meaning |
| --- | --- |
| **Gross Requirements** | Total material consumption needed in the bucket after BOM explosion and material scrap. |
| **Scheduled Receipts** | Inbound supply assigned to the bucket, including inventory scheduled receipt balance (first bucket), transit due in the bucket, and any separately dated receipts loaded into the database. |
| **Net Requirements** | Shortfall between stock after demand/receipts and the effective minimum, before the new planned order. |
| **Projected Inventory** | End-of-bucket quantity after adding the planned order; matches the bold main-row value. |
| **Planned Order Release** | Suggested date to release the order after moving the need period earlier by lead-time buckets. |

Horizontal scroll reveals later buckets. An empty table can mean there is no eligible BOM demand for the horizon or that result filters exclude the materials; check inputs and the no-demand notice.

## 9. Calculation in plain language

For a finished good and bucket, gross component demand is:

```text
finished-good forecast quantity
  × BOM component quantity per finished good
  × (1 + material scrap percentage)
```

For a material and bucket:

```text
stock before planned order = prior projected stock + receipts - gross requirement
net requirement = max(0, minimum stock - stock before planned order)
planned order = 0 when net requirement is 0; otherwise max(net requirement, MOQ)
projected inventory = stock before planned order + planned order
release date = need bucket moved earlier by lead-time buckets
```

Starting projected stock is on-hand quantity. Current forward calculation does **not** subtract `reserved_qty`; although inventory shows and stores reserved stock, the MRP engine explicitly nets opening on-hand, receipts, gross demand, and the configured minimum. The current JavaScript forward engine also does not round planned orders to `order_multiple`, even though the value is stored in master data. The SQL planning procedure may have additional policy behavior, but this Dashboard calls the JavaScript forward calculation. Reorder level is stored but not used by this netting formula. Maximum capacity triggers an alert; it does not reduce the suggested order quantity.

## 10. Common field keys and data meaning

| Key | Plain-language meaning |
| --- | --- |
| `tenant_id` / tenant schema | Workspace boundary. Reads and saved run records belong to the selected tenant. |
| `country_code` | Country used to choose eligible active plants and currency. |
| `plant_code` | Site key used to join finished goods, BOM, inventory, and forecast. |
| `fg_code` | Finished-good key whose forecast is exploded through BOM. |
| `material_code` | Component/item key for inventory and replenishment. |
| `bucket_date` | Start date identifying a weekly or monthly demand/result bucket. |
| `forecast_qty` | Demand quantity for a finished good and bucket. |
| `ratio` / `quantity_per_fg` | Component material quantity required for one unit of parent finished good. |
| `scrap_pct` | Fractional loss applied to component consumption; e.g. 0.02 adds 2%. |
| `on_hand_qty` | Opening physical inventory. |
| `scheduled_receipts` | Undated opening inbound quantity, applied in first bucket. |
| `in_transit_qty` + `in_transit_due_date` | Inbound quantity and its expected planning bucket; blank date is treated as first bucket. |
| `min_stock_qty` / `safety_stock_min` | Stock floor the calculation aims to retain. Plant constraint takes precedence where supplied. |
| `max_storage_capacity` / `max_capacity` | Limit used to flag projected inventory above storage capacity. |
| `lead_time_buckets` | Number of weekly/monthly periods to move release date earlier. Plant constraint overrides material default. |
| `moq` | Minimum suggested order when any net requirement exists. |
| `unit_cost` | Unit value used to estimate procurement spend. |
| `run_id` | Unique identifier of the saved MRP calculation. Each run is recorded separately. |

## 11. Upload-to-decision workflow

1. Select and verify tenant in the global header.
2. Upload active Plant master, Material master, Finished goods, complete BOM, and applicable Plant constraints.
3. Upload tenant Inventory & stock.
4. Upload weekly/monthly demand CSV, or import a workbook scenario from Demand Planning.
5. On Dashboard, select the scenario (if using an imported workbook), aggregation level and any customer/dimension filters.
6. Choose country, plant, product type, finished goods, material/category, horizon, period grain, and start date.
7. Click **Run MRP** and resolve any validation message.
8. Review forecast demand, planned order value, alerts, charts, and material-period table.
9. Expand unusual order/expedite/capacity rows and check gross need, receipts, net requirement, projected stock, and release date.
10. Validate recommendations with the planning owner before creating real purchase/production orders in the normal approval workflow.

For definitions of the underlying master fields use [Master Data guide](master_data_guide.md). For stock upload fields use [Inventory guide](inventory_guide.md). For deeper interpretation of bucket cells, use [Time-Phased Material Plan guide](time_phased_material_plan_guide.md). For workbook mapping and scenario types, use [Demand workbook integration guide](demand_workbook_integration.md).
