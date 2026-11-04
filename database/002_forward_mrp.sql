-- Additive forward-planning model for the Training template - MRP workbook.
-- Scrap is stored as a fraction: 0.01 means 1% loss.
CREATE SCHEMA IF NOT EXISTS mrp;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS mrp.countries (
  country_code VARCHAR(3) PRIMARY KEY,
  country_name VARCHAR(100) NOT NULL,
  currency_code CHAR(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS mrp.plants (
  plant_code VARCHAR(20) PRIMARY KEY,
  plant_name VARCHAR(100) NOT NULL,
  country_code VARCHAR(3) NOT NULL REFERENCES mrp.countries(country_code),
  location VARCHAR(150),
  active_flag BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mrp.material_master (
  material_code VARCHAR(50) PRIMARY KEY,
  description VARCHAR(200) NOT NULL,
  category VARCHAR(20) NOT NULL CHECK (category IN ('Raw','Packing','Intermediate')),
  supply_type VARCHAR(10) NOT NULL DEFAULT 'BUY' CHECK (supply_type IN ('BUY','MAKE')),
  uom VARCHAR(20) NOT NULL,
  unit_cost NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  scrap_pct NUMERIC(8,6) NOT NULL DEFAULT 0 CHECK (scrap_pct >= 0 AND scrap_pct < 1),
  lead_time_buckets SMALLINT NOT NULL DEFAULT 0 CHECK (lead_time_buckets >= 0),
  moq NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (moq >= 0),
  order_multiple NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (order_multiple >= 0),
  safety_stock_min NUMERIC(16,4) NOT NULL DEFAULT 0 CHECK (safety_stock_min >= 0),
  max_capacity NUMERIC(16,4) CHECK (max_capacity IS NULL OR max_capacity >= 0),
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS mrp.fg_master (
  plant_code VARCHAR(20) NOT NULL REFERENCES mrp.plants(plant_code),
  fg_code VARCHAR(50) NOT NULL,
  description VARCHAR(200) NOT NULL,
  product_type VARCHAR(20) NOT NULL CHECK (product_type IN ('Bulk','Bagged')),
  uom VARCHAR(20) NOT NULL,
  active_flag BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (plant_code, fg_code)
);

-- A BOM can start at a finished good or at a make material, enabling recursive BOMs.
CREATE TABLE IF NOT EXISTS mrp.bom_matrix (
  bom_id BIGSERIAL PRIMARY KEY,
  plant_code VARCHAR(20) NOT NULL REFERENCES mrp.plants(plant_code),
  parent_fg_code VARCHAR(50),
  parent_material_code VARCHAR(50) REFERENCES mrp.material_master(material_code),
  material_code VARCHAR(50) NOT NULL REFERENCES mrp.material_master(material_code),
  ratio NUMERIC(18,8) NOT NULL CHECK (ratio > 0),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  active_flag BOOLEAN NOT NULL DEFAULT TRUE,
  FOREIGN KEY (plant_code, parent_fg_code) REFERENCES mrp.fg_master(plant_code, fg_code),
  CHECK ((parent_fg_code IS NULL) <> (parent_material_code IS NULL)),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS ix_bom_matrix_parent ON mrp.bom_matrix(plant_code, parent_fg_code, parent_material_code) WHERE active_flag;

CREATE TABLE IF NOT EXISTS mrp.demand_forecast (
  forecast_id BIGSERIAL PRIMARY KEY,
  plant_code VARCHAR(20) NOT NULL,
  fg_code VARCHAR(50) NOT NULL,
  bucket_date DATE NOT NULL,
  forecast_qty NUMERIC(18,4) NOT NULL CHECK (forecast_qty >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (plant_code, fg_code) REFERENCES mrp.fg_master(plant_code, fg_code),
  UNIQUE (plant_code, fg_code, bucket_date)
);
CREATE INDEX IF NOT EXISTS ix_demand_forecast_period ON mrp.demand_forecast(plant_code, bucket_date);

-- The single scheduled_receipts value is the near-term/open inbound balance from the workbook.
-- Future dated receipts are stored separately so the bucket netting remains normalized.
CREATE TABLE IF NOT EXISTS mrp.inventory_on_hand (
  plant_code VARCHAR(20) NOT NULL REFERENCES mrp.plants(plant_code),
  material_code VARCHAR(50) NOT NULL REFERENCES mrp.material_master(material_code),
  on_hand_qty NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
  scheduled_receipts NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (scheduled_receipts >= 0),
  safety_stock_min NUMERIC(18,4) CHECK (safety_stock_min IS NULL OR safety_stock_min >= 0),
  max_capacity NUMERIC(18,4) CHECK (max_capacity IS NULL OR max_capacity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plant_code, material_code)
);

CREATE TABLE IF NOT EXISTS mrp.scheduled_receipts (
  receipt_id BIGSERIAL PRIMARY KEY,
  plant_code VARCHAR(20) NOT NULL,
  material_code VARCHAR(50) NOT NULL,
  receipt_date DATE NOT NULL,
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  reference_no VARCHAR(100),
  FOREIGN KEY (plant_code, material_code) REFERENCES mrp.inventory_on_hand(plant_code, material_code)
);

CREATE TABLE IF NOT EXISTS mrp.mrp_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code VARCHAR(3) NOT NULL REFERENCES mrp.countries(country_code),
  planning_start DATE NOT NULL,
  horizon_months SMALLINT NOT NULL CHECK (horizon_months IN (3,6,12)),
  bucket_type VARCHAR(10) NOT NULL CHECK (bucket_type IN ('Monthly','Weekly')),
  scenario_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(100)
);
ALTER TABLE mrp.mrp_runs ADD COLUMN IF NOT EXISTS scenario_inputs JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS mrp.mrp_results (
  result_id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES mrp.mrp_runs(run_id) ON DELETE CASCADE,
  plant_code VARCHAR(20) NOT NULL REFERENCES mrp.plants(plant_code),
  material_code VARCHAR(50) NOT NULL REFERENCES mrp.material_master(material_code),
  bucket_date DATE NOT NULL,
  gross_req NUMERIC(18,4) NOT NULL DEFAULT 0,
  scheduled_receipts NUMERIC(18,4) NOT NULL DEFAULT 0,
  net_req NUMERIC(18,4) NOT NULL DEFAULT 0,
  planned_orders NUMERIC(18,4) NOT NULL DEFAULT 0,
  projected_inventory NUMERIC(18,4) NOT NULL DEFAULT 0,
  order_release_date DATE,
  expedite_now BOOLEAN NOT NULL DEFAULT FALSE,
  capacity_exceeded_flag BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (run_id, plant_code, material_code, bucket_date)
);
CREATE INDEX IF NOT EXISTS ix_mrp_results_run_bucket ON mrp.mrp_results(run_id, bucket_date, plant_code);
