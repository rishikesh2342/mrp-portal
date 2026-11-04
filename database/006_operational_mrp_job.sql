-- Operational extensions for weekly/monthly demand, stock controls, and SQL MRP runs.
-- Apply after 002_forward_mrp.sql.
BEGIN;

ALTER TABLE mrp.inventory_on_hand
  ADD COLUMN IF NOT EXISTS reserved_qty NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  ADD COLUMN IF NOT EXISTS in_transit_qty NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (in_transit_qty >= 0),
  ADD COLUMN IF NOT EXISTS in_transit_due_date DATE,
  ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(18,4) CHECK (reorder_level IS NULL OR reorder_level >= 0);

CREATE TABLE IF NOT EXISTS mrp.plant_material_constraints (
  plant_code VARCHAR(20) NOT NULL REFERENCES mrp.plants(plant_code),
  material_code VARCHAR(50) NOT NULL REFERENCES mrp.material_master(material_code),
  min_stock_qty NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (min_stock_qty >= 0),
  reorder_level NUMERIC(18,4) CHECK (reorder_level IS NULL OR reorder_level >= 0),
  max_stock_qty NUMERIC(18,4) CHECK (max_stock_qty IS NULL OR max_stock_qty >= 0),
  max_storage_capacity NUMERIC(18,4) CHECK (max_storage_capacity IS NULL OR max_storage_capacity >= 0),
  lead_time_buckets SMALLINT CHECK (lead_time_buckets IS NULL OR lead_time_buckets >= 0),
  moq NUMERIC(18,4) CHECK (moq IS NULL OR moq >= 0),
  order_multiple NUMERIC(18,4) CHECK (order_multiple IS NULL OR order_multiple >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plant_code, material_code)
);

CREATE TABLE IF NOT EXISTS mrp.demand_actuals (
  plant_code VARCHAR(20) NOT NULL,
  fg_code VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  actual_qty NUMERIC(18,4) NOT NULL CHECK (actual_qty >= 0),
  source_file VARCHAR(255),
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plant_code, fg_code, period_start),
  FOREIGN KEY (plant_code, fg_code) REFERENCES mrp.fg_master(plant_code, fg_code)
);

CREATE INDEX IF NOT EXISTS ix_demand_actuals_period ON mrp.demand_actuals(period_start, plant_code);

-- Computes a three-month plan and stores its results in the tables used by the portal.
-- Monthly starts are normalized to the first of the month. Weekly starts use p_planning_start.
CREATE OR REPLACE FUNCTION mrp.fn_run_three_month_mrp(
  p_country_code VARCHAR(3),
  p_planning_start DATE,
  p_bucket_type VARCHAR(10) DEFAULT 'Weekly',
  p_created_by VARCHAR(100) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_id UUID;
  v_first_bucket DATE;
  v_period_end DATE;
  v_item RECORD;
  v_period RECORD;
  v_inventory mrp.inventory_on_hand%ROWTYPE;
  v_constraint mrp.plant_material_constraints%ROWTYPE;
  v_material mrp.material_master%ROWTYPE;
  v_gross NUMERIC(18,4);
  v_receipts NUMERIC(18,4);
  v_before NUMERIC(18,4);
  v_target NUMERIC(18,4);
  v_net NUMERIC(18,4);
  v_plan NUMERIC(18,4);
  v_projected NUMERIC(18,4);
  v_moq NUMERIC(18,4);
  v_multiple NUMERIC(18,4);
  v_lead SMALLINT;
  v_capacity NUMERIC(18,4);
  v_release DATE;
BEGIN
  IF p_bucket_type NOT IN ('Weekly','Monthly') THEN
    RAISE EXCEPTION 'bucket_type must be Weekly or Monthly';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mrp.countries WHERE country_code=p_country_code) THEN
    RAISE EXCEPTION 'Country % is not configured', p_country_code;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mrp.plants WHERE country_code=p_country_code AND active_flag) THEN
    RAISE EXCEPTION 'No active plants are configured for country %', p_country_code;
  END IF;

  v_first_bucket := CASE WHEN p_bucket_type='Monthly'
    THEN date_trunc('month',p_planning_start)::date ELSE p_planning_start END;
  v_period_end := CASE WHEN p_bucket_type='Monthly'
    THEN (v_first_bucket + INTERVAL '3 months')::date
    ELSE (v_first_bucket + INTERVAL '3 months')::date END;

  INSERT INTO mrp.mrp_runs
    (country_code, planning_start, horizon_months, bucket_type, scenario_inputs, created_by)
  VALUES
    (p_country_code, v_first_bucket, 3, p_bucket_type,
     jsonb_build_object('engine','fn_run_three_month_mrp','version',1), p_created_by)
  RETURNING run_id INTO v_run_id;

  DROP TABLE IF EXISTS pg_temp.tmp_mrp_periods;
  CREATE TEMP TABLE tmp_mrp_periods (
    period_index INT PRIMARY KEY, bucket_date DATE UNIQUE NOT NULL, bucket_end DATE NOT NULL
  ) ON COMMIT DROP;
  IF p_bucket_type='Monthly' THEN
    INSERT INTO tmp_mrp_periods
    SELECT row_number() OVER (ORDER BY d)::INT-1, d::date,
           (d + INTERVAL '1 month')::date
    FROM generate_series(v_first_bucket::timestamp,
         (v_first_bucket + INTERVAL '2 months')::timestamp, INTERVAL '1 month') AS d;
  ELSE
    INSERT INTO tmp_mrp_periods
    SELECT row_number() OVER (ORDER BY d)::INT-1, d::date,
           (d + INTERVAL '7 days')::date
    FROM generate_series(v_first_bucket::timestamp,
         (v_period_end - INTERVAL '1 day')::timestamp, INTERVAL '7 days') AS d;
  END IF;

  DROP TABLE IF EXISTS pg_temp.tmp_mrp_gross;
  CREATE TEMP TABLE tmp_mrp_gross ON COMMIT DROP AS
  WITH RECURSIVE exploded(plant_code,fg_code,bucket_date,material_code,required_qty,path,depth) AS (
    SELECT d.plant_code,d.fg_code,d.bucket_date,b.material_code,
           d.forecast_qty*b.ratio*(1+m.scrap_pct),
           ARRAY[b.material_code]::VARCHAR[],1
    FROM mrp.demand_forecast d
    JOIN mrp.fg_master fg ON fg.plant_code=d.plant_code AND fg.fg_code=d.fg_code AND fg.active_flag
    JOIN mrp.bom_matrix b ON b.plant_code=d.plant_code AND b.parent_fg_code=d.fg_code AND b.active_flag
      AND b.effective_from<=d.bucket_date AND (b.effective_to IS NULL OR b.effective_to>=d.bucket_date)
    JOIN mrp.material_master m ON m.material_code=b.material_code AND m.active_flag
    JOIN mrp.plants p ON p.plant_code=d.plant_code AND p.country_code=p_country_code AND p.active_flag
    JOIN tmp_mrp_periods t ON t.bucket_date=d.bucket_date
    WHERE d.forecast_qty>0
    UNION ALL
    SELECT e.plant_code,e.fg_code,e.bucket_date,b.material_code,
           e.required_qty*b.ratio*(1+m.scrap_pct),
           e.path||b.material_code,e.depth+1
    FROM exploded e
    JOIN mrp.bom_matrix b ON b.plant_code=e.plant_code AND b.parent_material_code=e.material_code AND b.active_flag
      AND b.effective_from<=e.bucket_date AND (b.effective_to IS NULL OR b.effective_to>=e.bucket_date)
    JOIN mrp.material_master m ON m.material_code=b.material_code AND m.active_flag
    WHERE e.depth<20 AND NOT b.material_code=ANY(e.path)
  )
  SELECT plant_code,material_code,bucket_date,SUM(required_qty)::NUMERIC(18,4) AS gross_qty
  FROM exploded GROUP BY plant_code,material_code,bucket_date;

  FOR v_item IN
    SELECT DISTINCT plant_code,material_code FROM tmp_mrp_gross ORDER BY plant_code,material_code
  LOOP
    SELECT * INTO v_inventory FROM mrp.inventory_on_hand
      WHERE plant_code=v_item.plant_code AND material_code=v_item.material_code;
    SELECT * INTO v_constraint FROM mrp.plant_material_constraints
      WHERE plant_code=v_item.plant_code AND material_code=v_item.material_code;
    SELECT * INTO STRICT v_material FROM mrp.material_master WHERE material_code=v_item.material_code;
    v_projected := GREATEST(0,COALESCE(v_inventory.on_hand_qty,0)-COALESCE(v_inventory.reserved_qty,0));
    v_target := GREATEST(COALESCE(v_constraint.min_stock_qty,0),COALESCE(v_constraint.reorder_level,0),
      COALESCE(v_inventory.safety_stock_min,v_material.safety_stock_min,0),COALESCE(v_inventory.reorder_level,0));
    v_capacity := COALESCE(v_constraint.max_storage_capacity,v_constraint.max_stock_qty,
      v_inventory.max_capacity,v_material.max_capacity);
    v_moq := COALESCE(v_constraint.moq,v_material.moq,0);
    v_multiple := COALESCE(v_constraint.order_multiple,v_material.order_multiple,0);
    v_lead := COALESCE(v_constraint.lead_time_buckets,v_material.lead_time_buckets,0);

    FOR v_period IN SELECT * FROM tmp_mrp_periods ORDER BY period_index LOOP
      SELECT COALESCE(gross_qty,0) INTO v_gross FROM tmp_mrp_gross
        WHERE plant_code=v_item.plant_code AND material_code=v_item.material_code AND bucket_date=v_period.bucket_date;
      v_gross := COALESCE(v_gross,0);
      SELECT COALESCE(SUM(quantity),0) INTO v_receipts FROM mrp.scheduled_receipts
        WHERE plant_code=v_item.plant_code AND material_code=v_item.material_code
          AND receipt_date>=v_period.bucket_date AND receipt_date<v_period.bucket_end;
      IF v_period.period_index=0 THEN
        v_receipts := v_receipts + COALESCE(v_inventory.scheduled_receipts,0);
      END IF;
      IF COALESCE(v_inventory.in_transit_qty,0)>0 AND
         ((v_inventory.in_transit_due_date IS NULL AND v_period.period_index=0) OR
          (v_inventory.in_transit_due_date>=v_period.bucket_date AND v_inventory.in_transit_due_date<v_period.bucket_end)) THEN
        v_receipts := v_receipts + v_inventory.in_transit_qty;
      END IF;

      v_before := v_projected + v_receipts - v_gross;
      v_net := GREATEST(0,v_target-v_before);
      IF v_net<=0 THEN v_plan:=0;
      ELSE v_plan:=GREATEST(v_net,v_moq);
      END IF;
      v_projected := v_before+v_plan;
      v_release := CASE WHEN p_bucket_type='Monthly'
        THEN (v_period.bucket_date-make_interval(months=>v_lead))::date
        ELSE (v_period.bucket_date-(v_lead*7))::date END;

      INSERT INTO mrp.mrp_results
        (run_id,plant_code,material_code,bucket_date,gross_req,scheduled_receipts,net_req,
         planned_orders,projected_inventory,order_release_date,expedite_now,capacity_exceeded_flag)
      VALUES
        (v_run_id,v_item.plant_code,v_item.material_code,v_period.bucket_date,v_gross,v_receipts,
         v_net,v_plan,v_projected,CASE WHEN v_plan>0 THEN v_release ELSE NULL END,
         v_plan>0 AND v_release<=v_first_bucket,
         v_capacity IS NOT NULL AND v_projected>v_capacity);
    END LOOP;
  END LOOP;

  RETURN v_run_id;
END;
$$;

COMMIT;
