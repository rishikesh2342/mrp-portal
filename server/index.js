import "dotenv/config";
import express from "express";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { calculateForwardMrp } from "./mrp-engine.js";
import { importCsv } from "./csv-import.js";
import { importDemandScenario } from "./scenario-demand-import.js";
import { bootstrapDefaultTenant, bootstrapPlatformAdmin, registerTenantAuth } from "./tenant-auth.js";
import { ensureTenantSchema, quoteTenantSchema } from "./tenant-schemas.js";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json({ limit: "32mb" }));

registerTenantAuth(app, pool);

app.post("/api/demand/scenario-import", async (req, res, next) => {
  try {
    const result = await importDemandScenario(pool, req.body || {}, req.tenant.tenant_id, req.tenant.schema_name);
    res.json(result);
  } catch (error) {
    if (error.code && !String(error.code).startsWith("23")) return next(error);
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/demand/scenarios", async (_req, res, next) => {
  try {
    const schema = quoteTenantSchema(_req.tenant.schema_name);
    const { rows } = await pool.query(`
      SELECT i.import_id, i.file_name, i.source_sheet, i.scenario_name,
        i.scenario_type, i.bucket_type, i.imported_at, i.imported_rows,
        MIN(f.bucket_date) AS first_bucket, MAX(f.bucket_date) AS last_bucket
      FROM ${schema}.demand_scenario_imports i
      LEFT JOIN ${schema}.demand_scenario_forecasts f USING (import_id)
      WHERE i.tenant_id=$1 AND i.is_active
      GROUP BY i.import_id
      ORDER BY i.imported_at DESC, i.scenario_name
    `, [(_req).tenant.tenant_id]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/demand/scenarios/:importId/dimensions", async (req, res, next) => {
  try {
    const schema = quoteTenantSchema(req.tenant.schema_name);
    const { rows } = await pool.query(`
      WITH dimension_values AS (
        SELECT d.key AS dimension_key, d.value AS dimension_value, COUNT(*)::int AS row_count
        FROM ${schema}.demand_scenario_forecasts f
        CROSS JOIN LATERAL jsonb_each_text(f.dimensions) d
        WHERE f.tenant_id=$1 AND f.import_id=$2
        GROUP BY d.key, d.value
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY dimension_key ORDER BY row_count DESC, dimension_value) AS rank
        FROM dimension_values
      )
      SELECT dimension_key, json_agg(json_build_object('value',dimension_value,'rows',row_count)
               ORDER BY row_count DESC,dimension_value) AS values
      FROM ranked WHERE rank <= 1000
      GROUP BY dimension_key ORDER BY dimension_key
    `, [req.tenant.tenant_id, req.params.importId]);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/import/csv", async (req, res, next) => {
  try {
    const result = await importCsv(pool, { ...(req.body || {}), tenantId: req.tenant.tenant_id, schemaName: req.tenant.schema_name });
    res.json(result);
  } catch (error) {
    if (error.code && !String(error.code).startsWith("23")) return next(error);
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ status: "error", message: "Database unavailable" });
  }
});

app.get("/api/dashboard", async (req, res, next) => {
  try {
    const schema = quoteTenantSchema(req.tenant.schema_name);
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT p.plant_code)::int AS active_plants,
        COUNT(DISTINCT i.material_code)::int AS inventory_materials,
        COALESCE(SUM(i.on_hand_qty),0) AS total_on_hand
       FROM ${schema}.plants p LEFT JOIN ${schema}.inventory_on_hand i
         ON i.tenant_id=p.tenant_id AND i.plant_code=p.plant_code
       WHERE p.tenant_id=$1 AND p.active_flag AND ($2::varchar IS NULL OR p.plant_code=$2)`,
      [req.tenant.tenant_id, req.query.plantId || null],
    );
    res.json(rows[0] ?? {});
  } catch (error) {
    next(error);
  }
});

app.get("/api/material-requirements", async (req, res, next) => {
  try {
    const schema = quoteTenantSchema(req.tenant.schema_name);
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const period = req.query.period ? `${req.query.period}-01` : null;
    const filters = [
      req.query.status || null,
      req.query.priority || null,
      period,
      req.query.product || null,
      req.query.material || null,
      limit,
      offset,
    ];

    // The forward MRP dashboard stores its calculated requirements in mrp_results.
    // Use the newest completed run so this page shows the same calculation.
    const [forwardRun, forward] = await Promise.all([
      pool.query(`SELECT EXISTS (
        SELECT 1 FROM ${schema}.mrp_runs r
        WHERE r.tenant_id=$1 AND EXISTS (SELECT 1 FROM ${schema}.mrp_results x WHERE x.tenant_id=$1 AND x.run_id=r.run_id)
      ) AS has_run`, [req.tenant.tenant_id]),
      pool.query(
      `WITH latest_run AS (
         SELECT run.run_id FROM ${schema}.mrp_runs AS run
         WHERE run.tenant_id=$8 AND EXISTS (SELECT 1 FROM ${schema}.mrp_results r WHERE r.tenant_id=$8 AND r.run_id=run.run_id)
         ORDER BY run.created_at DESC LIMIT 1
       ), requirement_rows AS (
         SELECT r.result_id AS requirement_id, r.run_id::text AS mrp_run_code,
           r.bucket_date AS period_date, r.material_code,
           m.description AS material_name,
           COALESCE((
             SELECT string_agg(DISTINCT b.parent_fg_code, ', ' ORDER BY b.parent_fg_code)
             FROM ${schema}.bom_matrix b
             WHERE b.tenant_id=$8 AND b.plant_code=r.plant_code AND b.material_code=r.material_code
               AND b.parent_fg_code IS NOT NULL AND b.active_flag
           ), 'N/A') AS product_code,
           r.gross_req AS required_qty,
           GREATEST(0, r.projected_inventory + r.gross_req - r.planned_orders - r.scheduled_receipts) AS available_qty,
           r.net_req AS net_requirement, r.planned_orders AS suggested_po_qty,
           CASE WHEN r.net_req <= 0 THEN 'Low'
                WHEN GREATEST(0, r.projected_inventory + r.gross_req - r.planned_orders - r.scheduled_receipts)
                     < COALESCE(i.safety_stock_min, m.safety_stock_min, 0) * 0.25 THEN 'High'
                ELSE 'Medium' END AS priority,
           CASE WHEN r.planned_orders > 0 THEN 'Planned' ELSE 'Open' END AS status
         FROM ${schema}.mrp_results r
         JOIN latest_run lr ON lr.run_id=r.run_id
         JOIN ${schema}.material_master m ON m.tenant_id=$8 AND m.material_code=r.material_code
         LEFT JOIN ${schema}.inventory_on_hand i ON i.tenant_id=$8 AND i.plant_code=r.plant_code AND i.material_code=r.material_code
         WHERE r.tenant_id=$8 AND (r.gross_req > 0 OR r.net_req > 0 OR r.planned_orders > 0)
       )
       SELECT * FROM requirement_rows
       WHERE ($1::varchar IS NULL OR status=$1)
         AND ($2::varchar IS NULL OR priority=$2)
         AND ($3::date IS NULL OR date_trunc('month',period_date)=date_trunc('month',$3::date))
         AND ($4::varchar IS NULL OR product_code ILIKE '%' || $4 || '%')
         AND ($5::varchar IS NULL OR material_code=$5)
       ORDER BY period_date DESC, material_code
       LIMIT $6 OFFSET $7`,
      [...filters, req.tenant.tenant_id],
      ),
    ]);

    if (forwardRun.rows[0].has_run) return res.json(forward.rows);

    res.json([]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/inventory", async (req, res, next) => {
  try {
    const schema = quoteTenantSchema(req.tenant.schema_name);
    const { rows } = await pool.query(
      `
      SELECT m.material_code, m.description AS material_description, m.category, m.uom,
        m.unit_cost, COALESCE(c.min_stock_qty,i.safety_stock_min,m.safety_stock_min,0) AS min_stock_level,
        COALESCE(c.max_storage_capacity,i.max_capacity,m.max_capacity,0) AS max_stock_level,
        COALESCE(i.on_hand_qty,0) AS current_stock, COALESCE(i.reserved_qty,0) AS reserved_stock,
        COALESCE(i.in_transit_qty,0) AS in_transit_stock, i.in_transit_due_date AS last_receipt_date,
        p.plant_code,
        CASE WHEN COALESCE(i.on_hand_qty,0)=0 THEN 'Out of Stock'
             WHEN COALESCE(i.on_hand_qty,0)-COALESCE(i.reserved_qty,0)<COALESCE(c.min_stock_qty,i.safety_stock_min,m.safety_stock_min,0) THEN 'Low Stock' ELSE 'In Stock' END AS stock_status
      FROM ${schema}.material_master m CROSS JOIN ${schema}.plants p
      LEFT JOIN ${schema}.inventory_on_hand i ON i.tenant_id=$1 AND i.material_code=m.material_code AND i.plant_code=p.plant_code
      LEFT JOIN ${schema}.plant_material_constraints c ON c.tenant_id=$1 AND c.material_code=m.material_code AND c.plant_code=p.plant_code
      WHERE m.tenant_id=$1 AND p.tenant_id=$1 AND m.active_flag=true AND p.active_flag=true AND ($2::varchar IS NULL OR p.plant_code=$2)
      ORDER BY p.plant_code,m.material_code`,
      [req.tenant.tenant_id, req.query.plantCode || null],
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/suppliers", async (_req, res, next) => {
  try {
    const schema = quoteTenantSchema(_req.tenant.schema_name);
    const { rows } =
      await pool.query(`SELECT supplier_id, supplier_code, supplier_name, supplier_type,
      contact_person, email, phone, location, lead_time_days, min_order_value, payment_terms,
      quality_rating, on_time_delivery_pct, rejection_rate_pct, status
      FROM ${schema}.dim_supplier ORDER BY supplier_name`);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get("/api/mrp/options", async (_req, res, next) => {
  try {
    const schema = quoteTenantSchema(_req.tenant.schema_name);
    const [countries, plants, finishedGoods, materials] = await Promise.all([
      pool.query(`SELECT c.country_code, c.country_name, c.currency_code
        FROM mrp.countries c
        WHERE EXISTS (SELECT 1 FROM ${schema}.plants p
          WHERE p.tenant_id=$1 AND p.country_code=c.country_code AND p.active_flag)
        ORDER BY c.country_name`, [_req.tenant.tenant_id]),
      pool.query(
        `SELECT plant_code, plant_name, country_code FROM ${schema}.plants WHERE tenant_id=$1 AND active_flag ORDER BY plant_name`, [_req.tenant.tenant_id],
      ),
      pool.query(`SELECT plant_code, fg_code, description, product_type, uom FROM ${schema}.fg_master
        WHERE tenant_id=$1 AND active_flag ORDER BY plant_code, fg_code`, [_req.tenant.tenant_id]),
      pool.query(`SELECT material_code, description, category, uom, unit_cost, safety_stock_min, max_capacity
        FROM ${schema}.material_master WHERE tenant_id=$1 AND active_flag ORDER BY material_code`, [_req.tenant.tenant_id]),
    ]);
    res.json({
      countries: countries.rows,
      plants: plants.rows,
      finishedGoods: finishedGoods.rows,
      materials: materials.rows,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/mrp/run", async (req, res, next) => {
  let client;
  try {
    const schema = quoteTenantSchema(req.tenant.schema_name);
    client = await pool.connect();
    await client.query("BEGIN");
    const countries = Array.isArray(req.body.countryCodes)
      ? req.body.countryCodes
      : [req.body.countryCode];
    const selectedPlants = Array.isArray(req.body.plantCodes)
      ? req.body.plantCodes
      : [];
    if (!countries.filter(Boolean).length)
      throw new Error("Select at least one country before running MRP.");
    const outputs = [];
    const runIds = [];
    for (const countryCode of [...new Set(countries.filter(Boolean))]) {
      const eligiblePlants = await client.query(
        `SELECT plant_code FROM ${schema}.plants WHERE tenant_id=$1 AND country_code=$2 AND active_flag`,
        [req.tenant.tenant_id, countryCode],
      );
      const countryPlantCodes = eligiblePlants.rows.map(
        (row) => row.plant_code,
      );
      const plantCodes = selectedPlants.length
        ? selectedPlants.filter((code) => countryPlantCodes.includes(code))
        : [];
      if (selectedPlants.length && !plantCodes.length) continue;
      const output = await calculateForwardMrp(client, {
        ...req.body,
        countryCode,
        plantCodes,
        tenantId: req.tenant.tenant_id,
        schemaName: req.tenant.schema_name,
      });
      const run = await client.query(
        `INSERT INTO ${schema}.mrp_runs
        (tenant_id, country_code, planning_start, horizon_months, bucket_type, created_by, scenario_inputs)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING run_id`,
        [
          req.tenant.tenant_id,
          output.countryCode,
          output.planningStart,
          output.horizonMonths,
          output.bucketType,
          req.body.createdBy || null,
          JSON.stringify({
            plantCodes,
            productTypes: req.body.productTypes || [],
            fgCodes: req.body.fgCodes || [],
            materialCategories: req.body.materialCategories || [],
            materialCodes: req.body.materialCodes || [],
            demandScenarioId: req.body.demandScenarioId || null,
            dimensionFilters: req.body.dimensionFilters || {},
            demandAggregation: req.body.demandAggregation || "ship_to",
            forecastOverrides: req.body.forecastOverrides || [],
            inventoryOverrides: req.body.inventoryOverrides || [],
          }),
        ],
      );
      const runId = run.rows[0].run_id;
      runIds.push(runId);
      outputs.push(output);
      const chunkSize = 200;
      for (
        let offset = 0;
        offset < output.results.length;
        offset += chunkSize
      ) {
        const chunk = output.results.slice(offset, offset + chunkSize);
        const params = [];
        const tuples = chunk.map((row, index) => {
          const base = index * 13;
          params.push(
            req.tenant.tenant_id,
            runId,
            row.plantCode,
            row.materialCode,
            row.bucketDate,
            row.grossRequirement,
            row.scheduledReceipts,
            row.netRequirement,
            row.plannedOrders,
            row.projectedInventory,
            row.orderReleaseDate,
            row.expediteNow,
            row.capacityExceeded,
          );
          return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13})`;
        });
        await client.query(
          `INSERT INTO ${schema}.mrp_results
          (tenant_id, run_id, plant_code, material_code, bucket_date, gross_req, scheduled_receipts,
           net_req, planned_orders, projected_inventory, order_release_date, expedite_now, capacity_exceeded_flag)
          VALUES ${tuples.join(",")}`,
          params,
        );
      }
    }
    if (!outputs.length)
      throw new Error(
        "No active plants match the selected country and plant filters.",
      );
    await client.query("COMMIT");
    const first = outputs[0];
    res.json({
      runIds,
      countryCodes: outputs.map((output) => output.countryCode),
      horizonMonths: first.horizonMonths,
      bucketType: first.bucketType,
      planningStart: first.planningStart,
      buckets: first.buckets,
      plants: outputs.flatMap((output) => output.plants),
      demandTotal: outputs.reduce((sum, output) => sum + output.demandTotal, 0),
      plannedOrderValue: outputs.reduce(
        (sum, output) => sum + output.plannedOrderValue,
        0,
      ),
      rawSpend: outputs.reduce((sum, output) => sum + output.rawSpend, 0),
      packingSpend: outputs.reduce(
        (sum, output) => sum + output.packingSpend,
        0,
      ),
      stockoutAlerts: outputs.reduce(
        (sum, output) => sum + output.stockoutAlerts,
        0,
      ),
      capacityExceededCount: outputs.reduce(
        (sum, output) => sum + output.capacityExceededCount,
        0,
      ),
      spendByCurrency: outputs.reduce((spend, output) => {
        const key = output.currencyCode;
        spend[key] ||= { planned: 0, raw: 0, packing: 0 };
        spend[key].planned += output.plannedOrderValue;
        spend[key].raw += output.rawSpend;
        spend[key].packing += output.packingSpend;
        return spend;
      }, {}),
      results: outputs.flatMap((output) => output.results),
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    next(error);
  } finally {
    client?.release();
  }
});

app.get("/api/mrp/runs/:runId", async (req, res, next) => {
  try {
    const schema = quoteTenantSchema(req.tenant.schema_name);
    const run = await pool.query(
      `SELECT run_id, country_code, planning_start, horizon_months, bucket_type, scenario_inputs, created_at
      FROM ${schema}.mrp_runs WHERE tenant_id=$1 AND run_id=$2`,
      [req.tenant.tenant_id, req.params.runId],
    );
    if (!run.rowCount)
      return res.status(404).json({ error: "MRP run not found" });
    const results = await pool.query(
      `SELECT r.plant_code, r.material_code, m.description, m.category, m.uom,
      m.unit_cost, r.bucket_date, r.gross_req, r.scheduled_receipts, r.net_req, r.planned_orders,
      r.projected_inventory, r.order_release_date, r.expedite_now, r.capacity_exceeded_flag AS capacity_exceeded
      FROM ${schema}.mrp_results r JOIN ${schema}.material_master m ON m.tenant_id=r.tenant_id AND m.material_code=r.material_code
      WHERE r.tenant_id=$1 AND m.tenant_id=$1 AND r.run_id=$2 ORDER BY r.plant_code, r.material_code, r.bucket_date`,
      [req.tenant.tenant_id, req.params.runId],
    );
    res.json({ run: run.rows[0], results: results.rows });
  } catch (error) {
    next(error);
  }
});

// In production, serve the Vite build and API from the same origin. This keeps
// browser API requests on /api and avoids a separate frontend CORS setup.
const webDist = resolve("dist");
if (existsSync(resolve(webDist, "index.html"))) {
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(resolve(webDist, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  const message =
    process.env.NODE_ENV === "production"
      ? "MRP request failed"
      : error.message;
  res.status(error.status || 500).json({ error: message });
});

const port = Number(process.env.PORT || process.env.API_PORT || 3001);
async function start() {
  try {
    const baseSchema = await pool.query("SELECT to_regclass('mrp.inventory_on_hand') AS table_name");
    if (baseSchema.rows[0].table_name) {
      const operationalMigration = await readFile(new URL("../database/006_operational_mrp_job.sql", import.meta.url), "utf8");
      await pool.query(operationalMigration);
      const scenarioDemandMigration = await readFile(new URL("../database/007_scenario_demand.sql", import.meta.url), "utf8");
      await pool.query(scenarioDemandMigration);
      const migrationTable = await pool.query("SELECT to_regclass('public.schema_migrations') AS table_name");
      let tenantMigrationApplied = false;
      if (migrationTable.rows[0].table_name) {
        const migrationStatus = await pool.query(
          "SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='008_multi_tenant') AS applied",
        );
        tenantMigrationApplied = migrationStatus.rows[0].applied;
      }
      if (!tenantMigrationApplied) {
        const multiTenantMigration = await readFile(new URL("../database/008_multi_tenant.sql", import.meta.url), "utf8");
        await pool.query(multiTenantMigration);
      }
      const platformMigration = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='009_platform_admin') AS applied",
      );
      if (!platformMigration.rows[0].applied) {
        const platformAdminMigration = await readFile(new URL("../database/009_platform_admin.sql", import.meta.url), "utf8");
        await pool.query(platformAdminMigration);
      }
      const schemaMigration = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version='010_tenant_schemas') AS applied",
      );
      if (!schemaMigration.rows[0].applied) {
        const tenantSchemaMigration = await readFile(new URL("../database/010_tenant_schemas.sql", import.meta.url), "utf8");
        await pool.query(tenantSchemaMigration);
      }
      const tenants = await pool.query(
        "SELECT tenant_id,tenant_code,tenant_name,schema_name FROM public.tenants ORDER BY tenant_code",
      );
      for (const tenant of tenants.rows) {
        const tenantClient = await pool.connect();
        try {
          await tenantClient.query("BEGIN");
          await ensureTenantSchema(tenantClient, tenant, { copyExisting: true });
          await tenantClient.query("COMMIT");
        } catch (error) {
          await tenantClient.query("ROLLBACK");
          throw error;
        } finally { tenantClient.release(); }
      }
      await bootstrapDefaultTenant(pool);
      await bootstrapPlatformAdmin(pool);
      console.log("Operational MRP schema is ready.");
    } else {
      console.warn("Base MRP schema is missing. Apply schema.sql and 002_forward_mrp.sql before uploading data.");
      process.exitCode = 1;
      return;
    }
  } catch (error) {
    console.error("Could not prepare operational MRP schema:", error.message);
    process.exitCode = 1;
    return;
  }
  app.listen(port, () => console.log(`MRP API listening on http://localhost:${port}`));
}
void start();
