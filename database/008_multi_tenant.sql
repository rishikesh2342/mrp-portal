-- Shared-database multi-tenancy for independent customer workspaces.
-- Existing demo data is retained under the Holcim Group tenant.
BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name VARCHAR(160) NOT NULL,
  tenant_slug VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO public.tenants(tenant_id, tenant_name, tenant_slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Holcim Group', 'holcim-group')
ON CONFLICT (tenant_slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tenant_users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','planner','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_flag BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS public.tenant_sessions (
  session_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.tenant_users(user_id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tenant_sessions_expiry ON public.tenant_sessions(expires_at);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenants, public.tenant_users, public.tenant_sessions FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    EXECUTE 'REVOKE ALL ON public.tenants, public.tenant_users, public.tenant_sessions FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    EXECUTE 'REVOKE ALL ON public.tenants, public.tenant_users, public.tenant_sessions FROM authenticated';
  END IF;
END $$;

-- Add tenant ownership to every operational table, retaining the old data in
-- the default workspace. Country and supplier reference catalogs stay shared.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'plants','material_master','fg_master','bom_matrix','demand_forecast',
    'inventory_on_hand','scheduled_receipts','mrp_runs','mrp_results',
    'plant_material_constraints','demand_actuals',
    'demand_scenario_imports','demand_scenario_forecasts'
  ] LOOP
    IF to_regclass('mrp.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE mrp.%I ADD COLUMN IF NOT EXISTS tenant_id UUID', table_name);
      EXECUTE format('UPDATE mrp.%I SET tenant_id=$1 WHERE tenant_id IS NULL', table_name)
        USING '00000000-0000-0000-0000-000000000001'::UUID;
      EXECUTE format('ALTER TABLE mrp.%I ALTER COLUMN tenant_id SET NOT NULL', table_name);
      EXECUTE format('ALTER TABLE mrp.%I DROP CONSTRAINT IF EXISTS %I', table_name, table_name || '_tenant_id_fkey');
      EXECUTE format('ALTER TABLE mrp.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id)',
        table_name, table_name || '_tenant_id_fkey');
      EXECUTE format('ALTER TABLE mrp.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON mrp.%I FROM PUBLIC', table_name);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        EXECUTE format('REVOKE ALL ON mrp.%I FROM anon', table_name);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        EXECUTE format('REVOKE ALL ON mrp.%I FROM authenticated', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Drop the constraints this migration recreates so the migration is safe to run
-- automatically at every service start.
ALTER TABLE mrp.plants DROP CONSTRAINT IF EXISTS plants_tenant_plant_uq;
ALTER TABLE mrp.material_master DROP CONSTRAINT IF EXISTS material_master_tenant_material_uq;
ALTER TABLE mrp.fg_master DROP CONSTRAINT IF EXISTS fg_tenant_plant_fkey;
ALTER TABLE mrp.fg_master DROP CONSTRAINT IF EXISTS fg_master_tenant_plant_fg_uq;
ALTER TABLE mrp.bom_matrix
  DROP CONSTRAINT IF EXISTS bom_tenant_plant_fkey,
  DROP CONSTRAINT IF EXISTS bom_tenant_parent_fg_fkey,
  DROP CONSTRAINT IF EXISTS bom_tenant_parent_material_fkey,
  DROP CONSTRAINT IF EXISTS bom_tenant_material_fkey;
ALTER TABLE mrp.demand_forecast
  DROP CONSTRAINT IF EXISTS demand_forecast_tenant_plant_fg_fkey,
  DROP CONSTRAINT IF EXISTS demand_forecast_tenant_period_uq;
ALTER TABLE mrp.inventory_on_hand
  DROP CONSTRAINT IF EXISTS inventory_tenant_plant_fkey,
  DROP CONSTRAINT IF EXISTS inventory_tenant_material_fkey;
ALTER TABLE mrp.scheduled_receipts DROP CONSTRAINT IF EXISTS receipts_tenant_inventory_fkey;
ALTER TABLE mrp.plant_material_constraints
  DROP CONSTRAINT IF EXISTS constraints_tenant_plant_fkey,
  DROP CONSTRAINT IF EXISTS constraints_tenant_material_fkey;
ALTER TABLE mrp.demand_actuals DROP CONSTRAINT IF EXISTS actuals_tenant_fg_fkey;
ALTER TABLE mrp.mrp_results
  DROP CONSTRAINT IF EXISTS results_tenant_plant_fkey,
  DROP CONSTRAINT IF EXISTS results_tenant_material_fkey;
ALTER TABLE mrp.demand_scenario_forecasts
  DROP CONSTRAINT IF EXISTS scenario_forecast_tenant_plant_fkey,
  DROP CONSTRAINT IF EXISTS scenario_forecast_tenant_fg_fkey,
  DROP CONSTRAINT IF EXISTS scenario_forecast_tenant_import_fkey;
ALTER TABLE mrp.mrp_results DROP CONSTRAINT IF EXISTS results_tenant_run_fkey;
ALTER TABLE mrp.demand_scenario_imports DROP CONSTRAINT IF EXISTS scenario_imports_tenant_import_uq;
ALTER TABLE mrp.mrp_runs DROP CONSTRAINT IF EXISTS mrp_runs_tenant_run_uq;

-- Replace globally unique master keys with tenant-local keys.
ALTER TABLE mrp.plants DROP CONSTRAINT IF EXISTS plants_pkey CASCADE;
ALTER TABLE mrp.plants ADD CONSTRAINT plants_pkey PRIMARY KEY (tenant_id, plant_code);
ALTER TABLE mrp.plants ADD CONSTRAINT plants_tenant_plant_uq UNIQUE (tenant_id, plant_code);

ALTER TABLE mrp.material_master DROP CONSTRAINT IF EXISTS material_master_pkey CASCADE;
ALTER TABLE mrp.material_master ADD CONSTRAINT material_master_pkey PRIMARY KEY (tenant_id, material_code);
ALTER TABLE mrp.material_master ADD CONSTRAINT material_master_tenant_material_uq UNIQUE (tenant_id, material_code);

ALTER TABLE mrp.fg_master DROP CONSTRAINT IF EXISTS fg_master_pkey CASCADE;
ALTER TABLE mrp.fg_master ADD CONSTRAINT fg_master_pkey PRIMARY KEY (tenant_id, plant_code, fg_code);
ALTER TABLE mrp.fg_master ADD CONSTRAINT fg_master_tenant_plant_fg_uq UNIQUE (tenant_id, plant_code, fg_code);
ALTER TABLE mrp.fg_master ADD CONSTRAINT fg_tenant_plant_fkey FOREIGN KEY (tenant_id, plant_code) REFERENCES mrp.plants(tenant_id, plant_code);

ALTER TABLE mrp.bom_matrix
  ADD CONSTRAINT bom_tenant_plant_fkey FOREIGN KEY (tenant_id, plant_code) REFERENCES mrp.plants(tenant_id, plant_code),
  ADD CONSTRAINT bom_tenant_parent_fg_fkey FOREIGN KEY (tenant_id, plant_code, parent_fg_code) REFERENCES mrp.fg_master(tenant_id, plant_code, fg_code),
  ADD CONSTRAINT bom_tenant_parent_material_fkey FOREIGN KEY (tenant_id, parent_material_code) REFERENCES mrp.material_master(tenant_id, material_code),
  ADD CONSTRAINT bom_tenant_material_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES mrp.material_master(tenant_id, material_code);

ALTER TABLE mrp.demand_forecast
  DROP CONSTRAINT IF EXISTS demand_forecast_plant_code_fg_code_bucket_date_key,
  ADD CONSTRAINT demand_forecast_tenant_plant_fg_fkey FOREIGN KEY (tenant_id, plant_code, fg_code) REFERENCES mrp.fg_master(tenant_id, plant_code, fg_code),
  ADD CONSTRAINT demand_forecast_tenant_period_uq UNIQUE (tenant_id, plant_code, fg_code, bucket_date);

ALTER TABLE mrp.inventory_on_hand DROP CONSTRAINT IF EXISTS inventory_on_hand_pkey CASCADE;
ALTER TABLE mrp.inventory_on_hand ADD CONSTRAINT inventory_on_hand_pkey PRIMARY KEY (tenant_id, plant_code, material_code);
ALTER TABLE mrp.inventory_on_hand
  ADD CONSTRAINT inventory_tenant_plant_fkey FOREIGN KEY (tenant_id, plant_code) REFERENCES mrp.plants(tenant_id, plant_code),
  ADD CONSTRAINT inventory_tenant_material_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES mrp.material_master(tenant_id, material_code);

ALTER TABLE mrp.scheduled_receipts
  ADD CONSTRAINT receipts_tenant_inventory_fkey FOREIGN KEY (tenant_id, plant_code, material_code) REFERENCES mrp.inventory_on_hand(tenant_id, plant_code, material_code);

ALTER TABLE mrp.plant_material_constraints DROP CONSTRAINT IF EXISTS plant_material_constraints_pkey CASCADE;
ALTER TABLE mrp.plant_material_constraints ADD CONSTRAINT plant_material_constraints_pkey PRIMARY KEY (tenant_id, plant_code, material_code);
ALTER TABLE mrp.plant_material_constraints
  ADD CONSTRAINT constraints_tenant_plant_fkey FOREIGN KEY (tenant_id, plant_code) REFERENCES mrp.plants(tenant_id, plant_code),
  ADD CONSTRAINT constraints_tenant_material_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES mrp.material_master(tenant_id, material_code);

ALTER TABLE mrp.demand_actuals DROP CONSTRAINT IF EXISTS demand_actuals_pkey CASCADE;
ALTER TABLE mrp.demand_actuals ADD CONSTRAINT demand_actuals_pkey PRIMARY KEY (tenant_id, plant_code, fg_code, period_start);
ALTER TABLE mrp.demand_actuals
  ADD CONSTRAINT actuals_tenant_fg_fkey FOREIGN KEY (tenant_id, plant_code, fg_code) REFERENCES mrp.fg_master(tenant_id, plant_code, fg_code);

ALTER TABLE mrp.mrp_results
  ADD CONSTRAINT results_tenant_plant_fkey FOREIGN KEY (tenant_id, plant_code) REFERENCES mrp.plants(tenant_id, plant_code),
  ADD CONSTRAINT results_tenant_material_fkey FOREIGN KEY (tenant_id, material_code) REFERENCES mrp.material_master(tenant_id, material_code);

ALTER TABLE mrp.demand_scenario_imports ADD CONSTRAINT scenario_imports_tenant_import_uq UNIQUE (tenant_id, import_id);
ALTER TABLE mrp.demand_scenario_forecasts
  ADD CONSTRAINT scenario_forecast_tenant_plant_fkey FOREIGN KEY (tenant_id, plant_code) REFERENCES mrp.plants(tenant_id, plant_code),
  ADD CONSTRAINT scenario_forecast_tenant_fg_fkey FOREIGN KEY (tenant_id, plant_code, fg_code) REFERENCES mrp.fg_master(tenant_id, plant_code, fg_code),
  ADD CONSTRAINT scenario_forecast_tenant_import_fkey FOREIGN KEY (tenant_id, import_id) REFERENCES mrp.demand_scenario_imports(tenant_id, import_id);
ALTER TABLE mrp.mrp_runs ADD CONSTRAINT mrp_runs_tenant_run_uq UNIQUE (tenant_id, run_id);
ALTER TABLE mrp.mrp_results
  ADD CONSTRAINT results_tenant_run_fkey FOREIGN KEY (tenant_id, run_id) REFERENCES mrp.mrp_runs(tenant_id, run_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ix_plants_tenant ON mrp.plants(tenant_id, country_code, active_flag);
CREATE INDEX IF NOT EXISTS ix_materials_tenant ON mrp.material_master(tenant_id, active_flag, material_code);
CREATE INDEX IF NOT EXISTS ix_runs_tenant_created ON mrp.mrp_runs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_scenario_imports_tenant ON mrp.demand_scenario_imports(tenant_id, is_active, imported_at DESC);

INSERT INTO public.schema_migrations(version) VALUES ('008_multi_tenant')
ON CONFLICT (version) DO NOTHING;

COMMIT;
