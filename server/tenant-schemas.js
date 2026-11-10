const TABLES = [
  "plants", "material_master", "fg_master", "bom_matrix", "demand_forecast",
  "inventory_on_hand", "scheduled_receipts", "mrp_runs", "mrp_results",
  "plant_material_constraints", "demand_actuals",
  "demand_scenario_imports", "demand_scenario_forecasts", "dim_supplier",
];

export function quoteTenantSchema(value) {
  const schemaName = String(value || "");
  if (!/^tenant_[a-z0-9_]{1,54}$/.test(schemaName))
    throw new Error("The selected tenant has an invalid database schema name.");
  return `"${schemaName}"`;
}

export async function ensureTenantSchema(client, tenant, { copyExisting = false } = {}) {
  const schema = quoteTenantSchema(tenant.schema_name);
  const exists = await client.query("SELECT to_regnamespace($1) AS schema_oid", [tenant.schema_name]);
  if (exists.rows[0].schema_oid) return false;

  await client.query(`CREATE SCHEMA ${schema}`);
  for (const table of TABLES)
    await client.query(`CREATE TABLE ${schema}."${table}" (LIKE mrp."${table}" INCLUDING ALL)`);

  const foreignKeys = [
    `ALTER TABLE ${schema}.plants ADD CONSTRAINT tenant_plants_country_fk FOREIGN KEY(country_code) REFERENCES mrp.countries(country_code)`,
    `ALTER TABLE ${schema}.plants ADD CONSTRAINT tenant_plants_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id)`,
    `ALTER TABLE ${schema}.material_master ADD CONSTRAINT tenant_materials_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id)`,
    `ALTER TABLE ${schema}.fg_master ADD CONSTRAINT tenant_fg_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_fg_plant_fk FOREIGN KEY(tenant_id,plant_code) REFERENCES ${schema}.plants(tenant_id,plant_code)`,
    `ALTER TABLE ${schema}.bom_matrix ADD CONSTRAINT tenant_bom_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_bom_plant_fk FOREIGN KEY(tenant_id,plant_code) REFERENCES ${schema}.plants(tenant_id,plant_code), ADD CONSTRAINT tenant_bom_fg_fk FOREIGN KEY(tenant_id,plant_code,parent_fg_code) REFERENCES ${schema}.fg_master(tenant_id,plant_code,fg_code), ADD CONSTRAINT tenant_bom_parent_material_fk FOREIGN KEY(tenant_id,parent_material_code) REFERENCES ${schema}.material_master(tenant_id,material_code), ADD CONSTRAINT tenant_bom_material_fk FOREIGN KEY(tenant_id,material_code) REFERENCES ${schema}.material_master(tenant_id,material_code)`,
    `ALTER TABLE ${schema}.demand_forecast ADD CONSTRAINT tenant_forecast_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_forecast_fg_fk FOREIGN KEY(tenant_id,plant_code,fg_code) REFERENCES ${schema}.fg_master(tenant_id,plant_code,fg_code)`,
    `ALTER TABLE ${schema}.inventory_on_hand ADD CONSTRAINT tenant_inventory_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_inventory_plant_fk FOREIGN KEY(tenant_id,plant_code) REFERENCES ${schema}.plants(tenant_id,plant_code), ADD CONSTRAINT tenant_inventory_material_fk FOREIGN KEY(tenant_id,material_code) REFERENCES ${schema}.material_master(tenant_id,material_code)`,
    `ALTER TABLE ${schema}.scheduled_receipts ADD CONSTRAINT tenant_receipts_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_receipts_inventory_fk FOREIGN KEY(tenant_id,plant_code,material_code) REFERENCES ${schema}.inventory_on_hand(tenant_id,plant_code,material_code)`,
    `ALTER TABLE ${schema}.plant_material_constraints ADD CONSTRAINT tenant_constraints_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_constraints_plant_fk FOREIGN KEY(tenant_id,plant_code) REFERENCES ${schema}.plants(tenant_id,plant_code), ADD CONSTRAINT tenant_constraints_material_fk FOREIGN KEY(tenant_id,material_code) REFERENCES ${schema}.material_master(tenant_id,material_code)`,
    `ALTER TABLE ${schema}.demand_actuals ADD CONSTRAINT tenant_actuals_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_actuals_fg_fk FOREIGN KEY(tenant_id,plant_code,fg_code) REFERENCES ${schema}.fg_master(tenant_id,plant_code,fg_code)`,
    `ALTER TABLE ${schema}.mrp_runs ADD CONSTRAINT tenant_runs_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_runs_country_fk FOREIGN KEY(country_code) REFERENCES mrp.countries(country_code)`,
    `ALTER TABLE ${schema}.mrp_results ADD CONSTRAINT tenant_results_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_results_run_fk FOREIGN KEY(tenant_id,run_id) REFERENCES ${schema}.mrp_runs(tenant_id,run_id) ON DELETE CASCADE, ADD CONSTRAINT tenant_results_plant_fk FOREIGN KEY(tenant_id,plant_code) REFERENCES ${schema}.plants(tenant_id,plant_code), ADD CONSTRAINT tenant_results_material_fk FOREIGN KEY(tenant_id,material_code) REFERENCES ${schema}.material_master(tenant_id,material_code)`,
    `ALTER TABLE ${schema}.demand_scenario_imports ADD CONSTRAINT tenant_scenario_imports_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id)`,
    `ALTER TABLE ${schema}.demand_scenario_forecasts ADD CONSTRAINT tenant_scenario_forecasts_tenant_fk FOREIGN KEY(tenant_id) REFERENCES public.tenants(tenant_id), ADD CONSTRAINT tenant_scenario_forecasts_plant_fk FOREIGN KEY(tenant_id,plant_code) REFERENCES ${schema}.plants(tenant_id,plant_code), ADD CONSTRAINT tenant_scenario_forecasts_fg_fk FOREIGN KEY(tenant_id,plant_code,fg_code) REFERENCES ${schema}.fg_master(tenant_id,plant_code,fg_code), ADD CONSTRAINT tenant_scenario_forecasts_import_fk FOREIGN KEY(tenant_id,import_id) REFERENCES ${schema}.demand_scenario_imports(tenant_id,import_id) ON DELETE CASCADE`,
  ];
  for (const sql of foreignKeys) await client.query(sql);

  if (copyExisting) {
    for (const table of TABLES) {
      if (table === "dim_supplier")
        await client.query(`INSERT INTO ${schema}.dim_supplier SELECT * FROM mrp.dim_supplier`);
      else
        await client.query(`INSERT INTO ${schema}."${table}" SELECT * FROM mrp."${table}" WHERE tenant_id=$1`, [tenant.tenant_id]);
    }
  }
  return true;
}
