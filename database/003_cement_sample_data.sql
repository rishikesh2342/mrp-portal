-- Idempotent cement-domain sample dataset for the forward MRP model.
-- Apply after 002_forward_mrp.sql. Quantities are metric tonnes unless the UoM says otherwise.
-- Forecasts start in the current month and cover twelve monthly buckets.
BEGIN;

INSERT INTO mrp.countries (country_code, country_name, currency_code)
VALUES ('MAR', 'Morocco', 'MAD')
ON CONFLICT (country_code) DO UPDATE SET country_name = EXCLUDED.country_name, currency_code = EXCLUDED.currency_code;

INSERT INTO mrp.plants (plant_code, plant_name, country_code, location, active_flag) VALUES
  ('P01', 'Settat Integrated Cement Plant', 'MAR', 'Settat', TRUE),
  ('P02', 'Casablanca Grinding and Packing Plant', 'MAR', 'Casablanca', TRUE),
  ('P03', 'Fes Grinding and Packing Plant', 'MAR', 'Fes', TRUE)
ON CONFLICT (plant_code) DO UPDATE SET plant_name=EXCLUDED.plant_name, country_code=EXCLUDED.country_code, location=EXCLUDED.location, active_flag=EXCLUDED.active_flag;

INSERT INTO mrp.material_master
(material_code, description, category, supply_type, uom, unit_cost, scrap_pct, lead_time_buckets, moq, order_multiple, safety_stock_min, max_capacity, active_flag)
VALUES
 ('RM01','Clinker','Raw','BUY','ton',720,0.010,2,1000,100,5000,60000,TRUE),
 ('RM02','Gypsum rock','Raw','BUY','ton',290,0.010,2,200,50,1000,12000,TRUE),
 ('RM03','Limestone filler','Raw','BUY','ton',125,0.010,1,500,100,2000,18000,TRUE),
 ('RM04','Fly ash','Raw','BUY','ton',410,0.015,2,300,50,1500,10000,TRUE),
 ('RM05','Ground granulated blast-furnace slag (GGBS)','Raw','BUY','ton',680,0.015,3,300,50,1000,12000,TRUE),
 ('RM06','Natural pozzolana','Raw','BUY','ton',260,0.015,2,250,50,1000,10000,TRUE),
 ('RM07','Iron corrective','Raw','BUY','ton',390,0.010,1,100,25,300,3000,TRUE),
 ('RM08','Silica corrective sand','Raw','BUY','ton',180,0.010,1,150,25,400,4000,TRUE),
 ('RM09','Bauxite corrective','Raw','BUY','ton',520,0.010,2,100,25,250,2500,TRUE),
 ('PK01','50 kg woven polypropylene cement bag','Packing','BUY','each',1.85,0.002,2,20000,5000,40000,800000,TRUE),
 ('PK02','25 kg woven polypropylene cement bag','Packing','BUY','each',1.55,0.002,2,20000,5000,30000,600000,TRUE),
 ('PK03','1.5 tonne bulk FIBC bag','Packing','BUY','each',28,0.002,3,500,100,500,12000,TRUE),
 ('PK04','Wood pallet','Packing','BUY','each',42,0.010,2,100,50,300,10000,TRUE),
 ('PK05','Pallet stretch film','Packing','BUY','kg',19,0.020,1,100,25,250,2500,TRUE),
 ('PK06','Bag sewing thread','Packing','BUY','kg',32,0.020,1,25,5,50,500,TRUE),
 ('PK07','Bag printing ink','Packing','BUY','kg',95,0.020,2,25,5,40,400,TRUE)
ON CONFLICT (material_code) DO UPDATE SET description=EXCLUDED.description, category=EXCLUDED.category, supply_type=EXCLUDED.supply_type, uom=EXCLUDED.uom,
 unit_cost=EXCLUDED.unit_cost, scrap_pct=EXCLUDED.scrap_pct, lead_time_buckets=EXCLUDED.lead_time_buckets, moq=EXCLUDED.moq,
 order_multiple=EXCLUDED.order_multiple, safety_stock_min=EXCLUDED.safety_stock_min, max_capacity=EXCLUDED.max_capacity, active_flag=EXCLUDED.active_flag;

-- Representative bulk and bagged products. FG codes repeat per plant as in the workbook.
INSERT INTO mrp.fg_master (plant_code, fg_code, description, product_type, uom, active_flag) VALUES
 ('P01','FG-CEMI-B','CEM I 52.5 N Bulk','Bulk','ton',TRUE),
 ('P01','FG-CEMI-50','CEM I 52.5 N Bagged 50 kg','Bagged','ton',TRUE),
 ('P01','FG-CEMII-A-B','CEM II/A-L 42.5 R Bulk','Bulk','ton',TRUE),
 ('P01','FG-CEMII-A-50','CEM II/A-L 42.5 R Bagged 50 kg','Bagged','ton',TRUE),
 ('P01','FG-CEMII-B-B','CEM II/B-M 42.5 N Bulk','Bulk','ton',TRUE),
 ('P02','FG-CEMI-B','CEM I 52.5 N Bulk','Bulk','ton',TRUE),
 ('P02','FG-CEMI-50','CEM I 52.5 N Bagged 50 kg','Bagged','ton',TRUE),
 ('P02','FG-CEMII-A-B','CEM II/A-L 42.5 R Bulk','Bulk','ton',TRUE),
 ('P02','FG-CEMII-B-50','CEM II/B-M 42.5 N Bagged 50 kg','Bagged','ton',TRUE),
 ('P02','FG-CEMIII-A-B','CEM III/A 42.5 N Bulk','Bulk','ton',TRUE),
 ('P03','FG-CEMI-B','CEM I 52.5 N Bulk','Bulk','ton',TRUE),
 ('P03','FG-CEMI-50','CEM I 52.5 N Bagged 50 kg','Bagged','ton',TRUE),
 ('P03','FG-CEMII-A-B','CEM II/A-L 42.5 R Bulk','Bulk','ton',TRUE),
 ('P03','FG-CEMII-B-50','CEM II/B-M 42.5 N Bagged 50 kg','Bagged','ton',TRUE),
 ('P03','FG-CEMIV-B','CEM IV/B(P) 32.5 N Bulk','Bulk','ton',TRUE)
ON CONFLICT (plant_code, fg_code) DO UPDATE SET description=EXCLUDED.description, product_type=EXCLUDED.product_type, uom=EXCLUDED.uom, active_flag=EXCLUDED.active_flag;

-- Ratios are component tonnes per finished tonne; bag counts are each per tonne.
-- Unique BOM components are refreshed by deleting only these sample product rows first.
DELETE FROM mrp.bom_matrix WHERE plant_code IN ('P01','P02','P03') AND parent_fg_code IN
 ('FG-CEMI-B','FG-CEMI-50','FG-CEMII-A-B','FG-CEMII-A-50','FG-CEMII-B-B','FG-CEMII-B-50','FG-CEMIII-A-B','FG-CEMIV-B');
INSERT INTO mrp.bom_matrix (plant_code,parent_fg_code,material_code,ratio) VALUES
 ('P01','FG-CEMI-B','RM01',0.950),('P01','FG-CEMI-B','RM02',0.050),
 ('P01','FG-CEMI-50','RM01',0.950),('P01','FG-CEMI-50','RM02',0.050),('P01','FG-CEMI-50','PK01',20),('P01','FG-CEMI-50','PK04',0.040),('P01','FG-CEMI-50','PK05',0.080),('P01','FG-CEMI-50','PK06',0.030),('P01','FG-CEMI-50','PK07',0.010),
 ('P01','FG-CEMII-A-B','RM01',0.800),('P01','FG-CEMII-A-B','RM02',0.050),('P01','FG-CEMII-A-B','RM03',0.150),
 ('P01','FG-CEMII-A-50','RM01',0.800),('P01','FG-CEMII-A-50','RM02',0.050),('P01','FG-CEMII-A-50','RM03',0.150),('P01','FG-CEMII-A-50','PK01',20),('P01','FG-CEMII-A-50','PK04',0.040),('P01','FG-CEMII-A-50','PK05',0.080),('P01','FG-CEMII-A-50','PK06',0.030),('P01','FG-CEMII-A-50','PK07',0.010),
 ('P01','FG-CEMII-B-B','RM01',0.650),('P01','FG-CEMII-B-B','RM02',0.050),('P01','FG-CEMII-B-B','RM03',0.150),('P01','FG-CEMII-B-B','RM04',0.150),
 ('P02','FG-CEMI-B','RM01',0.950),('P02','FG-CEMI-B','RM02',0.050),
 ('P02','FG-CEMI-50','RM01',0.950),('P02','FG-CEMI-50','RM02',0.050),('P02','FG-CEMI-50','PK01',20),('P02','FG-CEMI-50','PK04',0.040),('P02','FG-CEMI-50','PK05',0.080),('P02','FG-CEMI-50','PK06',0.030),('P02','FG-CEMI-50','PK07',0.010),
 ('P02','FG-CEMII-A-B','RM01',0.800),('P02','FG-CEMII-A-B','RM02',0.050),('P02','FG-CEMII-A-B','RM03',0.150),
 ('P02','FG-CEMII-B-50','RM01',0.650),('P02','FG-CEMII-B-50','RM02',0.050),('P02','FG-CEMII-B-50','RM03',0.150),('P02','FG-CEMII-B-50','RM04',0.150),('P02','FG-CEMII-B-50','PK01',20),('P02','FG-CEMII-B-50','PK04',0.040),('P02','FG-CEMII-B-50','PK05',0.080),('P02','FG-CEMII-B-50','PK06',0.030),('P02','FG-CEMII-B-50','PK07',0.010),
 ('P02','FG-CEMIII-A-B','RM01',0.550),('P02','FG-CEMIII-A-B','RM02',0.050),('P02','FG-CEMIII-A-B','RM05',0.400),
 ('P03','FG-CEMI-B','RM01',0.950),('P03','FG-CEMI-B','RM02',0.050),
 ('P03','FG-CEMI-50','RM01',0.950),('P03','FG-CEMI-50','RM02',0.050),('P03','FG-CEMI-50','PK01',20),('P03','FG-CEMI-50','PK04',0.040),('P03','FG-CEMI-50','PK05',0.080),('P03','FG-CEMI-50','PK06',0.030),('P03','FG-CEMI-50','PK07',0.010),
 ('P03','FG-CEMII-A-B','RM01',0.800),('P03','FG-CEMII-A-B','RM02',0.050),('P03','FG-CEMII-A-B','RM03',0.150),
 ('P03','FG-CEMII-B-50','RM01',0.650),('P03','FG-CEMII-B-50','RM02',0.050),('P03','FG-CEMII-B-50','RM03',0.150),('P03','FG-CEMII-B-50','RM04',0.150),('P03','FG-CEMII-B-50','PK01',20),('P03','FG-CEMII-B-50','PK04',0.040),('P03','FG-CEMII-B-50','PK05',0.080),('P03','FG-CEMII-B-50','PK06',0.030),('P03','FG-CEMII-B-50','PK07',0.010),
 ('P03','FG-CEMIV-B','RM01',0.650),('P03','FG-CEMIV-B','RM02',0.050),('P03','FG-CEMIV-B','RM06',0.200),('P03','FG-CEMIV-B','RM03',0.100);

-- Seed balanced opening stock and some near-term receipts for every stocked component at every plant.
INSERT INTO mrp.inventory_on_hand (plant_code,material_code,on_hand_qty,scheduled_receipts,safety_stock_min,max_capacity,updated_at)
SELECT p.plant_code,m.material_code,
 CASE WHEN m.category='Packing' THEN m.safety_stock_min*1.35 ELSE m.safety_stock_min*1.25 END,
 0,
 m.safety_stock_min,m.max_capacity,now()
FROM mrp.plants p CROSS JOIN mrp.material_master m
WHERE p.plant_code IN ('P01','P02','P03') AND m.active_flag
ON CONFLICT (plant_code,material_code) DO UPDATE SET on_hand_qty=EXCLUDED.on_hand_qty,
 scheduled_receipts=EXCLUDED.scheduled_receipts,safety_stock_min=EXCLUDED.safety_stock_min,max_capacity=EXCLUDED.max_capacity,updated_at=now();

DELETE FROM mrp.scheduled_receipts WHERE reference_no LIKE 'SAMPLE-CEMENT-%';
INSERT INTO mrp.scheduled_receipts (plant_code,material_code,receipt_date,quantity,reference_no)
SELECT p.plant_code,m.material_code,(current_date + 7),
       m.safety_stock_min*0.50,'SAMPLE-CEMENT-'||p.plant_code||'-'||m.material_code
FROM mrp.plants p CROSS JOIN mrp.material_master m
WHERE p.plant_code IN ('P01','P02','P03') AND m.material_code IN ('RM01','RM02','PK01');

-- Monthly demand, varied by plant/product and season, for a full rolling year.
DELETE FROM mrp.demand_forecast WHERE plant_code IN ('P01','P02','P03') AND bucket_date >= date_trunc('month',current_date)::date
 AND bucket_date < (date_trunc('month',current_date)::date + interval '12 months');
WITH products(plant_code,fg_code,base_qty) AS (VALUES
 ('P01','FG-CEMI-B',18000),('P01','FG-CEMI-50',9000),('P01','FG-CEMII-A-B',12000),('P01','FG-CEMII-A-50',6500),('P01','FG-CEMII-B-B',7000),
 ('P02','FG-CEMI-B',9000),('P02','FG-CEMI-50',11000),('P02','FG-CEMII-A-B',8500),('P02','FG-CEMII-B-50',9000),('P02','FG-CEMIII-A-B',6000),
 ('P03','FG-CEMI-B',7500),('P03','FG-CEMI-50',8500),('P03','FG-CEMII-A-B',7000),('P03','FG-CEMII-B-50',6500),('P03','FG-CEMIV-B',4500)
), months AS (
 SELECT generate_series(0,11) AS n
)
INSERT INTO mrp.demand_forecast (plant_code,fg_code,bucket_date,forecast_qty,updated_at)
SELECT p.plant_code,p.fg_code,(date_trunc('month',current_date)::date + make_interval(months=>months.n))::date,
 ROUND((p.base_qty * CASE WHEN months.n IN (0,1,2,9,10) THEN 1.05 WHEN months.n=11 THEN 1.12 ELSE 0.96 END)::numeric,2),now()
FROM products p CROSS JOIN months;

COMMIT;
