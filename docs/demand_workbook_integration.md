# Importing demand forecast workbooks

## What this feature does

The Forward MRP Plan can import a changing `.xlsx` demand workbook. The importer reads worksheet names and column headings, lets the planner choose the worksheet and map source fields, then saves one worksheet as one named demand scenario. It keeps source dimensions such as Sold To, Ship To, customer names, material groups, sales groups, and segments so planners can filter them later.

MRP uses one selected forecast scenario per run. It never adds System Forecast, Consensus, and Custom Forecast together. Actual and Previous Year sheets can be imported for reference, but cannot be selected as MRP demand.

## Workbook layout supported

- Excel `.xlsx` workbooks, up to 30 MB.
- One row per plant and product, with forecast periods arranged as columns (wide layout). Monthly columns can be date cells or recognizable date/month labels. Weekly columns can be dates or ISO week labels such as `2026-W42`.
- The header row can vary. The importer scans the first rows for likely plant, material/product, and period columns; the user can correct the header row and field selections.
- One worksheet is imported at a time. Repeat the import for each scenario sheet.
- Quantity cells must contain plain numbers. Forecast quantities cannot be negative. Historical actual/reference sheets can contain negative adjustments.

The importer maps the source Plant and Material/Product values to records already in MRP Portal. Codes that match are suggested automatically, including values with leading zero differences. Every source code must be mapped before import. A source product must correspond to a finished good in each selected plant; product codes that do not exist in Master Data must be added there first.

## Import steps

1. Open **Forward MRP Plan** and choose **Import demand workbook**.
2. Select the workbook worksheet. Each tab is independent; choose one scenario tab such as Consensus FC or System FC.
3. Review the scenario name and scenario type. Mark Actual or Previous Year sheets as reference types.
4. Set the header row, period size, date order, plant column, product/material column, and forecast date columns. For dates like `01/10/2026`, choose DMY to mean 1 October or MDY to mean 10 January.
5. Expand the plant and product mapping sections. Match every source code to an existing portal code. If a code is missing, cancel and maintain the master data before importing.
6. Select **Import selected scenario**. The portal reports how many material-period records were saved.
7. Select the imported forecast from **Demand scenario**. Confirm the time bucket matches the data, choose the demand aggregation level, and apply any dimension filters such as Sold To, Ship To, Region, or Segment.
8. Set country, plant, horizon, and planning start, then click **Run MRP**. Review demand totals and time-phased material requirements.

## Dimensions and aggregation

Workbook columns other than the mapped plant, mapped product, and date columns are saved as dimensions. Their names are normalized (for example, `Ship To Name` becomes `ship_to_name`) while their values are retained.

Use **Ship To detail** when demand rows are customer delivery-point detail. Use **Sold To** when the source has Sold To summary rows; if only Ship To detail exists, the portal groups that detail under the selected Sold To filter. Use **Product total** to run the overall product demand. The planner should choose one level that represents the source data grain; parent and child customer totals must not be added together.

Dimension controls are generated from the selected scenario. Choosing a dimension value filters rows before aggregation. Leave a dimension at **All** to include all its values.

## How repeat imports work

The database stores each import as an immutable version. When an import repeats the same scenario name, worksheet, and scenario type, the prior version is marked inactive and the new import becomes the selectable version. Historical records remain in the database for audit and can be restored by a database administrator if needed.

## Important data checks

- The workbook should use the same unit for a given material and period. Convert mixed units before importing.
- The workbook Plant and Material/Product codes must resolve to active plant and finished-good master records.
- Period dates must parse as real dates. Monthly periods are normalized to the first of each month. Weekly dates retain their source date and are assigned to the matching weekly planning bucket.
- One MRP run uses one forecast scenario. The run keeps its selected scenario, filters, and aggregation level in the run inputs for traceability.
- The importer currently handles wide Excel worksheets. If a workbook is long-form (one row per period), reshape it to plant/product rows with date columns or add a dedicated long-form import mapping before use.

## If the import or calculation fails

- **No dated forecast columns found:** choose the correct header row, check the date-order option, and explicitly select period columns.
- **Unmapped codes:** add the corresponding plant or finished good in Master Data, then reopen the workbook import and map it.
- **Foreign-key or product mapping error:** verify that each mapped finished good belongs to the mapped plant.
- **No demand in the MRP run:** check selected country/plant, selected scenario, planning start, horizon, and whether source periods fall within that window.
- **Unexpectedly large or small demand:** verify the selected worksheet, aggregation level, dimension filters, units, and whether the workbook includes both parent and child customer records.

## Supported scenario types

| Type | Use in MRP | Typical example |
| --- | --- | --- |
| System forecast | Yes | `System FC - Volume` |
| Consensus forecast | Yes | `Consensus FC - Volume` |
| Custom forecast | Yes | Planner-adjusted forecast sheet |
| Actual | No, reference only | `Actual - Volume` |
| Previous year | No, reference only | `Previous Year - Volume` |

