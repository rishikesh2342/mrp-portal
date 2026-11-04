# MRP Portal

## Free demo deployment

For a product-owner walkthrough, use the [Render + Supabase deployment guide](docs/free_demo_deployment.md). The deployment manifest is [`render.yaml`](render.yaml). Render serves both the built frontend and API; Supabase hosts PostgreSQL.

## PostgreSQL setup

The existing database shown in DBeaver is `postgres` on `localhost:5432`; this app uses schema `mrp`. The original MRP schema can remain in place. Apply the additive forward-planning migration once:

```bash
psql -h localhost -p 5432 -U postgres -d postgres -f database/002_forward_mrp.sql
```

Set `DATABASE_URL` in the root `.env` file. For the DBeaver connection shown, the shape is `postgresql://postgres:<password>@localhost:5432/postgres`. Keep the password in `.env`, not in source control. Install packages and launch the API and UI in separate terminals:

```bash
npm install
npm run api
```

```bash
npm run dev
```

Vite proxies `/api` calls to port 3001. Check the connection at `http://localhost:3001/api/health` and load the dashboard at the Vite URL printed by `npm run dev`.

## Training workbook mapping

- **Parameters:** set country/currency in `mrp.countries`; choose planning start, horizon, and bucket type in the dashboard.
- **Plant Master:** `mrp.plants`.
- **Material Master:** `mrp.material_master`. Store scrap as a fraction (`0.01` means 1%); category is `Raw`, `Packing`, or `Intermediate`. `supply_type='MAKE'` identifies intermediate materials whose BOM is recursively exploded.
- **FG Master:** `mrp.fg_master`, keyed by plant and finished-good code; Bulk/Bagged is `product_type`.
- **BOM Matrix:** `mrp.bom_matrix`. Set exactly one parent (`parent_fg_code` or `parent_material_code`) and one component `material_code`. Intermediate components can themselves be BOM parents, which enables multi-level explosion. Ratio units must be consistent with the workbook's UoM convention.
- **Demand Forecast:** `mrp.demand_forecast`, one row per plant, finished good, and bucket start date.
- **Opening inventory / capacity:** `mrp.inventory_on_hand`, one row per plant/material. `scheduled_receipts` is near-term inbound stock; use `mrp.scheduled_receipts` for dated future receipts. A plant-specific safety-stock or capacity value overrides the material-master default.
- **MRP history:** each calculation is saved to `mrp.mrp_runs` and `mrp.mrp_results`.

The migration creates structure only; it does not import the workbook's example values into your live database. Populate the master, BOM, forecast, and inventory tables before expecting requirements or orders.

## Cement sample data

To load a larger, illustrative cement dataset based on the workbook's Morocco / MAD setup, apply the sample seed after the migration:

```bash
psql -h localhost -p 5432 -U postgres -d postgres -f database/003_cement_sample_data.sql
```

The seed is repeatable and provides three plants, sixteen raw and packing materials, fifteen plant/product combinations across bulk and bagged cement grades, BOMs, opening stock, near-term receipts, and twelve rolling monthly forecast buckets. It includes clinker, gypsum, limestone, fly ash, slag, pozzolana, corrective minerals, 50 kg and 25 kg bags, bulk FIBCs, pallets, film, thread, and ink. Costs, stock policies, and forecasts are plausible demo values rather than supplier quotes or operating data. Forecasts start in the current calendar month and roll forward each time the seed is applied.

## Calculation and data flow

The dashboard reads filter choices from `/api/mrp/options`. A user run or scenario adjustment sends country(s), plant(s), horizon, bucket type, start date, and any temporary forecast/on-hand overrides to `POST /api/mrp/run`. The server loads forecast, BOM, material policy, inventory, and scheduled receipts from PostgreSQL; explodes FG and make-material BOMs; nets each material bucket against prior projected stock and receipts; raises stock to its safety minimum; rounds recommendations to MOQ/order multiple; offsets releases by lead-time buckets; and checks projected stock against capacity. The result and its inputs' run settings are committed to the run-history tables and returned to the dashboard. Scenario overrides are calculation-only and do not update master data.

Supported endpoints include `/api/health`, `/api/mrp/options`, `POST /api/mrp/run`, and `/api/mrp/runs/:runId`, as well as the earlier dashboard, inventory, supplier, and material-requirement endpoints.
