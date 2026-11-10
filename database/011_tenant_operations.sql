-- Tenant-scoped purchasing and production planning records.
BEGIN;

CREATE TABLE IF NOT EXISTS mrp.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  po_number VARCHAR(40) NOT NULL,
  po_date DATE NOT NULL,
  supplier_name VARCHAR(200) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  reference_no VARCHAR(120) NOT NULL DEFAULT '',
  payment_terms VARCHAR(80) NOT NULL DEFAULT '',
  delivery_terms VARCHAR(120) NOT NULL DEFAULT '',
  ship_to_location VARCHAR(160) NOT NULL DEFAULT '',
  expected_delivery_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Draft','Sent','Confirmed','Partially Received','Completed','Cancelled','Open')),
  remarks TEXT NOT NULL DEFAULT '',
  created_by VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, po_number),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS mrp.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  purchase_order_id UUID NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  material_code VARCHAR(50) NOT NULL DEFAULT '',
  material_name VARCHAR(200) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  received_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= quantity),
  unit_price NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  expected_delivery_date DATE,
  UNIQUE (tenant_id, purchase_order_id, line_number),
  FOREIGN KEY (tenant_id, purchase_order_id)
    REFERENCES mrp.purchase_orders(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mrp.production_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(tenant_id),
  plan_number VARCHAR(40) NOT NULL,
  period_label VARCHAR(40) NOT NULL,
  product_code VARCHAR(50) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  planned_quantity NUMERIC(18,4) NOT NULL CHECK (planned_quantity > 0),
  produced_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (produced_quantity >= 0),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  priority VARCHAR(10) NOT NULL CHECK (priority IN ('High','Medium','Low')),
  status VARCHAR(30) NOT NULL DEFAULT 'Planned'
    CHECK (status IN ('Draft','Planned','In Production','Completed','Delayed')),
  production_type VARCHAR(30) NOT NULL DEFAULT 'Make to Stock',
  target_stock_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (target_stock_quantity >= 0),
  description TEXT NOT NULL DEFAULT '',
  production_line VARCHAR(120) NOT NULL DEFAULT '',
  shift_name VARCHAR(60) NOT NULL DEFAULT '',
  demands JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  UNIQUE (tenant_id, plan_number),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ix_purchase_orders_tenant_date
  ON mrp.purchase_orders(tenant_id, po_date DESC);
CREATE INDEX IF NOT EXISTS ix_purchase_order_items_parent
  ON mrp.purchase_order_items(tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS ix_production_plans_tenant_created
  ON mrp.production_plans(tenant_id, created_at DESC);

DO $$
DECLARE tenant_schema TEXT;
BEGIN
  FOR tenant_schema IN SELECT schema_name FROM public.tenants WHERE schema_name IS NOT NULL LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.purchase_orders (LIKE mrp.purchase_orders INCLUDING ALL)', tenant_schema);
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.purchase_order_items (LIKE mrp.purchase_order_items INCLUDING ALL)', tenant_schema);
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I.production_plans (LIKE mrp.production_plans INCLUDING ALL)', tenant_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_purchase_orders_tenant_date ON %I.purchase_orders(tenant_id, po_date DESC)', tenant_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_purchase_order_items_parent ON %I.purchase_order_items(tenant_id, purchase_order_id)', tenant_schema);
    EXECUTE format('CREATE INDEX IF NOT EXISTS ix_production_plans_tenant_created ON %I.production_plans(tenant_id, created_at DESC)', tenant_schema);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_purchase_orders_tenant_fk' AND conrelid=format('%I.purchase_orders',tenant_schema)::regclass) THEN
      EXECUTE format('ALTER TABLE %I.purchase_orders ADD CONSTRAINT tenant_purchase_orders_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id)', tenant_schema);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_purchase_order_items_tenant_fk' AND conrelid=format('%I.purchase_order_items',tenant_schema)::regclass) THEN
      EXECUTE format('ALTER TABLE %I.purchase_order_items ADD CONSTRAINT tenant_purchase_order_items_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id)', tenant_schema);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_po_items_header_fk' AND conrelid=format('%I.purchase_order_items',tenant_schema)::regclass) THEN
      EXECUTE format('ALTER TABLE %I.purchase_order_items ADD CONSTRAINT tenant_po_items_header_fk FOREIGN KEY(tenant_id,purchase_order_id) REFERENCES %I.purchase_orders(tenant_id,id) ON DELETE CASCADE', tenant_schema, tenant_schema);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_production_plans_tenant_fk' AND conrelid=format('%I.production_plans',tenant_schema)::regclass) THEN
      EXECUTE format('ALTER TABLE %I.production_plans ADD CONSTRAINT tenant_production_plans_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id)', tenant_schema);
    END IF;
  END LOOP;
END $$;

INSERT INTO public.schema_migrations(version) VALUES ('011_tenant_operations')
ON CONFLICT (version) DO NOTHING;

COMMIT;
