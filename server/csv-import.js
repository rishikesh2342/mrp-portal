const MAX_ROWS = 50000;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  if (rows.length < 2) throw new Error('CSV must contain a header row and at least one data row.');
  const headers = rows.shift().map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim());
  if (new Set(headers).size !== headers.length || headers.some(value => !value)) throw new Error('CSV column headers must be non-empty and unique.');
  if (rows.length > MAX_ROWS) throw new Error(`CSV exceeds the ${MAX_ROWS.toLocaleString()} row limit.`);
  return rows.map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`Row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index].trim()]));
  });
}

function requireColumns(rows, required) {
  const headers = new Set(Object.keys(rows[0] || {}));
  const missing = required.filter(column => !headers.has(column));
  if (missing.length) throw new Error(`Missing required CSV columns: ${missing.join(', ')}.`);
  for (const [index, row] of rows.entries()) {
    for (const column of required) if (row[column] === '') throw new Error(`Row ${index + 2}: ${column} is required.`);
  }
}
function number(value, field, row, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Row ${row}: ${field} must be a number between ${min} and ${max}.`);
  return parsed;
}
function date(value, field, row, optional = false) {
  if (!value && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`Row ${row}: ${field} must be an ISO date (YYYY-MM-DD).`);
  return value;
}
function uniqueKeys(rows, keyFields) {
  const seen = new Set();
  rows.forEach((row, index) => {
    const key = keyFields.map(field => row[field]).join('|');
    if (seen.has(key)) throw new Error(`Duplicate key at row ${index + 2}: ${key}.`);
    seen.add(key);
  });
}

export async function importCsv(pool, { dataset, fileName, csvText, tenantId }) {
  if (!tenantId) throw new Error('A signed-in tenant workspace is required for uploads.');
  const handlers = {
    plants: importPlants, materials: importMaterials, finished_goods: importFinishedGoods,
    plant_constraints: importConstraints, bom: importBom, inventory: importInventory,
    demand: (db, data, id) => importDemand(db, data, 'Weekly', id),
    demand_monthly: (db, data, id) => importDemand(db, data, 'Monthly', id),
  };
  if (!handlers[dataset]) throw new Error('Select a supported CSV upload type.');
  if (typeof csvText !== 'string' || csvText.length > 10 * 1024 * 1024) throw new Error('CSV file is missing or larger than 10 MB.');
  const rows = parseCsv(csvText);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await handlers[dataset](client, rows, tenantId);
    await client.query('COMMIT');
    return { imported: rows.length, fileName };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '42P01' && dataset === 'inventory') error.message = 'Inventory upload needs the stock extension. Run database/006_operational_mrp_job.sql first.';
    if (error.code === '23503') error.message = `A plant, material, or finished-good reference is missing. Upload master data before this file. Database detail: ${error.detail || error.message}`;
    if (error.code === '23505') error.message = `The CSV contains a duplicate database key. ${error.detail || error.message}`;
    throw error;
  } finally { client.release(); }
}

async function importPlants(db, rows, tenantId) {
  requireColumns(rows, ['plant_code','plant_name','country_code','location','active_flag']); uniqueKeys(rows,['plant_code']);
  const countries = new Map([['MAR',['Morocco','MAD']]]);
  for (const row of rows) {
    if (!/^(true|false)$/i.test(row.active_flag)) throw new Error(`Plant ${row.plant_code}: active_flag must be true or false.`);
    const country = countries.get(row.country_code);
    if (!country) throw new Error(`Country ${row.country_code} is unknown to this importer. Add its country and currency mapping first.`);
    // Country codes are shared reference data. A workspace upload may ensure
    // that a supported code exists, but must never overwrite labels used by
    // another tenant.
    await db.query(`INSERT INTO mrp.countries(country_code,country_name,currency_code) VALUES($1,$2,$3)
      ON CONFLICT(country_code) DO NOTHING`, [row.country_code,...country]);
  }
  for (const row of rows) await db.query(`INSERT INTO mrp.plants(tenant_id,plant_code,plant_name,country_code,location,active_flag)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,plant_code) DO UPDATE SET plant_name=EXCLUDED.plant_name,country_code=EXCLUDED.country_code,location=EXCLUDED.location,active_flag=EXCLUDED.active_flag`,
  [tenantId,row.plant_code,row.plant_name,row.country_code,row.location,/^true$/i.test(row.active_flag)]);
}
async function importMaterials(db, rows, tenantId) {
  requireColumns(rows,['material_code','description','category','supply_type','uom','unit_cost','scrap_pct','lead_time_buckets','moq','order_multiple','safety_stock_min','max_capacity']); uniqueKeys(rows,['material_code']);
  for (const [i,row] of rows.entries()) {
    const n=i+2;
    if (!['Raw','Packing','Intermediate'].includes(row.category)) throw new Error(`Row ${n}: unsupported category ${row.category}.`);
    if (!['BUY','MAKE'].includes(row.supply_type)) throw new Error(`Row ${n}: supply_type must be BUY or MAKE.`);
    number(row.unit_cost,'unit_cost',n); number(row.scrap_pct,'scrap_pct',n,{max:0.999999}); number(row.lead_time_buckets,'lead_time_buckets',n); number(row.moq,'moq',n); number(row.order_multiple,'order_multiple',n); number(row.safety_stock_min,'safety_stock_min',n); if(row.max_capacity) number(row.max_capacity,'max_capacity',n);
    await db.query(`INSERT INTO mrp.material_master(tenant_id,material_code,description,category,supply_type,uom,unit_cost,scrap_pct,lead_time_buckets,moq,order_multiple,safety_stock_min,max_capacity,active_flag)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true) ON CONFLICT(tenant_id,material_code) DO UPDATE SET description=EXCLUDED.description,category=EXCLUDED.category,supply_type=EXCLUDED.supply_type,uom=EXCLUDED.uom,unit_cost=EXCLUDED.unit_cost,scrap_pct=EXCLUDED.scrap_pct,lead_time_buckets=EXCLUDED.lead_time_buckets,moq=EXCLUDED.moq,order_multiple=EXCLUDED.order_multiple,safety_stock_min=EXCLUDED.safety_stock_min,max_capacity=EXCLUDED.max_capacity,active_flag=true`,
    [tenantId,row.material_code,row.description,row.category,row.supply_type,row.uom,Number(row.unit_cost),Number(row.scrap_pct),Number(row.lead_time_buckets),Number(row.moq),Number(row.order_multiple),Number(row.safety_stock_min),row.max_capacity?Number(row.max_capacity):null]);
  }
}
async function importFinishedGoods(db, rows, tenantId) {
  requireColumns(rows,['plant_code','fg_code','description','product_type','uom','active_flag']); uniqueKeys(rows,['plant_code','fg_code']);
  for (const row of rows) {
    if (!['Bulk','Bagged'].includes(row.product_type) || !/^(true|false)$/i.test(row.active_flag)) throw new Error(`Finished good ${row.fg_code}: invalid product_type or active_flag.`);
    await db.query(`INSERT INTO mrp.fg_master(tenant_id,plant_code,fg_code,description,product_type,uom,active_flag) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(tenant_id,plant_code,fg_code) DO UPDATE SET description=EXCLUDED.description,product_type=EXCLUDED.product_type,uom=EXCLUDED.uom,active_flag=EXCLUDED.active_flag`,
    [tenantId,row.plant_code,row.fg_code,row.description,row.product_type,row.uom,/^true$/i.test(row.active_flag)]);
  }
}
async function importConstraints(db, rows, tenantId) {
  requireColumns(rows,['plant_code','material_code','min_stock_qty','reorder_level','max_stock_qty','max_storage_capacity','lead_time_buckets','moq','order_multiple']); uniqueKeys(rows,['plant_code','material_code']);
  for (const [i,row] of rows.entries()) {
    const n=i+2; for(const field of ['min_stock_qty','reorder_level','max_stock_qty','max_storage_capacity','lead_time_buckets','moq','order_multiple']) if(row[field]) number(row[field],field,n);
    if (Number(row.max_stock_qty) > Number(row.max_storage_capacity)) throw new Error(`Row ${n}: max_stock_qty cannot exceed max_storage_capacity.`);
    await db.query(`INSERT INTO mrp.plant_material_constraints(tenant_id,plant_code,material_code,min_stock_qty,reorder_level,max_stock_qty,max_storage_capacity,lead_time_buckets,moq,order_multiple)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(tenant_id,plant_code,material_code) DO UPDATE SET min_stock_qty=EXCLUDED.min_stock_qty,reorder_level=EXCLUDED.reorder_level,max_stock_qty=EXCLUDED.max_stock_qty,max_storage_capacity=EXCLUDED.max_storage_capacity,lead_time_buckets=EXCLUDED.lead_time_buckets,moq=EXCLUDED.moq,order_multiple=EXCLUDED.order_multiple,updated_at=now()`,
    [tenantId,row.plant_code,row.material_code,Number(row.min_stock_qty),row.reorder_level?Number(row.reorder_level):null,row.max_stock_qty?Number(row.max_stock_qty):null,row.max_storage_capacity?Number(row.max_storage_capacity):null,row.lead_time_buckets?Number(row.lead_time_buckets):null,row.moq?Number(row.moq):null,row.order_multiple?Number(row.order_multiple):null]);
  }
}
async function importBom(db, rows, tenantId) {
  requireColumns(rows,['plant_code','fg_code','component_material_code','quantity_per_fg']); uniqueKeys(rows,['plant_code','fg_code','component_material_code']);
  for (const [i,row] of rows.entries()) number(row.quantity_per_fg,'quantity_per_fg',i+2,{min:Number.MIN_VALUE});
  const scope = [...new Map(rows.map(row=>[`${row.plant_code}|${row.fg_code}`,row])).values()];
  for(const row of scope) await db.query('DELETE FROM mrp.bom_matrix WHERE tenant_id=$1 AND plant_code=$2 AND parent_fg_code=$3',[tenantId,row.plant_code,row.fg_code]);
  for(const row of rows) await db.query(`INSERT INTO mrp.bom_matrix(tenant_id,plant_code,parent_fg_code,material_code,ratio,effective_from,effective_to,active_flag)
    VALUES($1,$2,$3,$4,$5,DATE '1900-01-01',NULL,true)`,[tenantId,row.plant_code,row.fg_code,row.component_material_code,Number(row.quantity_per_fg)]);
}
async function importInventory(db, rows, tenantId) {
  requireColumns(rows,['plant_code','material_code','on_hand_qty','reserved_qty','in_transit_qty','in_transit_due_date','scheduled_receipts_qty']); uniqueKeys(rows,['plant_code','material_code']);
  for(const [i,row] of rows.entries()) {
    const n=i+2; const onHand=number(row.on_hand_qty,'on_hand_qty',n), reserved=number(row.reserved_qty,'reserved_qty',n), transit=number(row.in_transit_qty,'in_transit_qty',n);
    if(reserved>onHand) throw new Error(`Row ${n}: reserved_qty cannot exceed on_hand_qty.`);
    // The MRP engine treats undated in-transit stock as arriving in the first
    // planning bucket, so allow a blank due date here and keep import behavior
    // consistent with calculation behavior.
    const due=date(row.in_transit_due_date,'in_transit_due_date',n,true); const scheduled=number(row.scheduled_receipts_qty,'scheduled_receipts_qty',n);
    const result = await db.query(`INSERT INTO mrp.inventory_on_hand(tenant_id,plant_code,material_code,on_hand_qty,scheduled_receipts,reserved_qty,in_transit_qty,in_transit_due_date,safety_stock_min,max_capacity,updated_at)
      SELECT $1::uuid,$2::varchar,$3::varchar,$4::numeric,$5::numeric,$6::numeric,$7::numeric,$8::date,
        COALESCE(c.min_stock_qty,m.safety_stock_min),COALESCE(c.max_storage_capacity,m.max_capacity),now()
      FROM mrp.material_master m LEFT JOIN mrp.plant_material_constraints c
        ON c.tenant_id=$1::uuid AND c.plant_code=$2::varchar AND c.material_code=m.material_code
      WHERE m.tenant_id=$1::uuid AND m.material_code=$3::varchar
      ON CONFLICT(tenant_id,plant_code,material_code) DO UPDATE SET on_hand_qty=EXCLUDED.on_hand_qty,scheduled_receipts=EXCLUDED.scheduled_receipts,reserved_qty=EXCLUDED.reserved_qty,in_transit_qty=EXCLUDED.in_transit_qty,in_transit_due_date=EXCLUDED.in_transit_due_date,safety_stock_min=EXCLUDED.safety_stock_min,max_capacity=EXCLUDED.max_capacity,updated_at=now()`,
    [tenantId,row.plant_code,row.material_code,onHand,scheduled,reserved,transit,due]);
    if (!result.rowCount) throw new Error(`Row ${n}: material ${row.material_code} does not exist.`);
  }
}
async function importDemand(db, rows, expectedBucket, tenantId) {
  requireColumns(rows,['plant_code','fg_code','bucket_date','bucket_type','forecast_qty']); uniqueKeys(rows,['plant_code','fg_code','bucket_date']);
  for(const [i,row] of rows.entries()) {
    const n=i+2; date(row.bucket_date,'bucket_date',n);
    if(row.bucket_type!==expectedBucket) throw new Error(`Row ${n}: choose ${expectedBucket} demand forecast for this file.`);
    if(expectedBucket==='Weekly' && new Date(`${row.bucket_date}T00:00:00Z`).getUTCDay()!==0) throw new Error(`Row ${n}: weekly bucket_date must be a Sunday.`);
    if(expectedBucket==='Monthly' && !/^\d{4}-\d{2}-01$/.test(row.bucket_date)) throw new Error(`Row ${n}: monthly bucket_date must be the first day of the month (YYYY-MM-01).`);
    number(row.forecast_qty,'forecast_qty',n);
    await db.query(`INSERT INTO mrp.demand_forecast(tenant_id,plant_code,fg_code,bucket_date,forecast_qty,updated_at) VALUES($1,$2,$3,$4,$5,now())
      ON CONFLICT(tenant_id,plant_code,fg_code,bucket_date) DO UPDATE SET forecast_qty=EXCLUDED.forecast_qty,updated_at=now()`,[tenantId,row.plant_code,row.fg_code,row.bucket_date,Number(row.forecast_qty)]);
  }
}
