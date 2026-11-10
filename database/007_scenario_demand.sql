-- Scenario-aware demand imports from changing sales/forecast workbooks.
-- Each imported sheet is retained as an independent scenario/version. The
-- dimensions JSONB column keeps source hierarchy fields without requiring a
-- schema change when workbook columns are added or renamed.
BEGIN;

CREATE TABLE IF NOT EXISTS mrp.demand_scenario_imports (
  import_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255) NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_sheet VARCHAR(255) NOT NULL,
  scenario_name VARCHAR(255) NOT NULL,
  scenario_type VARCHAR(30) NOT NULL DEFAULT 'custom_forecast',
  bucket_type VARCHAR(10) NOT NULL CHECK (bucket_type IN ('Monthly','Weekly')),
  date_format VARCHAR(10) NOT NULL DEFAULT 'DMY',
  imported_rows INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  import_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE mrp.demand_scenario_imports
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS mrp.demand_scenario_forecasts (
  scenario_forecast_id BIGSERIAL PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES mrp.demand_scenario_imports(import_id) ON DELETE CASCADE,
  plant_code VARCHAR(20) NOT NULL REFERENCES mrp.plants(plant_code),
  fg_code VARCHAR(50) NOT NULL,
  bucket_date DATE NOT NULL,
  forecast_qty NUMERIC(18,4) NOT NULL,
  uom VARCHAR(20),
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  dimension_key TEXT NOT NULL DEFAULT '',
  source_row_number INTEGER,
  FOREIGN KEY (plant_code, fg_code) REFERENCES mrp.fg_master(plant_code, fg_code),
  UNIQUE (import_id, plant_code, fg_code, bucket_date, dimension_key)
);
-- Reference actuals can legitimately contain negative adjustments/returns.
-- Forecast rows are validated as non-negative by the importer.
ALTER TABLE mrp.demand_scenario_forecasts
  DROP CONSTRAINT IF EXISTS demand_scenario_forecasts_forecast_qty_check;

CREATE INDEX IF NOT EXISTS ix_demand_scenario_imported
  ON mrp.demand_scenario_imports(imported_at DESC, scenario_type);
CREATE INDEX IF NOT EXISTS ix_demand_scenario_forecasts_period
  ON mrp.demand_scenario_forecasts(import_id, plant_code, bucket_date, fg_code);
CREATE INDEX IF NOT EXISTS ix_demand_scenario_forecasts_dimensions
  ON mrp.demand_scenario_forecasts USING GIN (dimensions);

COMMIT;
