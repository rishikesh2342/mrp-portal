-- Workbook source data plus a small, clearly marked validation scenario.
-- Source: Training template - MRP (1).xlsx (Morocco / MAD cement example).
-- Apply after schema.sql and 002_forward_mrp.sql.
-- Scrap percentages are fractions (0.01 = 1%). Workbook opening stock is 0.
BEGIN;

INSERT INTO mrp.countries (country_code, country_name, currency_code)
VALUES ('MAR', 'Morocco', 'MAD')
ON CONFLICT (country_code) DO UPDATE
SET country_name = EXCLUDED.country_name, currency_code = EXCLUDED.currency_code;

INSERT INTO mrp.plants (plant_code, plant_name, country_code, location, active_flag) VALUES
  ('P01', 'Plant Alpha (integrated)', 'MAR', 'Settat', TRUE),
  ('P02', 'Plant Beta (grinding)', 'MAR', 'Casablanca', TRUE),
  ('P03', 'Plant Gamma (grinding)', 'MAR', 'Fes', TRUE)
ON CONFLICT (plant_code) DO UPDATE
SET plant_name=EXCLUDED.plant_name, country_code=EXCLUDED.country_code,
    location=EXCLUDED.location, active_flag=EXCLUDED.active_flag;

-- order_multiple and max_capacity are not provided in the workbook; use 1 and NULL.
INSERT INTO mrp.material_master
  (material_code, description, category, supply_type, uom, unit_cost, scrap_pct,
   lead_time_buckets, moq, order_multiple, safety_stock_min, max_capacity, active_flag)
VALUES
  ('RM01','Clinker','Raw','BUY','ton',45.00,0.010000,2,1000,1,5000,NULL,TRUE),
  ('RM02','Gypsum','Raw','BUY','ton',18.00,0.010000,2,200,1,1000,NULL,TRUE),
  ('RM03','Limestone filler','Raw','BUY','ton',8.00,0.010000,1,500,1,2000,NULL,TRUE),
  ('RM04','Fly ash','Raw','BUY','ton',12.00,0.010000,2,300,1,1500,NULL,TRUE),
  ('RM05','Slag (GGBS)','Raw','BUY','ton',35.00,0.010000,3,300,1,1000,NULL,TRUE),
  ('RM06','Natural pozzolan','Raw','BUY','ton',10.00,0.010000,2,200,1,800,NULL,TRUE),
  ('RM07','Performance additive','Raw','BUY','kg',2.50,0.005000,4,100,1,500,NULL,TRUE),
  ('PK01','Paper bag 50kg','Packing','BUY','unit',0.18,0.020000,3,50000,1,100000,NULL,TRUE),
  ('PK02','PP woven bag 50kg','Packing','BUY','unit',0.15,0.020000,3,50000,1,80000,NULL,TRUE),
  ('PK03','Valve bag 25kg','Packing','BUY','unit',0.10,0.020000,3,50000,1,50000,NULL,TRUE),
  ('PK04','Bag thread','Packing','BUY','kg',1.20,0.010000,2,100,1,500,NULL,TRUE),
  ('PK05','Pallet','Packing','BUY','unit',6.00,0.000000,2,200,1,500,NULL,TRUE),
  ('PK06','Stretch film','Packing','BUY','kg',1.80,0.010000,2,100,1,400,NULL,TRUE)
ON CONFLICT (material_code) DO UPDATE SET
  description=EXCLUDED.description, category=EXCLUDED.category,
  supply_type=EXCLUDED.supply_type, uom=EXCLUDED.uom, unit_cost=EXCLUDED.unit_cost,
  scrap_pct=EXCLUDED.scrap_pct, lead_time_buckets=EXCLUDED.lead_time_buckets,
  moq=EXCLUDED.moq, order_multiple=EXCLUDED.order_multiple,
  safety_stock_min=EXCLUDED.safety_stock_min, max_capacity=EXCLUDED.max_capacity,
  active_flag=EXCLUDED.active_flag;

INSERT INTO mrp.fg_master (plant_code, fg_code, description, product_type, uom, active_flag) VALUES
  ('P01','FG-CEMI-B','CEM I 52.5 Bulk','Bulk','ton',TRUE),
  ('P01','FG-CEMI-BG','CEM I 52.5 Bagged 50kg','Bagged','ton',TRUE),
  ('P01','FG-CEMII-B','CEM II/A-L 42.5 Bulk','Bulk','ton',TRUE),
  ('P02','FG-CEMII-BG','CEM II/B-M 42.5 Bagged 50kg','Bagged','ton',TRUE),
  ('P02','FG-CEMIII-B','CEM III/A 42.5 Bulk','Bulk','ton',TRUE),
  ('P03','FG-CEMIV-BG','CEM IV/B 32.5 Bagged 50kg','Bagged','ton',TRUE),
  -- Validation addition: CEM I in 25 kg bags at P01.
  ('P01','FG-CEMI-25','CEM I 52.5 Bagged 25kg (validation)','Bagged','ton',TRUE)
ON CONFLICT (plant_code, fg_code) DO UPDATE SET
  description=EXCLUDED.description, product_type=EXCLUDED.product_type,
  uom=EXCLUDED.uom, active_flag=EXCLUDED.active_flag;

-- Refresh only the BOM rows owned by this workbook seed and its validation product.
DELETE FROM mrp.bom_matrix
WHERE (plant_code='P01' AND parent_fg_code IN ('FG-CEMI-B','FG-CEMI-BG','FG-CEMII-B','FG-CEMI-25'))
   OR (plant_code='P02' AND parent_fg_code IN ('FG-CEMII-BG','FG-CEMIII-B'))
   OR (plant_code='P03' AND parent_fg_code='FG-CEMIV-BG');

-- Ratios follow the workbook: raw tonnes/tonne FG; packaging units or kg/tonne FG.
INSERT INTO mrp.bom_matrix (plant_code,parent_fg_code,material_code,ratio) VALUES
  ('P01','FG-CEMI-B','RM01',0.95), ('P01','FG-CEMI-B','RM02',0.05),
  ('P01','FG-CEMI-BG','RM01',0.95), ('P01','FG-CEMI-BG','RM02',0.05),
  ('P01','FG-CEMI-BG','PK01',20), ('P01','FG-CEMI-BG','PK04',0.05),
  ('P01','FG-CEMI-BG','PK05',0.5), ('P01','FG-CEMI-BG','PK06',0.03),
  ('P01','FG-CEMII-B','RM01',0.80), ('P01','FG-CEMII-B','RM02',0.05), ('P01','FG-CEMII-B','RM03',0.15),
  ('P02','FG-CEMII-BG','RM01',0.65), ('P02','FG-CEMII-BG','RM02',0.05),
  ('P02','FG-CEMII-BG','RM03',0.15), ('P02','FG-CEMII-BG','RM04',0.15),
  ('P02','FG-CEMII-BG','PK02',20), ('P02','FG-CEMII-BG','PK04',0.05),
  ('P02','FG-CEMII-BG','PK05',0.5), ('P02','FG-CEMII-BG','PK06',0.03),
  ('P02','FG-CEMIII-B','RM01',0.55), ('P02','FG-CEMIII-B','RM02',0.05), ('P02','FG-CEMIII-B','RM05',0.40),
  ('P03','FG-CEMIV-BG','RM01',0.55), ('P03','FG-CEMIV-BG','RM02',0.05), ('P03','FG-CEMIV-BG','RM06',0.40),
  ('P03','FG-CEMIV-BG','PK03',40), ('P03','FG-CEMIV-BG','PK04',0.05),
  ('P03','FG-CEMIV-BG','PK05',0.5), ('P03','FG-CEMIV-BG','PK06',0.03),
  -- Validation product uses the CEM I raw recipe and a 25 kg valve bag.
  ('P01','FG-CEMI-25','RM01',0.95), ('P01','FG-CEMI-25','RM02',0.05),
  ('P01','FG-CEMI-25','PK03',40), ('P01','FG-CEMI-25','PK04',0.05),
  ('P01','FG-CEMI-25','PK05',0.5), ('P01','FG-CEMI-25','PK06',0.03);

-- The workbook's Planned Orders input has zero opening stock. Its derived order sheets
-- are not imported; the app calculates those from the source inputs above and below.
INSERT INTO mrp.inventory_on_hand
  (plant_code,material_code,on_hand_qty,scheduled_receipts,safety_stock_min,max_capacity,updated_at)
SELECT p.plant_code, m.material_code, 0, 0, m.safety_stock_min, NULL, now()
FROM mrp.plants p CROSS JOIN mrp.material_master m
WHERE p.plant_code IN ('P01','P02','P03') AND m.material_code IN
  ('RM01','RM02','RM03','RM04','RM05','RM06','RM07','PK01','PK02','PK03','PK04','PK05','PK06')
ON CONFLICT (plant_code,material_code) DO UPDATE SET
  on_hand_qty=EXCLUDED.on_hand_qty, scheduled_receipts=EXCLUDED.scheduled_receipts,
  safety_stock_min=EXCLUDED.safety_stock_min, max_capacity=EXCLUDED.max_capacity,
  updated_at=now();

-- Workbook forecast: Jul-2026 through Jul-2027 (the final seven buckets are zero).
DELETE FROM mrp.demand_forecast
WHERE plant_code IN ('P01','P02','P03')
  AND fg_code IN ('FG-CEMI-B','FG-CEMI-BG','FG-CEMII-B','FG-CEMII-BG','FG-CEMIII-B','FG-CEMIV-BG')
  AND bucket_date >= DATE '2026-07-01' AND bucket_date < DATE '2027-08-01';

WITH workbook_forecasts(plant_code,fg_code,qty_by_month) AS (VALUES
  ('P01','FG-CEMI-B',    ARRAY[18000,18500,19000,17500,20000,21000]::numeric[]),
  ('P01','FG-CEMI-BG',   ARRAY[ 9000, 9200, 9500, 8800,10000,10500]::numeric[]),
  ('P01','FG-CEMII-B',   ARRAY[12000,12500,13000,11800,14000,14500]::numeric[]),
  ('P02','FG-CEMII-BG',  ARRAY[ 7000, 7200, 7500, 6800, 8000, 8200]::numeric[]),
  ('P02','FG-CEMIII-B',  ARRAY[ 5000, 5200, 5400, 4800, 6000, 6200]::numeric[]),
  ('P03','FG-CEMIV-BG',  ARRAY[ 6000, 6200, 6400, 5800, 7000, 7200]::numeric[])
), buckets AS (SELECT generate_series(0,12) AS month_no)
INSERT INTO mrp.demand_forecast (plant_code,fg_code,bucket_date,forecast_qty,updated_at)
SELECT f.plant_code, f.fg_code,
       (DATE '2026-07-01' + make_interval(months => b.month_no))::date,
       CASE WHEN b.month_no < 6 THEN f.qty_by_month[b.month_no + 1] ELSE 0 END,
       now()
FROM workbook_forecasts f CROSS JOIN buckets b
ON CONFLICT (plant_code,fg_code,bucket_date) DO UPDATE SET
  forecast_qty=EXCLUDED.forecast_qty, updated_at=now();

-- Validation addition: demand across three future buckets for the 25 kg product.
DELETE FROM mrp.demand_forecast
WHERE plant_code='P01' AND fg_code='FG-CEMI-25'
  AND bucket_date IN (DATE '2026-11-01', DATE '2026-12-01', DATE '2027-01-01');
INSERT INTO mrp.demand_forecast (plant_code,fg_code,bucket_date,forecast_qty,updated_at) VALUES
  ('P01','FG-CEMI-25',DATE '2026-11-01',2800,now()),
  ('P01','FG-CEMI-25',DATE '2026-12-01',3000,now()),
  ('P01','FG-CEMI-25',DATE '2027-01-01',3200,now());

-- Validation addition: dated inbound stock for the new product's 25 kg bags.
DELETE FROM mrp.scheduled_receipts WHERE reference_no='VALIDATION-CEMENT-PK03-01';
INSERT INTO mrp.scheduled_receipts
  (plant_code,material_code,receipt_date,quantity,reference_no)
VALUES ('P01','PK03',DATE '2026-11-15',20000,'VALIDATION-CEMENT-PK03-01');

COMMIT;
