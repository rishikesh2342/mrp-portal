import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Factory,
  Package,
  Play,
  RefreshCw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { PageProps } from "../types";
import "./forward-mrp.css";

type Country = {
  country_code: string;
  country_name: string;
  currency_code: string;
};
type Plant = { plant_code: string; plant_name: string; country_code: string };
type FinishedGood = {
  plant_code: string;
  fg_code: string;
  description: string;
  product_type: string;
  uom: string;
};
type Material = {
  material_code: string;
  description: string;
  category: string;
  uom: string;
  unit_cost: string;
  safety_stock_min: string;
  max_capacity: string | null;
};
type MRPRow = {
  plantCode: string;
  materialCode: string;
  description: string;
  category: string;
  uom: string;
  unitCost: number;
  onHand: number;
  safetyStock: number;
  maxCapacity: number | null;
  bucketDate: string;
  bucketIndex: number;
  grossRequirement: number;
  scheduledReceipts: number;
  netRequirement: number;
  plannedOrders: number;
  projectedInventory: number;
  orderReleaseDate: string | null;
  expediteNow: boolean;
  capacityExceeded: boolean;
};
type Bucket = { index: number; label: string; date: string };
type MRPOutput = {
  runIds: string[];
  countryCodes: string[];
  horizonMonths: number;
  bucketType: "Monthly" | "Weekly";
  planningStart: string;
  buckets: Bucket[];
  plants: string[];
  demandTotal: number;
  plannedOrderValue: number;
  rawSpend: number;
  packingSpend: number;
  stockoutAlerts: number;
  capacityExceededCount: number;
  spendByCurrency: Record<
    string,
    { planned: number; raw: number; packing: number }
  >;
  results: MRPRow[];
};
type DemandScenario = { import_id: string; scenario_name: string; scenario_type: string; bucket_type: "Monthly" | "Weekly"; imported_at: string; imported_rows: number };
type ScenarioDimension = { dimension_key: string; values: { value: string; rows: number }[] };
type Options = {
  countries: Country[];
  plants: Plant[];
  finishedGoods: FinishedGood[];
  materials: Material[];
};
type Scenario = {
  plantCode: string;
  fgCode: string;
  materialCode: string;
  bucketDate: string;
  forecastQty: string;
  onHandQty: string;
};

const defaultDate = "2026-11-01";
const fmt = (value: number, digits = 0) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
    value,
  );
const axisFmt = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export default function DashboardPage({ onNotify }: PageProps) {
  const [options, setOptions] = useState<Options>({
    countries: [],
    plants: [],
    finishedGoods: [],
    materials: [],
  });
  const [countryCodes, setCountryCodes] = useState<string[]>([]);
  const [plantCodes, setPlantCodes] = useState<string[]>([]);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [fgCodes, setFgCodes] = useState<string[]>([]);
  const [materialCategories, setMaterialCategories] = useState<string[]>([]);
  const [materialCodes, setMaterialCodes] = useState<string[]>([]);
  const [horizonMonths, setHorizonMonths] = useState(3);
  const [bucketType, setBucketType] = useState<"Monthly" | "Weekly">("Monthly");
  const [planningStart, setPlanningStart] = useState(defaultDate);
  const [output, setOutput] = useState<MRPOutput | null>(null);
  const [chartMaterialCode, setChartMaterialCode] = useState("");
  const [chartCurrencyCode, setChartCurrencyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [demandScenarios, setDemandScenarios] = useState<DemandScenario[]>([]);
  const [demandScenarioId, setDemandScenarioId] = useState("");
  const [scenarioDimensions, setScenarioDimensions] = useState<ScenarioDimension[]>([]);
  const [dimensionFilters, setDimensionFilters] = useState<Record<string, string>>({});
  const [demandAggregation, setDemandAggregation] = useState("ship_to");
  const [scenario, setScenario] = useState<Scenario>({
    plantCode: "",
    fgCode: "",
    materialCode: "",
    bucketDate: defaultDate,
    forecastQty: "",
    onHandQty: "",
  });

  useEffect(() => {
    fetch("/api/mrp/options")
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Could not load MRP master data. Check the API and database connection.",
          );
        return response.json();
      })
      .then((data: Options) => {
        setOptions(data);
        const countries = data.countries.map((row) => row.country_code);
        setCountryCodes(countries);
        setPlantCodes(
          data.plants
            .filter((row) => countries.includes(row.country_code))
            .map((row) => row.plant_code),
        );
        setReady(true);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const refreshDemandScenarios = () => fetch("/api/demand/scenarios").then((r) => r.ok ? r.json() : []).then((rows: DemandScenario[]) => setDemandScenarios(rows));
  useEffect(() => { void refreshDemandScenarios(); }, []);
  useEffect(() => {
    if (!demandScenarioId) { setScenarioDimensions([]); setDimensionFilters({}); return; }
    fetch(`/api/demand/scenarios/${demandScenarioId}/dimensions`).then((r) => r.json()).then((rows: ScenarioDimension[]) => { setScenarioDimensions(rows); setDimensionFilters({}); });
  }, [demandScenarioId]);

  async function runMrp(overrides?: {
    forecastOverrides?: object[];
    inventoryOverrides?: object[];
  }) {
    if (!countryCodes.length) {
      setError("Select a country to calculate material requirements.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/mrp/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCodes,
          plantCodes,
          productTypes,
          fgCodes,
          materialCategories,
          materialCodes,
          horizonMonths,
          bucketType,
          planningStart,
          demandScenarioId: demandScenarioId || null,
          dimensionFilters,
          demandAggregation,
          ...overrides,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "MRP calculation failed.");
      setOutput(body);
      setChartMaterialCode((current) =>
        current &&
        body.results.some((row: MRPRow) => row.materialCode === current)
          ? current
          : body.results[0]?.materialCode || "",
      );
      setChartCurrencyCode((current) =>
        current && body.spendByCurrency[current]
          ? current
          : Object.keys(body.spendByCurrency || {})[0] || "",
      );
      setScenarioOpen(false);
      onNotify(
        `Forward MRP calculated for ${body.buckets.length} time buckets`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "MRP calculation failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ready && !output && !loading) void runMrp();
  }, [ready]);

  const countryPlants = options.plants.filter((row) =>
    countryCodes.includes(row.country_code),
  );
  const selectedPlants = countryPlants.filter(
    (row) => !plantCodes.length || plantCodes.includes(row.plant_code),
  );
  const availableFgs = options.finishedGoods.filter(
    (row) =>
      selectedPlants.some((plant) => plant.plant_code === row.plant_code) &&
      (!productTypes.length || productTypes.includes(row.product_type)),
  );
  const availableMaterials = options.materials.filter(
    (row) =>
      !materialCategories.length || materialCategories.includes(row.category),
  );
  const materialGroups = useMemo(() => {
    const grouped = new Map<string, MRPRow[]>();
    for (const row of output?.results || []) {
      const key = `${row.plantCode}|${row.materialCode}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    return [...grouped.entries()].map(([key, rows]) => ({
      key,
      rows,
      first: rows[0],
    }));
  }, [output]);
  const currencyCodes = Object.keys(output?.spendByCurrency || {});
  const spendLabel = (part: "planned" | "raw" | "packing") =>
    currencyCodes.length
      ? currencyCodes
          .map(
            (code) => `${code} ${fmt(output!.spendByCurrency[code][part], 2)}`,
          )
          .join(" · ")
      : "—";
  const plantCodesByCurrency = Object.fromEntries(
    currencyCodes.map((code) => [
      code,
      new Set(
        options.plants
          .filter(
            (plant) =>
              countryCodes.includes(plant.country_code) &&
              (!plantCodes.length || plantCodes.includes(plant.plant_code)) &&
              options.countries.some(
                (country) =>
                  country.country_code === plant.country_code &&
                  country.currency_code === code,
              ),
          )
          .map((plant) => plant.plant_code),
      ),
    ]),
  );
  const updateCountryCode = (event: ChangeEvent<HTMLSelectElement>) => {
    const countries = event.target.value ? [event.target.value] : [];
    setCountryCodes(countries);
    setPlantCodes(
      options.plants
        .filter((row) => countries.includes(row.country_code))
        .map((row) => row.plant_code),
    );
    setFgCodes([]);
  };
  const finishedGoodOptions = [
    ...new Map(
      availableFgs.map((row) => [
        row.fg_code,
        { value: row.fg_code, label: `${row.fg_code} · ${row.description}` },
      ]),
    ).values(),
  ];
  const materialOptions = availableMaterials.map((row) => ({
    value: row.material_code,
    label: `${row.material_code} · ${row.description}`,
  }));
  const plantOptions = countryPlants.map((row) => ({
    value: row.plant_code,
    label: `${row.plant_name} · ${row.plant_code}`,
  }));
  const openScenario = () => {
    const plant = selectedPlants[0]?.plant_code || "";
    const fg =
      availableFgs.find(
        (row) =>
          row.plant_code === plant &&
          (!fgCodes.length || fgCodes.includes(row.fg_code)),
      )?.fg_code || "";
    const material =
      availableMaterials.find(
        (row) =>
          !materialCodes.length || materialCodes.includes(row.material_code),
      )?.material_code || "";
    setScenario({
      plantCode: plant,
      fgCode: fg,
      materialCode: material,
      bucketDate: output?.buckets[0]?.date || planningStart,
      forecastQty: "",
      onHandQty: "",
    });
    setScenarioOpen(true);
  };
  const applyScenario = (event: FormEvent) => {
    event.preventDefault();
    const forecastOverrides =
      scenario.forecastQty === ""
        ? []
        : [
            {
              plantCode: scenario.plantCode,
              fgCode: scenario.fgCode,
              bucketDate: scenario.bucketDate,
              forecastQty: Number(scenario.forecastQty),
            },
          ];
    const inventoryOverrides =
      scenario.onHandQty === ""
        ? []
        : [
            {
              plantCode: scenario.plantCode,
              materialCode: scenario.materialCode,
              onHandQty: Number(scenario.onHandQty),
            },
          ];
    void runMrp({ forecastOverrides, inventoryOverrides });
  };

  const capacityRows = materialGroups
    .map((group) => ({
      label: `${group.first.plantCode} · ${group.first.materialCode}`,
      capacity: group.first.maxCapacity,
      peak: Math.max(...group.rows.map((row) => row.projectedInventory)),
    }))
    .filter((row) => row.capacity !== null)
    .slice(0, 8);
  const spendByBucket = (output?.buckets || []).map((bucket) =>
    Object.fromEntries(
      currencyCodes.map((code) => [
        code,
        (output?.results || [])
          .filter(
            (row) =>
              row.bucketIndex === bucket.index &&
              plantCodesByCurrency[code].has(row.plantCode),
          )
          .reduce((sum, row) => sum + row.plannedOrders * row.unitCost, 0),
      ]),
    ),
  );
  const activeCurrency = currencyCodes.includes(chartCurrencyCode)
    ? chartCurrencyCode
    : currencyCodes[0] || "";
  const selectedSpendByBucket = spendByBucket.map((bucket) =>
    Number(bucket[activeCurrency] || 0),
  );
  const maxSpend = Math.max(1, ...selectedSpendByBucket);
  const spendTicks = [
    maxSpend,
    maxSpend * 0.75,
    maxSpend * 0.5,
    maxSpend * 0.25,
    0,
  ];
  const chartMaterial = output?.results.find(
    (row) => row.materialCode === chartMaterialCode,
  );
  const quantityByBucket = (output?.buckets || []).map((bucket) =>
    (output?.results || [])
      .filter(
        (row) =>
          row.bucketIndex === bucket.index &&
          row.materialCode === chartMaterialCode,
      )
      .reduce(
        (total, row) => ({
          gross: total.gross + row.grossRequirement,
          receipts: total.receipts + row.scheduledReceipts,
          net: total.net + row.netRequirement,
          planned: total.planned + row.plannedOrders,
        }),
        { gross: 0, receipts: 0, net: 0, planned: 0 },
      ),
  );
  const maxQuantity = Math.max(
    1,
    ...quantityByBucket.flatMap((row) => [row.gross, row.planned]),
  );
  const quantityTicks = [
    maxQuantity,
    maxQuantity * 0.75,
    maxQuantity * 0.5,
    maxQuantity * 0.25,
    0,
  ];

  return (
    <section className="forward-mrp">
      <header className="forward-heading">
        <div>
          <span className="forward-kicker">PLANNING WORKSPACE / MRP</span>
          <h1>Forward MRP Plan</h1>
          <p>
            Time-phased demand, material availability, planned procurement and
            capacity risk.
          </p>
        </div>
        <div className="forward-actions">
          <button className="button secondary" onClick={openScenario}>
            <SlidersHorizontal size={15} /> Scenario inputs
          </button>
          <button
            className="button primary"
            disabled={loading || !ready}
            onClick={() => void runMrp()}
          >
            {loading ? (
              <RefreshCw className="spin" size={15} />
            ) : (
              <Play size={15} />
            )}{" "}
            {loading ? "Calculating…" : "Run MRP"}
          </button>
        </div>
      </header>

      <section className="forward-filters" aria-label="MRP planning filters">
        <label>Demand scenario<select value={demandScenarioId} onChange={(e) => { const id=e.target.value; setDemandScenarioId(id); const selected=demandScenarios.find((s)=>s.import_id===id); if (selected) setBucketType(selected.bucket_type); }}><option value="">Existing demand forecast</option>{demandScenarios.map((s)=><option key={s.import_id} value={s.import_id} disabled={["actual","previous_year"].includes(s.scenario_type)}>{s.scenario_name} · {s.scenario_type.replace(/_/g," ")}{["actual","previous_year"].includes(s.scenario_type) ? " (reference only)" : ""}</option>)}</select><small className="filter-help">One forecast scenario is used per MRP run.</small></label>
        {demandScenarioId && <label>Demand aggregation<select value={demandAggregation} onChange={(e)=>setDemandAggregation(e.target.value)}><option value="ship_to">Ship To detail</option><option value="sold_to">Sold To</option><option value="product">Product total</option></select><small className="filter-help">Select one hierarchy level to prevent summing parent and child totals together.</small></label>}
        {demandScenarioId && scenarioDimensions.map((dimension)=><label key={dimension.dimension_key}>{dimension.dimension_key.replace(/_/g," ")}<select value={dimensionFilters[dimension.dimension_key] || ""} onChange={(e)=>setDimensionFilters({...dimensionFilters,[dimension.dimension_key]:e.target.value})}><option value="">All</option>{dimension.values.map((v)=><option key={v.value} value={v.value}>{v.value}</option>)}</select></label>)}
        <label>
          Country
          <select
            value={countryCodes[0] || ""}
            onChange={updateCountryCode}
            disabled={!options.countries.length}
          >
            {options.countries.map((row) => (
              <option key={row.country_code} value={row.country_code}>
                {row.country_name} ({row.country_code})
              </option>
            ))}
          </select>
        </label>
        <MultiSelectFilter
          label="Plant"
          allLabel="All plants"
          options={plantOptions}
          values={plantCodes}
          onChange={setPlantCodes}
        />
        <MultiSelectFilter
          label="Product type"
          allLabel="All product types"
          options={[
            { value: "Bulk", label: "Bulk" },
            { value: "Bagged", label: "Bagged" },
          ]}
          values={productTypes}
          onChange={setProductTypes}
        />
        <MultiSelectFilter
          label="Finished good"
          allLabel="All finished goods"
          options={finishedGoodOptions}
          values={fgCodes}
          onChange={setFgCodes}
        />
        <MultiSelectFilter
          label="Material category"
          allLabel="All categories"
          options={[
            { value: "Raw", label: "Raw materials" },
            { value: "Packing", label: "Packaging materials" },
            { value: "Intermediate", label: "Intermediate materials" },
          ]}
          values={materialCategories}
          onChange={setMaterialCategories}
        />
        <MultiSelectFilter
          label="Material"
          allLabel="All materials"
          options={materialOptions}
          values={materialCodes}
          onChange={setMaterialCodes}
        />
        <label>
          Planning Horizon
          <select
            value={horizonMonths}
            onChange={(event) => setHorizonMonths(Number(event.target.value))}
          >
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
          </select>
        </label>
        <label>
          Time buckets
          <select
            value={bucketType}
            onChange={(event) =>
              setBucketType(event.target.value as "Monthly" | "Weekly")
            }
          >
            <option>Monthly</option>
            <option>Weekly</option>
          </select>
        </label>
        <label>
          Planning start date
          <input
            type="date"
            value={planningStart}
            onChange={(event) => setPlanningStart(event.target.value)}
          />
          <small className="filter-help">
            First day of the planning window
          </small>
        </label>
      </section>

      {error && (
        <div className="forward-error">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button
            onClick={() => void runMrp()}
            aria-label="Retry MRP calculation"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      )}
      {output && output.demandTotal === 0 && (
        <div className="forward-info">
          <Activity size={16} />
          <span>
            <strong>No forecast demand found for this planning window.</strong>{" "}
            Upload the weekly demand CSV in Demand Planning, or change the start
            date and filters.
          </span>
        </div>
      )}
      {!output && loading && (
        <div className="forward-loading">
          <RefreshCw className="spin" /> Loading forward plan from PostgreSQL…
        </div>
      )}
      {output && (
        <>
          <section className="forward-kpis">
            <Kpi
              icon={<Activity size={18} />}
              label="Forecast Demand"
              value={`${fmt(output.demandTotal)} tons`}
              tone="blue"
            />
            <Kpi
              icon={<Package size={18} />}
              label="Planned Order Value"
              value={spendLabel("planned")}
              tone="purple"
            />
            <Kpi
              icon={<Factory size={18} />}
              label="Raw / Packing Spend"
              value={`${spendLabel("raw")} / ${spendLabel("packing")}`}
              tone="green"
            />
            <Kpi
              icon={<AlertTriangle size={18} />}
              label="Expedite / Stockout Alerts"
              value={fmt(output.stockoutAlerts)}
              tone="amber"
            />
            <Kpi
              icon={<Activity size={18} />}
              label="Capacity Exceeded Buckets"
              value={fmt(output.capacityExceededCount)}
              tone="red"
            />
          </section>

          <section className="forward-visuals">
            <article className="forward-card">
              <div className="forward-card-heading">
                <div>
                  <h2>Forward Procurement Projection</h2>
                  <p>Order value per bucket · planned quantity × unit cost</p>
                </div>
                <span>{output.bucketType}</span>
              </div>
              <div className="chart-control-row">
                <label>
                  Currency
                  <select
                    value={activeCurrency}
                    onChange={(event) =>
                      setChartCurrencyCode(event.target.value)
                    }
                  >
                    {currencyCodes.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="chart-definition">
                  Y axis · {activeCurrency}
                </span>
              </div>
              <div className="spend-chart axis-chart">
                <div className="axis-y-ticks">
                  {spendTicks.map((tick, index) => (
                    <span key={index}>{axisFmt(tick)}</span>
                  ))}
                </div>
                {output.buckets.map((bucket, index) => (
                  <div
                    className="spend-column"
                    key={bucket.date}
                    title={`${bucket.date}: ${activeCurrency} ${fmt(selectedSpendByBucket[index], 2)}`}
                  >
                    <div className="spend-bars">
                      <i
                        className="spend-series series-0"
                        style={{
                          height: `${selectedSpendByBucket[index] ? Math.max(3, (selectedSpendByBucket[index] / maxSpend) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <small>
                      {output.bucketType === "Monthly"
                        ? bucket.date.slice(0, 7)
                        : new Date(
                            `${bucket.date}T00:00:00`,
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                    </small>
                  </div>
                ))}
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-procurement" />
                  Planned procurement value
                </span>
              </div>
            </article>
            <article className="forward-card">
              <div className="forward-card-heading">
                <div>
                  <h2>Material Consumption &amp; Planned Qty</h2>
                  <p>
                    {chartMaterial
                      ? `${chartMaterial.materialCode} — ${chartMaterial.description}`
                      : "Choose a material in the matrix"}
                  </p>
                </div>
                <Package size={17} />
              </div>
              <div className="chart-control-row">
                <label>
                  Material
                  <select
                    value={chartMaterialCode}
                    onChange={(event) =>
                      setChartMaterialCode(event.target.value)
                    }
                  >
                    {[
                      ...new Set(
                        (output.results || []).map((row) => row.materialCode),
                      ),
                    ].map((code) => {
                      const row = output.results.find(
                        (item) => item.materialCode === code,
                      );
                      return (
                        <option key={code} value={code}>
                          {code} — {row?.description || code}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <span className="chart-definition">
                  Y axis · {chartMaterial?.uom || "units"}
                </span>
              </div>
              <div className="spend-chart quantity-chart axis-chart">
                <div className="axis-y-ticks">
                  {quantityTicks.map((tick, index) => (
                    <span key={index}>{axisFmt(tick)}</span>
                  ))}
                </div>
                {output.buckets.map((bucket, index) => (
                  <div
                    className="spend-column"
                    key={bucket.date}
                    title={`${bucket.date}: gross requirement ${fmt(quantityByBucket[index].gross, 2)}, planned order ${fmt(quantityByBucket[index].planned, 2)} ${chartMaterial?.uom || ""}`}
                  >
                    <div className="quantity-bars">
                      <i
                        className="quantity-gross"
                        style={{
                          height: `${quantityByBucket[index].gross ? Math.max(3, (quantityByBucket[index].gross / maxQuantity) * 100) : 0}%`,
                        }}
                      />
                      <i
                        className="quantity-planned"
                        style={{
                          height: `${quantityByBucket[index].planned ? Math.max(3, (quantityByBucket[index].planned / maxQuantity) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <small>
                      {output.bucketType === "Monthly"
                        ? bucket.date.slice(0, 7)
                        : new Date(
                            `${bucket.date}T00:00:00`,
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                    </small>
                  </div>
                ))}
              </div>
              <div className="chart-legend">
                <span>
                  <i className="legend-gross" />
                  Gross material requirement
                </span>
                <span>
                  <i className="legend-planned" />
                  Planned order
                </span>
              </div>
            </article>
            <article className="forward-card">
              <div className="forward-card-heading">
                <div>
                  <h2>Plant Capacity Utilization</h2>
                  <p>Peak projected stock / material capacity</p>
                </div>
                <Factory size={17} />
              </div>
              <div className="capacity-list">
                {capacityRows.length ? (
                  capacityRows.map((row) => {
                    const pct =
                      Number(row.capacity) === 0
                        ? row.peak > 0
                          ? 100
                          : 0
                        : Math.min(
                            100,
                            (row.peak / Number(row.capacity)) * 100,
                          );
                    return (
                      <div className="capacity-row" key={row.label}>
                        <span>{row.label}</span>
                        <div>
                          <i
                            className={
                              row.peak > Number(row.capacity) ? "exceeded" : ""
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <b>{fmt(pct)}%</b>
                      </div>
                    );
                  })
                ) : (
                  <p className="forward-empty">
                    No material capacity limits are configured.
                  </p>
                )}
              </div>
            </article>
          </section>

          <section className="forward-matrix-card">
            <div className="forward-matrix-heading">
              <div>
                <h2>Time-Phased Material Plan</h2>
                <p>
                  Projected stock includes scheduled receipts and planned
                  orders. Expand a material for requirement and release detail.
                </p>
              </div>
              <span>
                <CalendarDays size={15} />
                {output.buckets.length} buckets
              </span>
            </div>
            <div className="forward-table-scroll">
              <table className="forward-matrix">
                <thead>
                  <tr>
                    <th>Plant</th>
                    <th>Material</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>On Hand</th>
                    <th>Min / Max</th>
                    {output.buckets.map((bucket) => (
                      <th key={bucket.date}>
                        {bucket.label}
                        <small>
                          {new Date(
                            `${bucket.date}T00:00:00`,
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {materialGroups.map(({ key, rows }) => (
                    <MaterialPlan
                      key={key}
                      rows={rows}
                      expanded={Boolean(expanded[key])}
                      onToggle={() =>
                        setExpanded((current) => ({
                          ...current,
                          [key]: !current[key],
                        }))
                      }
                    />
                  ))}
                </tbody>
              </table>
              {!materialGroups.length && (
                <div className="forward-empty table-empty">
                  No materials match these filters, or this country has no
                  demand/BOM data in the selected horizon.
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {scenarioOpen && (
        <div
          className="scenario-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setScenarioOpen(false);
          }}
        >
          <form className="scenario-panel" onSubmit={applyScenario}>
            <header>
              <div>
                <span>WHAT-IF SCENARIO</span>
                <h2>Adjust planning inputs</h2>
                <p>
                  Overrides apply to this calculation only; master data is
                  unchanged.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScenarioOpen(false)}
                aria-label="Close scenario panel"
              >
                <X size={18} />
              </button>
            </header>
            <label>
              Plant
              <select
                value={scenario.plantCode}
                onChange={(event) => {
                  const nextFgs = availableFgs.filter(
                    (row) =>
                      row.plant_code === event.target.value &&
                      (!fgCodes.length || fgCodes.includes(row.fg_code)),
                  );
                  setScenario({
                    ...scenario,
                    plantCode: event.target.value,
                    fgCode: nextFgs[0]?.fg_code || "",
                  });
                }}
              >
                {selectedPlants.map((row) => (
                  <option key={row.plant_code} value={row.plant_code}>
                    {row.plant_code} · {row.plant_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finished Good
              <select
                value={scenario.fgCode}
                onChange={(event) =>
                  setScenario({ ...scenario, fgCode: event.target.value })
                }
              >
                {availableFgs
                  .filter(
                    (row) =>
                      row.plant_code === scenario.plantCode &&
                      (!fgCodes.length || fgCodes.includes(row.fg_code)),
                  )
                  .map((row) => (
                    <option
                      key={`${row.plant_code}-${row.fg_code}`}
                      value={row.fg_code}
                    >
                      {row.fg_code} · {row.description}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Forecast bucket
              <select
                value={scenario.bucketDate}
                onChange={(event) =>
                  setScenario({ ...scenario, bucketDate: event.target.value })
                }
              >
                {(output?.buckets || []).map((row) => (
                  <option value={row.date} key={row.date}>
                    {row.label} · {row.date}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Override forecast quantity
              <input
                type="number"
                min="0"
                step="0.01"
                value={scenario.forecastQty}
                onChange={(event) =>
                  setScenario({ ...scenario, forecastQty: event.target.value })
                }
                placeholder="Leave blank to keep saved forecast"
              />
            </label>
            <label>
              Material
              <select
                value={scenario.materialCode}
                onChange={(event) =>
                  setScenario({ ...scenario, materialCode: event.target.value })
                }
              >
                {availableMaterials
                  .filter(
                    (row) =>
                      !materialCodes.length ||
                      materialCodes.includes(row.material_code),
                  )
                  .map((row) => (
                    <option key={row.material_code} value={row.material_code}>
                      {row.material_code} · {row.description}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Override on-hand quantity
              <input
                type="number"
                min="0"
                step="0.01"
                value={scenario.onHandQty}
                onChange={(event) =>
                  setScenario({ ...scenario, onHandQty: event.target.value })
                }
                placeholder="Leave blank to keep saved inventory"
              />
            </label>
            <footer>
              <button
                type="button"
                className="button secondary"
                onClick={() => setScenarioOpen(false)}
              >
                Cancel
              </button>
              <button className="button primary" disabled={loading}>
                <RefreshCw size={15} /> Recalculate scenario
              </button>
            </footer>
          </form>
        </div>
      )}
    </section>
  );
}

function MultiSelectFilter({
  label,
  allLabel,
  options,
  values,
  onChange,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const allSelected = values.length === 0 || values.length === options.length;
  const summary = allSelected
    ? allLabel
    : values.length === 1
      ? "1 selected"
      : `${values.length} selected`;
  const toggle = (value: string) => {
    const current =
      values.length === 0 ? options.map((option) => option.value) : values;
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    onChange(next.length === options.length ? [] : next);
  };
  const visible = options.filter((option) =>
    `${option.value} ${option.label}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <div className="filter-picker" ref={root}>
      <span className="filter-picker-label">{label}</span>
      <button
        type="button"
        className={`filter-picker-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        disabled={!options.length}
      >
        <span>{options.length ? summary : "No options available"}</span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="filter-picker-menu">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
          />
          <div className="filter-picker-actions">
            <button type="button" onClick={() => onChange([])}>
              Show all
            </button>
            <span>
              {allSelected ? options.length : values.length} of {options.length}
            </span>
          </div>
          <div className="filter-picker-options">
            {visible.map((option) => (
              <label key={option.value} title={option.label}>
                <input
                  type="checkbox"
                  checked={allSelected || values.includes(option.value)}
                  onChange={() => toggle(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
            {!visible.length && <p>No matches. Try another search.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
function Kpi({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <article className="forward-kpi">
      <span className={`forward-kpi-icon ${tone}`}>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function MaterialPlan({
  rows,
  expanded,
  onToggle,
}: {
  rows: MRPRow[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = rows[0];
  return (
    <>
      <tr className="forward-material-row">
        <td>{first.plantCode}</td>
        <td>
          <button
            className="material-expand"
            onClick={onToggle}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${first.materialCode}`}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <b>{first.materialCode}</b>
          </button>
        </td>
        <td>{first.description}</td>
        <td>
          <span className={`category-tag ${first.category.toLowerCase()}`}>
            {first.category}
          </span>
        </td>
        <td>{fmt(first.onHand)}</td>
        <td>
          {fmt(first.safetyStock)} /{" "}
          {first.maxCapacity === null ? "—" : fmt(first.maxCapacity)}
        </td>
        {rows.map((row) => (
          <td key={row.bucketDate}>
            <div
              className={`projected-cell ${row.capacityExceeded ? "is-capacity-over" : ""} ${row.expediteNow ? "is-expedite" : ""}`}
              title={
                row.capacityExceeded
                  ? "Plant material storage capacity exceeded"
                  : row.expediteNow
                    ? "Order release is due now or overdue"
                    : ""
              }
            >
              <strong>{fmt(row.projectedInventory)}</strong>
              {row.plannedOrders > 0 && (
                <small>+{fmt(row.plannedOrders)} order</small>
              )}
              {row.capacityExceeded && <i>Capacity</i>}
              {row.expediteNow && <i>Expedite</i>}
            </div>
          </td>
        ))}
      </tr>
      {expanded && (
        <>
          <DetailRow
            label="Gross Requirements"
            rows={rows}
            value={(row) => row.grossRequirement}
          />
          <DetailRow
            label="Scheduled Receipts"
            rows={rows}
            value={(row) => row.scheduledReceipts}
          />
          <DetailRow
            label="Net Requirements"
            rows={rows}
            value={(row) => row.netRequirement}
          />
          <DetailRow
            label="Projected Inventory"
            rows={rows}
            value={(row) => row.projectedInventory}
          />
          <DetailRow label="Planned Order Release" rows={rows} date />
        </>
      )}
    </>
  );
}

function DetailRow({
  label,
  rows,
  value,
  date = false,
}: {
  label: string;
  rows: MRPRow[];
  value?: (row: MRPRow) => number;
  date?: boolean;
}) {
  return (
    <tr className="forward-detail-row">
      <td />
      <td colSpan={5}>{label}</td>
      {rows.map((row) => (
        <td key={row.bucketDate}>
          {date ? row.orderReleaseDate || "—" : fmt(value?.(row) || 0)}
          {date && row.expediteNow && (
            <i className="detail-expedite">Expedite</i>
          )}
        </td>
      ))}
    </tr>
  );
}
