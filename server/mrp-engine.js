import { quoteTenantSchema } from "./tenant-schemas.js";

const DAY_MS = 86_400_000;

const dateOnly = (value) =>
  new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const iso = (date) => date.toISOString().slice(0, 10);
const keyOf = (...parts) => parts.join("|");
const addMonths = (date, amount) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
};

function periodsFor(start, horizonMonths, bucketType) {
  const periods = [];
  if (bucketType === "Monthly") {
    const first = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    for (let index = 0; index < horizonMonths; index += 1)
      periods.push(addMonths(first, index));
  } else {
    const end = addMonths(start, horizonMonths);
    for (
      let date = new Date(start);
      date < end;
      date = new Date(date.getTime() + 7 * DAY_MS)
    )
      periods.push(new Date(date));
  }
  return periods;
}

function bucketIndex(value, periods, bucketType) {
  const date = dateOnly(value);
  if (bucketType === "Monthly") {
    return periods.findIndex(
      (period) =>
        period.getUTCFullYear() === date.getUTCFullYear() &&
        period.getUTCMonth() === date.getUTCMonth(),
    );
  }
  let match = -1;
  for (
    let index = 0;
    index < periods.length && periods[index] <= date;
    index += 1
  )
    match = index;
  return match;
}

function releaseDateFor(periods, index, leadTimeBuckets, bucketType) {
  const targetIndex = index - leadTimeBuckets;
  if (targetIndex >= 0) return periods[targetIndex];
  if (bucketType === "Monthly") return addMonths(periods[0], targetIndex);
  return new Date(periods[0].getTime() + targetIndex * 7 * DAY_MS);
}

function plannedQuantity(netRequirement, moq) {
  if (netRequirement <= 0) return 0;
  return Math.max(Number(moq || 0), netRequirement);
}

function normalizedDimensionValue(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return /^(n\/a|na|null|undefined)$/i.test(text) ? "" : text;
}

function dimensionValue(dimensions, keys) {
  for (const key of keys) {
    const value = normalizedDimensionValue(dimensions?.[key]);
    if (value) return value;
  }
  return "";
}

function filterScenarioForecast(rows, dimensionFilters, aggregationLevel) {
  const filters = Object.fromEntries(
    Object.entries(dimensionFilters || {})
      .map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : [String(value)]])
      .filter(([, values]) => values.length && values[0] !== ""),
  );
  const matching = rows.filter((row) =>
    Object.entries(filters).every(([key, values]) =>
      values.includes(normalizedDimensionValue(row.dimensions?.[key])),
    ),
  );
  const groups = new Map();
  for (const row of matching) {
    const id = keyOf(row.plant_code, row.fg_code, row.bucket_date);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const selected = [];
  const level = aggregationLevel || "ship_to";
  for (const group of groups.values()) {
    const shipRows = group.filter((row) =>
      dimensionValue(row.dimensions, ["ship_to", "ship_to_code", "ship_to_customer"]) !== "",
    );
    const soldRows = group.filter((row) =>
      dimensionValue(row.dimensions, ["sold_to", "sold_to_code", "sold_to_customer"]) !== "",
    );
    const customerRows = group.filter((row) =>
      Object.entries(row.dimensions || {}).some(([key, value]) =>
        /customer|client|account|ship_to|sold_to/.test(key) && normalizedDimensionValue(value),
      ),
    );
    const productRows = group.filter((row) => !customerRows.includes(row));
    let chosen;
    if (level === "sold_to") {
      const soldToSummary = soldRows.filter((row) => !shipRows.includes(row));
      chosen = soldToSummary.length ? soldToSummary : shipRows.length ? shipRows : productRows.length ? productRows : group;
    } else if (level === "product") {
      chosen = productRows.length ? productRows : shipRows.length ? shipRows : soldRows.length ? soldRows : group;
    } else {
      chosen = shipRows.length ? shipRows : soldRows.length ? soldRows : productRows.length ? productRows : group;
    }
    selected.push(...chosen);
  }
  return selected;
}

export async function calculateForwardMrp(client, input) {
  const tenantId = String(input.tenantId || "");
  if (!tenantId) throw new Error("A tenant workspace is required to run MRP.");
  const schema = quoteTenantSchema(input.schemaName);
  const countryCode = String(input.countryCode || "");
  const horizonMonths = Number(input.horizonMonths || 3);
  const bucketType = input.bucketType || "Monthly";
  if (!countryCode) throw new Error("Select a country before running MRP.");
  if (![3, 6, 12].includes(horizonMonths))
    throw new Error("Planning horizon must be 3, 6, or 12 months.");
  if (!["Monthly", "Weekly"].includes(bucketType))
    throw new Error("Bucket type must be Monthly or Weekly.");
  const countryResult = await client.query(
    "SELECT currency_code FROM mrp.countries WHERE country_code=$1",
    [countryCode],
  );
  if (!countryResult.rowCount)
    throw new Error(`Country ${countryCode} does not exist.`);
  const currencyCode = countryResult.rows[0].currency_code;

  const start = dateOnly(input.planningStart || new Date().toISOString());
  const periods = periodsFor(start, horizonMonths, bucketType);
  const selectedPlantCodes = Array.isArray(input.plantCodes)
    ? input.plantCodes.filter(Boolean)
    : [];
  const plantsResult = await client.query(
    `SELECT p.plant_code FROM ${schema}.plants p WHERE p.tenant_id=$1 AND p.country_code=$2 AND p.active_flag
     AND (cardinality($3::varchar[])=0 OR p.plant_code=ANY($3::varchar[])) ORDER BY p.plant_code`,
    [tenantId, countryCode, selectedPlantCodes],
  );
  const plants = plantsResult.rows.map((row) => row.plant_code);
  if (!plants.length)
    throw new Error(
      "No active plants match the selected country and plant filters.",
    );

  const demandScenarioId = input.demandScenarioId || null;
  let demandScenario = null;
  if (demandScenarioId) {
    const scenarioResult = await client.query(
      `SELECT import_id, scenario_name, scenario_type, bucket_type
       FROM ${schema}.demand_scenario_imports WHERE tenant_id=$1 AND import_id=$2 AND is_active`,
      [tenantId, demandScenarioId],
    );
    demandScenario = scenarioResult.rows[0] || null;
    if (!demandScenario)
      throw new Error("The selected forecast scenario is not active. Reload the scenario list and select the latest version.");
    if (["actual", "previous_year"].includes(demandScenario.scenario_type))
      throw new Error("Select a forecast scenario. Actuals and prior-year sheets are reference data.");
    if (demandScenario.bucket_type !== bucketType)
      throw new Error(`The selected scenario uses ${demandScenario.bucket_type.toLowerCase()} periods. Change the dashboard time bucket to match.`);
  }

  const forecastPromise = demandScenarioId
    ? client.query(
        `SELECT plant_code, fg_code,
          to_char(bucket_date::date, 'YYYY-MM-DD') AS bucket_date,
          forecast_qty, dimensions
         FROM ${schema}.demand_scenario_forecasts
         WHERE tenant_id=$1 AND import_id=$2 AND plant_code=ANY($3::varchar[])
           AND bucket_date >= $4::date AND bucket_date < $5::date`,
        [
          tenantId,
          demandScenarioId,
          plants,
          iso(periods[0]),
          iso(
            bucketType === "Monthly"
              ? addMonths(periods[periods.length - 1], 1)
              : new Date(periods[periods.length - 1].getTime() + 7 * DAY_MS),
          ),
        ],
      )
    : client.query(
        `SELECT plant_code, fg_code,
          to_char(bucket_date::date, 'YYYY-MM-DD') AS bucket_date, forecast_qty
         FROM ${schema}.demand_forecast
         WHERE tenant_id=$1 AND plant_code=ANY($2::varchar[])
           AND bucket_date::date >= $3::date AND bucket_date::date < $4::date`,
        [
          tenantId,
          plants,
          iso(periods[0]),
          iso(
            bucketType === "Monthly"
              ? addMonths(periods[periods.length - 1], 1)
              : new Date(periods[periods.length - 1].getTime() + 7 * DAY_MS),
          ),
        ],
      );

  const [
    materialsResult,
    forecastResult,
    bomResult,
    inventoryResult,
    receiptsResult,
    constraintsResult,
    fgMetaResult,
  ] = await Promise.all([
    client.query(`SELECT material_code, description, category, supply_type, uom, unit_cost, scrap_pct,
      lead_time_buckets, moq, order_multiple, safety_stock_min, max_capacity
      FROM ${schema}.material_master WHERE tenant_id=$1 AND active_flag ORDER BY material_code`, [tenantId]),
    forecastPromise,
    client.query(
      `SELECT plant_code, parent_fg_code, parent_material_code, material_code, ratio
      FROM ${schema}.bom_matrix WHERE tenant_id=$1 AND active_flag AND plant_code=ANY($2::varchar[])
        AND effective_from <= $3 AND (effective_to IS NULL OR effective_to >= $3)
      ORDER BY bom_id`,
      [tenantId, plants, iso(periods[0])],
    ),
    client.query(
      `SELECT plant_code, material_code, on_hand_qty, scheduled_receipts,
      reserved_qty, in_transit_qty, in_transit_due_date,
      safety_stock_min, max_capacity FROM ${schema}.inventory_on_hand
      WHERE tenant_id=$1 AND plant_code=ANY($2::varchar[])`,
      [tenantId, plants],
    ),
    client.query(
      `SELECT plant_code, material_code, receipt_date, quantity FROM ${schema}.scheduled_receipts
      WHERE tenant_id=$1 AND plant_code=ANY($2::varchar[]) AND receipt_date >= $3 AND receipt_date < $4`,
      [
        tenantId,
        plants,
        iso(periods[0]),
        iso(
          bucketType === "Monthly"
            ? addMonths(periods[periods.length - 1], 1)
            : new Date(periods[periods.length - 1].getTime() + 7 * DAY_MS),
        ),
      ],
    ),
    client.query(
      `SELECT plant_code, material_code, min_stock_qty, reorder_level, max_stock_qty,
        max_storage_capacity, lead_time_buckets, moq, order_multiple
       FROM ${schema}.plant_material_constraints WHERE tenant_id=$1 AND plant_code=ANY($2::varchar[])`,
      [tenantId, plants],
    ),
    client.query(
      `SELECT plant_code, fg_code, product_type FROM ${schema}.fg_master
      WHERE tenant_id=$1 AND plant_code=ANY($2::varchar[]) AND active_flag`,
      [tenantId, plants],
    ),
  ]);

  const materials = new Map(
    materialsResult.rows.map((row) => [row.material_code, row]),
  );
  const fgTypes = new Map(
    fgMetaResult.rows.map((row) => [
      keyOf(row.plant_code, row.fg_code),
      row.product_type,
    ]),
  );
  const selectedFgCodes = new Set(input.fgCodes || []);
  const selectedProductTypes = new Set(input.productTypes || []);
  const selectedMaterialCodes = new Set(input.materialCodes || []);
  const selectedMaterialCategories = new Set(input.materialCategories || []);
  const bomByFg = new Map();
  const bomByMaterial = new Map();
  for (const row of bomResult.rows) {
    if (
      row.parent_material_code &&
      materials.get(row.parent_material_code)?.supply_type !== "MAKE"
    ) {
      throw new Error(
        `BOM parent ${row.parent_material_code} must have supply_type MAKE.`,
      );
    }
    const target = row.parent_fg_code ? bomByFg : bomByMaterial;
    const parent = row.parent_fg_code || row.parent_material_code;
    const key = keyOf(row.plant_code, parent);
    if (!target.has(key)) target.set(key, []);
    target.get(key).push(row);
  }

  const forecastOverrides = new Map(
    (input.forecastOverrides || []).map((row) => [
      keyOf(row.plantCode, row.fgCode, String(row.bucketDate).slice(0, 10)),
      Number(row.forecastQty),
    ]),
  );
  const inventoryOverrides = new Map(
    (input.inventoryOverrides || []).map((row) => [
      keyOf(row.plantCode, row.materialCode),
      Number(row.onHandQty),
    ]),
  );
  for (const [id, quantity] of forecastOverrides) {
    const [plantCode, fgCode] = id.split("|");
    if (!Number.isFinite(quantity) || quantity < 0)
      throw new Error("Scenario forecast quantities must be zero or greater.");
    if (!plants.includes(plantCode) || !fgTypes.has(keyOf(plantCode, fgCode)))
      throw new Error(
        `Scenario finished good ${fgCode} is not active at plant ${plantCode}.`,
      );
  }
  for (const [id, quantity] of inventoryOverrides) {
    const [plantCode, materialCode] = id.split("|");
    if (!Number.isFinite(quantity) || quantity < 0)
      throw new Error("Scenario on-hand quantities must be zero or greater.");
    if (!plants.includes(plantCode) || !materials.has(materialCode))
      throw new Error(
        `Scenario material ${materialCode} is not active at plant ${plantCode}.`,
      );
  }
  const forecastRows = new Map();
  const demandRows = demandScenarioId
    ? filterScenarioForecast(forecastResult.rows, input.dimensionFilters, input.demandAggregation)
    : forecastResult.rows;
  for (const row of demandRows) {
    const index = bucketIndex(row.bucket_date, periods, bucketType);
    if (index < 0) continue;
    const date = iso(periods[index]);
    const id = keyOf(row.plant_code, row.fg_code, date);
    forecastRows.set(
      id,
      (forecastRows.get(id) || 0) + Number(row.forecast_qty),
    );
  }
  for (const [id, quantity] of forecastOverrides) {
    const [plantCode, fgCode, date] = id.split("|");
    const index = bucketIndex(date, periods, bucketType);
    if (plants.includes(plantCode) && index >= 0)
      forecastRows.set(keyOf(plantCode, fgCode, iso(periods[index])), quantity);
  }

  const gross = new Map();
  const explode = (plantCode, parentType, parentCode, quantity, index) => {
    const components =
      (parentType === "FG" ? bomByFg : bomByMaterial).get(
        keyOf(plantCode, parentCode),
      ) || [];
    for (const component of components) {
      const material = materials.get(component.material_code);
      if (!material)
        throw new Error(
          `BOM references inactive or missing material ${component.material_code}.`,
        );
      const scrap = Number(material.scrap_pct || 0);
      const requirement = quantity * Number(component.ratio) * (1 + scrap);
      const id = keyOf(plantCode, material.material_code, index);
      gross.set(id, (gross.get(id) || 0) + requirement);
    }
  };

  for (const [id, forecastQty] of forecastRows) {
    const [plantCode, fgCode] = id.split("|");
    if (selectedFgCodes.size && !selectedFgCodes.has(fgCode)) continue;
    if (
      selectedProductTypes.size &&
      !selectedProductTypes.has(fgTypes.get(keyOf(plantCode, fgCode)))
    )
      continue;
    const index = bucketIndex(id.split("|")[2], periods, bucketType);
    if (index < 0 || forecastQty <= 0) continue;
    explode(plantCode, "FG", fgCode, forecastQty, index);
  }

  const inventory = new Map(
    inventoryResult.rows.map((row) => [
      keyOf(row.plant_code, row.material_code),
      row,
    ]),
  );
  for (const [id, quantity] of inventoryOverrides) {
    const current = inventory.get(id);
    if (current) current.on_hand_qty = quantity;
    else {
      const [plantCode, materialCode] = id.split("|");
      inventory.set(id, {
        plant_code: plantCode,
        material_code: materialCode,
        on_hand_qty: quantity,
        scheduled_receipts: 0,
        reserved_qty: 0,
        in_transit_qty: 0,
        in_transit_due_date: null,
        safety_stock_min: null,
        max_capacity: null,
      });
    }
  }

  const receiptBuckets = new Map();
  for (const row of receiptsResult.rows) {
    const index = bucketIndex(row.receipt_date, periods, bucketType);
    if (index < 0) continue;
    const key = keyOf(row.plant_code, row.material_code, index);
    receiptBuckets.set(
      key,
      (receiptBuckets.get(key) || 0) + Number(row.quantity),
    );
  }
  for (const row of inventoryResult.rows) {
    const quantity = Number(row.in_transit_qty || 0);
    if (quantity <= 0) continue;
    const index = row.in_transit_due_date
      ? bucketIndex(row.in_transit_due_date, periods, bucketType)
      : 0;
    if (index < 0) continue;
    const key = keyOf(row.plant_code, row.material_code, index);
    receiptBuckets.set(key, (receiptBuckets.get(key) || 0) + quantity);
  }
  const plantConstraints = new Map(
    constraintsResult.rows.map((row) => [
      keyOf(row.plant_code, row.material_code), row,
    ]),
  );

  const makeMaterials = [...materials.values()].filter(
    (material) => material.supply_type === "MAKE",
  );
  const makeSet = new Set(
    makeMaterials.map((material) => material.material_code),
  );
  const indegree = new Map(
    makeMaterials.map((material) => [material.material_code, 0]),
  );
  for (const componentRows of bomByMaterial.values()) {
    for (const component of componentRows)
      if (makeSet.has(component.material_code)) {
        indegree.set(
          component.material_code,
          (indegree.get(component.material_code) || 0) + 1,
        );
      }
  }
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([code]) => code);
  const makeOrder = [];
  while (queue.length) {
    const parentCode = queue.shift();
    makeOrder.push(parentCode);
    for (const rows of bomByMaterial.values()) {
      if (!rows.some((row) => row.parent_material_code === parentCode))
        continue;
      for (const row of rows)
        if (
          row.parent_material_code === parentCode &&
          makeSet.has(row.material_code)
        ) {
          const degree = indegree.get(row.material_code) - 1;
          indegree.set(row.material_code, degree);
          if (degree === 0) queue.push(row.material_code);
        }
    }
  }
  if (makeOrder.length !== makeMaterials.length)
    throw new Error("Circular make-material BOM detected.");
  const materialOrder = [
    ...makeOrder,
    ...[...materials.keys()].filter((code) => !makeSet.has(code)),
  ];
  const results = [];
  for (const plantCode of plants) {
    for (const materialCode of materialOrder) {
      const material = materials.get(materialCode);
      const itemKey = keyOf(plantCode, materialCode);
      const stock = inventory.get(itemKey);
      const constraint = plantConstraints.get(itemKey);
      // Match the training workbook: net against opening on-hand, scheduled
      // receipts, and the material's safety stock. Reserved stock and reorder
      // levels are operational extensions and are not inputs to this formula.
      let projected = Number(stock?.on_hand_qty || 0);
      const safetyMin = Number(
        stock?.safety_stock_min ?? material.safety_stock_min ?? 0,
      );
      const maxCapacityValue =
        constraint?.max_storage_capacity ?? constraint?.max_stock_qty ??
        stock?.max_capacity ?? material.max_capacity;
      const maxCapacity =
        maxCapacityValue == null ? null : Number(maxCapacityValue);
      for (let index = 0; index < periods.length; index += 1) {
        const grossRequirement =
          gross.get(keyOf(plantCode, materialCode, index)) || 0;
        const scheduled =
          (index === 0 ? Number(stock?.scheduled_receipts || 0) : 0) +
          (receiptBuckets.get(keyOf(plantCode, materialCode, index)) || 0);
        const beforePlannedOrder = projected + scheduled - grossRequirement;
        const netRequirement = Math.max(0, safetyMin - beforePlannedOrder);
        const plannedOrders = plannedQuantity(
          netRequirement,
          constraint?.moq ?? material.moq,
        );
        const releaseDate =
          plannedOrders > 0
            ? releaseDateFor(
                periods,
                index,
                Number(constraint?.lead_time_buckets ?? material.lead_time_buckets ?? 0),
                bucketType,
              )
            : null;
        projected = beforePlannedOrder + plannedOrders;
        results.push({
          plantCode,
          materialCode,
          description: material.description,
          category: material.category,
          uom: material.uom,
          unitCost: Number(material.unit_cost || 0),
          onHand: Number(stock?.on_hand_qty || 0),
          safetyStock: safetyMin,
          maxCapacity,
          bucketDate: iso(periods[index]),
          bucketIndex: index,
          grossRequirement,
          scheduledReceipts: scheduled,
          netRequirement,
          plannedOrders,
          projectedInventory: projected,
          orderReleaseDate: releaseDate ? iso(releaseDate) : null,
          expediteNow: Boolean(releaseDate && releaseDate <= periods[0]),
          capacityExceeded: maxCapacity !== null && projected > maxCapacity,
        });
        if (
          material.supply_type === "MAKE" &&
          plannedOrders > 0
        ) {
          const releaseIndex = Math.max(
            0,
            bucketIndex(iso(releaseDate), periods, bucketType),
          );
          const components =
            bomByMaterial.get(keyOf(plantCode, materialCode)) || [];
          for (const component of components) {
            const componentMaterial = materials.get(component.material_code);
            if (!componentMaterial)
              throw new Error(
                `BOM references inactive or missing material ${component.material_code}.`,
              );
            const componentGross =
              plannedOrders *
              Number(component.ratio) *
              (1 + Number(componentMaterial.scrap_pct || 0));
            const componentKey = keyOf(
              plantCode,
              component.material_code,
              releaseIndex,
            );
            gross.set(
              componentKey,
              (gross.get(componentKey) || 0) + componentGross,
            );
          }
        }
      }
    }
  }

  const visibleResults = results.filter(
    (row) =>
      (!selectedMaterialCodes.size ||
        selectedMaterialCodes.has(row.materialCode)) &&
      (!selectedMaterialCategories.size ||
        selectedMaterialCategories.has(row.category)),
  );
  const visibleOrders = visibleResults.filter((row) => row.plannedOrders > 0);
  const demandTotal = [...forecastRows.entries()]
    .filter(([id]) => {
      const [plantCode, fgCode] = id.split("|");
      return (
        (!selectedFgCodes.size || selectedFgCodes.has(fgCode)) &&
        (!selectedProductTypes.size ||
          selectedProductTypes.has(fgTypes.get(keyOf(plantCode, fgCode))))
      );
    })
    .reduce((sum, [, value]) => sum + value, 0);
  return {
    countryCode,
    currencyCode,
    demandScenarioId: demandScenario?.import_id || null,
    demandScenarioName: demandScenario?.scenario_name || null,
    horizonMonths,
    bucketType,
    planningStart: iso(periods[0]),
    buckets: periods.map((date, index) => ({
      index,
      label: `${bucketType === "Weekly" ? "W" : "M"}${index === 0 ? "0" : `+${index}`}`,
      date: iso(date),
    })),
    plants,
    demandTotal,
    plannedOrderValue: visibleOrders.reduce(
      (sum, row) => sum + row.plannedOrders * row.unitCost,
      0,
    ),
    rawSpend: visibleOrders
      .filter((row) => row.category === "Raw")
      .reduce((sum, row) => sum + row.plannedOrders * row.unitCost, 0),
    packingSpend: visibleOrders
      .filter((row) => row.category === "Packing")
      .reduce((sum, row) => sum + row.plannedOrders * row.unitCost, 0),
    stockoutAlerts: visibleOrders.filter((row) => row.expediteNow).length,
    capacityExceededCount: visibleResults.filter((row) => row.capacityExceeded)
      .length,
    materials: materialsResult.rows,
    results: visibleResults,
  };
}
