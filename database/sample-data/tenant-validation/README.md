# Tenant validation sample pack

Use these files in a **new, empty tenant**. The pack has one Morocco plant, five materials, three finished goods, matching constraints and BOMs, opening inventory, 12 months of base monthly demand, and a workbook with three customer-dimensioned forecast scenarios.

Generate or restore the pack from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate_tenant_validation_pack.ps1
```

Follow [the full tenant validation guide](../../../docs/tenant_validation_guide.md) for the portal upload order, scenario import steps, and checks. Do not upload the `.xlsx` file through **Upload CSV**; use **Import demand workbook** on the Demand Planning page and import each worksheet separately.
