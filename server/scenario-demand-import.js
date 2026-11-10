import { quoteTenantSchema } from "./tenant-schemas.js";

const allowedTypes = new Set([
  "system_forecast",
  "consensus_forecast",
  "custom_forecast",
  "actual",
  "previous_year",
  "other",
]);
const MAX_IMPORT_ROWS = 50_000;
const INSERT_CHUNK_SIZE = 400;

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function canonicalDimensions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Each demand row must include a dimensions object.");
  const dimensions = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = String(rawKey).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!key) continue;
    if (rawValue == null) continue;
    const text = String(rawValue).trim();
    if (!text || /^(n\/a|na|null|undefined)$/i.test(text)) continue;
    dimensions[key] = text.slice(0, 500);
  }
  const sorted = Object.fromEntries(Object.entries(dimensions).sort(([a], [b]) => a.localeCompare(b)));
  return { dimensions: sorted, key: JSON.stringify(sorted) };
}

export async function importDemandScenario(pool, input, tenantId, schemaName) {
  if (!tenantId) throw new Error("A signed-in tenant workspace is required for demand imports.");
  const schema = quoteTenantSchema(schemaName);
  const fileName = String(input.fileName || "").trim().slice(0, 255);
  const sourceSheet = String(input.sourceSheet || "").trim().slice(0, 255);
  const scenarioName = String(input.scenarioName || sourceSheet).trim().slice(0, 255);
  const scenarioType = String(input.scenarioType || "custom_forecast");
  const bucketType = String(input.bucketType || "");
  const rows = input.rows;
  if (!fileName || !sourceSheet || !scenarioName)
    throw new Error("File name, worksheet, and scenario name are required.");
  if (!allowedTypes.has(scenarioType))
    throw new Error("Select a supported forecast scenario type.");
  if (!['Monthly', 'Weekly'].includes(bucketType))
    throw new Error("Time bucket must be Monthly or Weekly.");
  if (!Array.isArray(rows) || rows.length === 0)
    throw new Error("The selected worksheet has no mappable forecast rows.");
  if (rows.length > MAX_IMPORT_ROWS)
    throw new Error(`A scenario can contain at most ${MAX_IMPORT_ROWS.toLocaleString()} material-period rows. Import one worksheet at a time.`);

  const aggregated = new Map();
  for (const [index, row] of rows.entries()) {
    const line = index + 1;
    const plantCode = String(row.plantCode || "").trim();
    const fgCode = String(row.fgCode || "").trim();
    const bucketDate = String(row.bucketDate || "").slice(0, 10);
    const forecastQty = Number(row.forecastQty);
    const uom = row.uom == null ? null : String(row.uom).trim().slice(0, 20) || null;
    if (!plantCode || !fgCode)
      throw new Error(`Imported record ${line}: mapped plant and product are required.`);
    if (!validDate(bucketDate))
      throw new Error(`Imported record ${line}: ${bucketDate || "period date"} is not a valid YYYY-MM-DD date.`);
    if (bucketType === "Monthly" && !bucketDate.endsWith("-01"))
      throw new Error(`Imported record ${line}: monthly period dates must be the first day of the month.`);
    const referenceSheet = ["actual", "previous_year"].includes(scenarioType);
    if (!Number.isFinite(forecastQty) || (!referenceSheet && forecastQty < 0))
      throw new Error(`Imported record ${line}: forecast quantity must be zero or greater.`);
    const { dimensions, key: dimensionKey } = canonicalDimensions(row.dimensions);
    const key = `${plantCode}|${fgCode}|${bucketDate}|${dimensionKey}`;
    const existing = aggregated.get(key);
    if (existing && existing.uom && uom && existing.uom !== uom)
      throw new Error(`Imported records for ${fgCode} on ${bucketDate} use more than one unit. Normalize the units before import.`);
    aggregated.set(key, {
      plantCode,
      fgCode,
      bucketDate,
      forecastQty: (existing?.forecastQty || 0) + forecastQty,
      uom: existing?.uom || uom,
      dimensions,
      dimensionKey,
      sourceRowNumber: Number.isInteger(row.sourceRowNumber) ? row.sourceRowNumber : null,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE ${schema}.demand_scenario_imports SET is_active=false
       WHERE tenant_id=$1 AND is_active=true AND scenario_name=$2 AND source_sheet=$3 AND scenario_type=$4`,
      [tenantId, scenarioName, sourceSheet, scenarioType],
    );
    const importResult = await client.query(
      `INSERT INTO ${schema}.demand_scenario_imports
       (tenant_id, file_name, source_sheet, scenario_name, scenario_type, bucket_type, date_format, imported_rows, import_metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING import_id`,
      [
        tenantId,
        fileName,
        sourceSheet,
        scenarioName,
        scenarioType,
        bucketType,
        String(input.dateFormat || "DMY"),
        aggregated.size,
        JSON.stringify({
          plantColumn: input.plantColumn || null,
          productColumn: input.productColumn || null,
          dateColumns: input.dateColumns || [],
          customerAggregation: "preserve source dimensions; planner chooses at run time",
          codeMappings: input.codeMappings || {},
        }),
      ],
    );
    const importId = importResult.rows[0].import_id;
    const records = [...aggregated.values()];
    for (let offset = 0; offset < records.length; offset += INSERT_CHUNK_SIZE) {
      const chunk = records.slice(offset, offset + INSERT_CHUNK_SIZE);
      const params = [];
      const tuples = chunk.map((row, index) => {
        const base = index * 10;
        params.push(
          tenantId,
          importId,
          row.plantCode,
          row.fgCode,
          row.bucketDate,
          row.forecastQty,
          row.uom,
          JSON.stringify(row.dimensions),
          row.dimensionKey,
          row.sourceRowNumber,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8}::jsonb,$${base + 9},$${base + 10})`;
      });
      await client.query(
        `INSERT INTO ${schema}.demand_scenario_forecasts
         (tenant_id,import_id,plant_code,fg_code,bucket_date,forecast_qty,uom,dimensions,dimension_key,source_row_number)
         VALUES ${tuples.join(",")}`,
        params,
      );
    }
    await client.query("COMMIT");
    return { importId, imported: records.length, bucketType, scenarioName };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
