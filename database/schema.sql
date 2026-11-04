-- =============================================================================
-- FILE: 01_mrp_schema_and_procedures.sql
-- PURPOSE: Create MRP schema, DDL tables, indexes, functions, and procedures
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS mrp;

-- -----------------------------------------------------------------------------
-- 1. TABLES CREATION
-- -----------------------------------------------------------------------------

-- Plants Master
CREATE TABLE IF NOT EXISTS mrp.dim_plant (
    plant_id SERIAL PRIMARY KEY,
    plant_code VARCHAR(20) UNIQUE NOT NULL,
    plant_name VARCHAR(100) NOT NULL,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Material Master
CREATE TABLE IF NOT EXISTS mrp.dim_material (
    material_id SERIAL PRIMARY KEY,
    material_code VARCHAR(50) UNIQUE NOT NULL,
    material_description VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sub_category VARCHAR(50),
    uom VARCHAR(20) NOT NULL,
    unit_cost NUMERIC(14,2) DEFAULT 0.00,
    scrap_percentage NUMERIC(5,4) DEFAULT 0.0000,
    lead_time_days INT DEFAULT 0,
    moq NUMERIC(14,2) DEFAULT 0.00,
    order_multiple NUMERIC(14,2) DEFAULT 1.00,
    safety_stock_qty NUMERIC(14,2) DEFAULT 0.00,
    min_stock_level NUMERIC(14,2) DEFAULT 0.00,
    max_stock_level NUMERIC(14,2) DEFAULT 0.00,
    preferred_warehouse VARCHAR(100),
    storage_bin VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Finished Goods Master
CREATE TABLE IF NOT EXISTS mrp.dim_finished_good (
    fg_id SERIAL PRIMARY KEY,
    fg_code VARCHAR(50) UNIQUE NOT NULL,
    fg_name VARCHAR(200) NOT NULL,
    product_type VARCHAR(50) NOT NULL,
    category VARCHAR(50),
    sub_category VARCHAR(50),
    uom VARCHAR(20) NOT NULL,
    default_bom_code VARCHAR(50),
    planning_method VARCHAR(50) DEFAULT 'Make to Stock',
    safety_stock NUMERIC(14,2) DEFAULT 0.00,
    reorder_level NUMERIC(14,2) DEFAULT 0.00,
    lead_time_days INT DEFAULT 0,
    moq NUMERIC(14,2) DEFAULT 0.00,
    order_multiple NUMERIC(14,2) DEFAULT 1.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bill of Materials (BOM)
CREATE TABLE IF NOT EXISTS mrp.dim_bom (
    bom_id SERIAL PRIMARY KEY,
    bom_code VARCHAR(50) NOT NULL,
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    fg_id INT REFERENCES mrp.dim_finished_good(fg_id),
    material_id INT REFERENCES mrp.dim_material(material_id),
    consumption_rate NUMERIC(14,6) NOT NULL,
    uom VARCHAR(20) NOT NULL,
    bom_level INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_bom_item UNIQUE (plant_id, fg_id, material_id)
);

-- Suppliers Master
CREATE TABLE IF NOT EXISTS mrp.dim_supplier (
    supplier_id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE NOT NULL,
    supplier_name VARCHAR(200) NOT NULL,
    supplier_type VARCHAR(50),
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(30),
    location VARCHAR(100),
    lead_time_days INT DEFAULT 0,
    min_order_value NUMERIC(14,2) DEFAULT 0.00,
    payment_terms VARCHAR(50),
    quality_rating NUMERIC(3,2) DEFAULT 5.00,
    on_time_delivery_pct NUMERIC(5,2) DEFAULT 100.00,
    rejection_rate_pct NUMERIC(5,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Balances
CREATE TABLE IF NOT EXISTS mrp.fact_inventory_balance (
    inventory_id SERIAL PRIMARY KEY,
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    material_id INT REFERENCES mrp.dim_material(material_id),
    opening_stock NUMERIC(14,2) DEFAULT 0.00,
    current_stock NUMERIC(14,2) DEFAULT 0.00,
    reserved_stock NUMERIC(14,2) DEFAULT 0.00,
    in_transit_stock NUMERIC(14,2) DEFAULT 0.00,
    on_order_stock NUMERIC(14,2) DEFAULT 0.00,
    last_receipt_date DATE,
    last_issue_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_plant_material_inv UNIQUE (plant_id, material_id)
);

-- Sales Forecast / Demand
CREATE TABLE IF NOT EXISTS mrp.fact_sales_forecast (
    forecast_id SERIAL PRIMARY KEY,
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    fg_id INT REFERENCES mrp.dim_finished_good(fg_id),
    period_date DATE NOT NULL,
    forecast_quantity NUMERIC(14,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_plant_fg_period UNIQUE (plant_id, fg_id, period_date)
);

-- Production Plan
CREATE TABLE IF NOT EXISTS mrp.fact_production_plan (
    plan_id SERIAL PRIMARY KEY,
    plan_no VARCHAR(50) UNIQUE NOT NULL,
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    fg_id INT REFERENCES mrp.dim_finished_good(fg_id),
    planning_period_date DATE NOT NULL,
    planned_qty NUMERIC(14,2) NOT NULL,
    produced_qty NUMERIC(14,2) DEFAULT 0.00,
    start_date DATE,
    end_date DATE,
    priority VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(30) DEFAULT 'Planned',
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Orders (Header)
CREATE TABLE IF NOT EXISTS mrp.fact_purchase_order (
    po_id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    po_date DATE NOT NULL,
    supplier_id INT REFERENCES mrp.dim_supplier(supplier_id),
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    total_qty NUMERIC(14,2) DEFAULT 0.00,
    received_qty NUMERIC(14,2) DEFAULT 0.00,
    pending_qty NUMERIC(14,2) DEFAULT 0.00,
    total_value NUMERIC(16,2) DEFAULT 0.00,
    expected_delivery_date DATE,
    status VARCHAR(30) DEFAULT 'Draft',
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS mrp.fact_po_item (
    po_item_id SERIAL PRIMARY KEY,
    po_id INT REFERENCES mrp.fact_purchase_order(po_id) ON DELETE CASCADE,
    material_id INT REFERENCES mrp.dim_material(material_id),
    ordered_qty NUMERIC(14,2) NOT NULL,
    received_qty NUMERIC(14,2) DEFAULT 0.00,
    pending_qty NUMERIC(14,2) NOT NULL,
    unit_price NUMERIC(14,2) NOT NULL,
    total_price NUMERIC(16,2) NOT NULL,
    expected_delivery_date DATE,
    status VARCHAR(30) DEFAULT 'Open'
);

-- Gross Requirements Staging Table
CREATE TABLE IF NOT EXISTS mrp.fact_gross_requirements (
    gross_req_id SERIAL PRIMARY KEY,
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    material_id INT REFERENCES mrp.dim_material(material_id),
    period_date DATE NOT NULL,
    gross_quantity NUMERIC(14,2) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL,
    total_value NUMERIC(16,2) GENERATED ALWAYS AS (gross_quantity * unit_cost) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MRP Item Requirement Output Table
CREATE TABLE IF NOT EXISTS mrp.fact_mrp_item_requirement (
    requirement_id SERIAL PRIMARY KEY,
    mrp_run_code VARCHAR(50),
    plant_id INT REFERENCES mrp.dim_plant(plant_id),
    fg_id INT REFERENCES mrp.dim_finished_good(fg_id),
    material_id INT REFERENCES mrp.dim_material(material_id),
    period_date DATE NOT NULL,
    gross_requirement NUMERIC(14,2) DEFAULT 0.00,
    scheduled_receipts NUMERIC(14,2) DEFAULT 0.00,
    projected_available NUMERIC(14,2) DEFAULT 0.00,
    net_requirement NUMERIC(14,2) DEFAULT 0.00,
    suggested_po_qty NUMERIC(14,2) DEFAULT 0.00,
    suggested_po_date DATE,
    preferred_supplier_id INT REFERENCES mrp.dim_supplier(supplier_id),
    priority VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(30) DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 2. STORED FUNCTIONS & PROCEDURES
-- -----------------------------------------------------------------------------

-- Dashboard Summary KPI Function
CREATE OR REPLACE FUNCTION mrp.fn_get_dashboard_summary(
    p_plant_id INT DEFAULT NULL,
    p_period_date DATE DEFAULT NULL
)
RETURNS TABLE (
    total_materials BIGINT,
    open_pos BIGINT,
    materials_at_risk BIGINT,
    inventory_value_cr NUMERIC(16,4),
    in_stock_pct NUMERIC(5,2),
    low_stock_pct NUMERIC(5,2),
    out_of_stock_pct NUMERIC(5,2),
    excess_stock_pct NUMERIC(5,2)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH stock_calc AS (
        SELECT 
            m.material_id,
            COALESCE(ib.current_stock, 0) AS stock,
            m.safety_stock_qty,
            m.unit_cost,
            CASE 
                WHEN COALESCE(ib.current_stock, 0) = 0 THEN 'OUT_OF_STOCK'
                WHEN COALESCE(ib.current_stock, 0) < m.safety_stock_qty THEN 'LOW_STOCK'
                WHEN COALESCE(ib.current_stock, 0) > (m.safety_stock_qty * 3) THEN 'EXCESS_STOCK'
                ELSE 'IN_STOCK'
            END AS status_category
        FROM mrp.dim_material m
        LEFT JOIN mrp.fact_inventory_balance ib ON m.material_id = ib.material_id
            AND (p_plant_id IS NULL OR ib.plant_id = p_plant_id)
        WHERE m.is_active = TRUE
    )
    SELECT 
        COUNT(s.material_id)::BIGINT AS total_materials,
        (
            SELECT COUNT(*)::BIGINT 
            FROM mrp.fact_purchase_order po 
            WHERE po.status IN ('Draft', 'Sent', 'Confirmed', 'Open')
              AND (p_plant_id IS NULL OR po.plant_id = p_plant_id)
        ) AS open_pos,
        COUNT(CASE WHEN s.status_category IN ('LOW_STOCK', 'OUT_OF_STOCK') THEN 1 END)::BIGINT AS materials_at_risk,
        ROUND((SUM(s.stock * s.unit_cost) / 10000000.0), 4)::NUMERIC(16,4) AS inventory_value_cr,
        ROUND((COUNT(CASE WHEN s.status_category = 'IN_STOCK' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS in_stock_pct,
        ROUND((COUNT(CASE WHEN s.status_category = 'LOW_STOCK' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS low_stock_pct,
        ROUND((COUNT(CASE WHEN s.status_category = 'OUT_OF_STOCK' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS out_of_stock_pct,
        ROUND((COUNT(CASE WHEN s.status_category = 'EXCESS_STOCK' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS excess_stock_pct
    FROM stock_calc s;
END;
$$;

-- Material Requirements List Grid Function
CREATE OR REPLACE FUNCTION mrp.fn_get_material_requirements_grid(
    p_period_date DATE DEFAULT NULL,
    p_fg_id INT DEFAULT NULL,
    p_material_id INT DEFAULT NULL,
    p_status VARCHAR DEFAULT NULL,
    p_priority VARCHAR DEFAULT NULL,
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    requirement_id INT,
    mrp_run_code VARCHAR(50),
    period_date DATE,
    material_code VARCHAR(50),
    material_name VARCHAR(200),
    product_code VARCHAR(50),
    required_qty NUMERIC(14,2),
    available_qty NUMERIC(14,2),
    net_requirement NUMERIC(14,2),
    suggested_po_qty NUMERIC(14,2),
    priority VARCHAR(20),
    status VARCHAR(30)
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.requirement_id,
        r.mrp_run_code,
        r.period_date,
        m.material_code,
        m.material_description AS material_name,
        COALESCE(fg.fg_code, 'N/A') AS product_code,
        r.gross_requirement AS required_qty,
        r.projected_available AS available_qty,
        r.net_requirement,
        r.suggested_po_qty,
        r.priority,
        r.status
    FROM mrp.fact_mrp_item_requirement r
    JOIN mrp.dim_material m ON r.material_id = m.material_id
    LEFT JOIN mrp.dim_finished_good fg ON r.fg_id = fg.fg_id
    WHERE (p_period_date IS NULL OR r.period_date = p_period_date)
      AND (p_fg_id IS NULL OR r.fg_id = p_fg_id)
      AND (p_material_id IS NULL OR r.material_id = p_material_id)
      AND (p_status IS NULL OR r.status = p_status)
      AND (p_priority IS NULL OR r.priority = p_priority)
    ORDER BY r.requirement_id DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Production Plan Summary Function
CREATE OR REPLACE FUNCTION mrp.fn_get_production_plan_overview(
    p_plant_id INT DEFAULT NULL,
    p_period_date DATE DEFAULT NULL
)
RETURNS TABLE (
    total_plans BIGINT,
    planned_production NUMERIC(14,2),
    in_production NUMERIC(14,2),
    completed NUMERIC(14,2),
    delayed_plans BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::BIGINT AS total_plans,
        COALESCE(SUM(planned_qty), 0) AS planned_production,
        COALESCE(SUM(CASE WHEN status = 'In Production' THEN planned_qty ELSE 0 END), 0) AS in_production,
        COALESCE(SUM(CASE WHEN status = 'Completed' THEN produced_qty ELSE 0 END), 0) AS completed,
        COUNT(CASE WHEN status = 'Delayed' THEN 1 END)::BIGINT AS delayed_plans
    FROM mrp.fact_production_plan
    WHERE (p_plant_id IS NULL OR plant_id = p_plant_id)
      AND (p_period_date IS NULL OR planning_period_date = p_period_date);
END;
$$;

-- Supplier Scorecard Analytics Function
CREATE OR REPLACE FUNCTION mrp.fn_get_supplier_performance(
    p_supplier_id INT
)
RETURNS TABLE (
    supplier_code VARCHAR(50),
    supplier_name VARCHAR(200),
    lead_time_days INT,
    min_order_value NUMERIC(14,2),
    payment_terms VARCHAR(50),
    quality_rating NUMERIC(3,2),
    on_time_delivery_pct NUMERIC(5,2),
    rejection_rate_pct NUMERIC(5,2)
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.supplier_code,
        s.supplier_name,
        s.lead_time_days,
        s.min_order_value,
        s.payment_terms,
        s.quality_rating,
        s.on_time_delivery_pct,
        s.rejection_rate_pct
    FROM mrp.dim_supplier s
    WHERE s.supplier_id = p_supplier_id;
END;
$$;

-- Batch MRP Calculation Procedure
CREATE OR REPLACE PROCEDURE mrp.sp_run_mrp_calculation(
    p_plant_id INT,
    p_run_code VARCHAR(50),
    p_created_by VARCHAR(100)
)
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM mrp.fact_gross_requirements WHERE plant_id = p_plant_id;

    INSERT INTO mrp.fact_gross_requirements (plant_id, material_id, period_date, gross_quantity, unit_cost)
    SELECT 
        sf.plant_id,
        b.material_id,
        sf.period_date,
        SUM(sf.forecast_quantity * b.consumption_rate * (1 + m.scrap_percentage)) AS gross_quantity,
        m.unit_cost
    FROM mrp.fact_sales_forecast sf
    JOIN mrp.dim_bom b ON sf.fg_id = b.fg_id AND sf.plant_id = b.plant_id
    JOIN mrp.dim_material m ON b.material_id = m.material_id
    WHERE sf.plant_id = p_plant_id
    GROUP BY sf.plant_id, b.material_id, sf.period_date, m.unit_cost, m.scrap_percentage;

    INSERT INTO mrp.fact_mrp_item_requirement (
        mrp_run_code, plant_id, fg_id, material_id, period_date,
        gross_requirement, scheduled_receipts, projected_available,
        net_requirement, suggested_po_qty, suggested_po_date, priority, status
    )
    SELECT 
        p_run_code,
        gr.plant_id,
        NULL AS fg_id,
        gr.material_id,
        gr.period_date,
        gr.gross_quantity AS gross_requirement,
        COALESCE(ib.on_order_stock, 0) AS scheduled_receipts,
        GREATEST(0, COALESCE(ib.current_stock, 0) - gr.gross_quantity) AS projected_available,
        GREATEST(0, (gr.gross_quantity + m.safety_stock_qty) - (COALESCE(ib.current_stock, 0) + COALESCE(ib.on_order_stock, 0))) AS net_requirement,
        CASE 
            WHEN ((gr.gross_quantity + m.safety_stock_qty) - (COALESCE(ib.current_stock, 0) + COALESCE(ib.on_order_stock, 0))) <= 0 THEN 0
            ELSE GREATEST(
                m.moq, 
                CEIL(((gr.gross_quantity + m.safety_stock_qty) - (COALESCE(ib.current_stock, 0) + COALESCE(ib.on_order_stock, 0))) / COALESCE(NULLIF(m.order_multiple,0), 1.0)) * COALESCE(NULLIF(m.order_multiple,0), 1.0)
            )
        END AS suggested_po_qty,
        (gr.period_date - (m.lead_time_days || ' days')::INTERVAL)::DATE AS suggested_po_date,
        CASE 
            WHEN COALESCE(ib.current_stock, 0) < m.safety_stock_qty THEN 'Critical'
            WHEN ((gr.gross_quantity + m.safety_stock_qty) - COALESCE(ib.current_stock, 0)) > 500 THEN 'High'
            ELSE 'Medium'
        END AS priority,
        'Open' AS status
    FROM mrp.fact_gross_requirements gr
    JOIN mrp.dim_material m ON gr.material_id = m.material_id
    LEFT JOIN mrp.fact_inventory_balance ib ON gr.material_id = ib.material_id AND gr.plant_id = ib.plant_id
    WHERE gr.plant_id = p_plant_id;

END;
$$;
