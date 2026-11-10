param(
  [string]$OutputDirectory = "database/sample-data/tenant-validation"
)

$ErrorActionPreference = 'Stop'
[Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::InvariantCulture
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$OutputDirectory = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function Write-CsvFile([string]$Name, [object[]]$Rows) {
  $lines = @($Rows | ConvertTo-Csv -NoTypeInformation)
  [IO.File]::WriteAllLines((Join-Path $OutputDirectory $Name), $lines, [System.Text.UTF8Encoding]::new($false))
}

$plant = @([pscustomobject]@{
  plant_code='P_VAL'; plant_name='Validation Plant'; country_code='MAR'; location='Agadir'; active_flag='true'
})
$materials = @(
  [pscustomobject]@{material_code='RM-CLINKER';description='Cement clinker';category='Raw';supply_type='BUY';uom='ton';unit_cost=720;scrap_pct=0.01;lead_time_buckets=2;moq=200;order_multiple=50;safety_stock_min=900;max_capacity=10000},
  [pscustomobject]@{material_code='RM-GYPSUM';description='Gypsum';category='Raw';supply_type='BUY';uom='ton';unit_cost=290;scrap_pct=0.01;lead_time_buckets=1;moq=100;order_multiple=25;safety_stock_min=250;max_capacity=5000},
  [pscustomobject]@{material_code='RM-LIMESTONE';description='Limestone filler';category='Raw';supply_type='BUY';uom='ton';unit_cost=125;scrap_pct=0.01;lead_time_buckets=1;moq=100;order_multiple=25;safety_stock_min=300;max_capacity=5000},
  [pscustomobject]@{material_code='PK-BAG-50';description='Cement bag 50 kg';category='Packing';supply_type='BUY';uom='each';unit_cost=1.85;scrap_pct=0.02;lead_time_buckets=2;moq=5000;order_multiple=1000;safety_stock_min=12000;max_capacity=150000},
  [pscustomobject]@{material_code='PK-BAG-45';description='Cement bag 45 kg';category='Packing';supply_type='BUY';uom='each';unit_cost=1.65;scrap_pct=0.02;lead_time_buckets=2;moq=5000;order_multiple=1000;safety_stock_min=10000;max_capacity=120000}
)
$finishedGoods = @(
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-BULK';description='Cement bulk';product_type='Bulk';uom='ton';active_flag='true'},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-50';description='Cement bag 50 kg';product_type='Bagged';uom='ton';active_flag='true'},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-45';description='Cement bag 45 kg';product_type='Bagged';uom='ton';active_flag='true'}
)
$constraints = foreach ($material in $materials) {
  $minimum = [double]$material.safety_stock_min
  [pscustomobject]@{plant_code='P_VAL';material_code=$material.material_code;min_stock_qty=$minimum;reorder_level=[math]::Round($minimum*1.25,2);max_stock_qty=[double]$material.max_capacity;max_storage_capacity=[double]$material.max_capacity;lead_time_buckets=$material.lead_time_buckets;moq=$material.moq;order_multiple=$material.order_multiple;uom=$material.uom}
}
$bom = @(
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-BULK';component_material_code='RM-CLINKER';quantity_per_fg=0.75;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-BULK';component_material_code='RM-GYPSUM';quantity_per_fg=0.10;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-BULK';component_material_code='RM-LIMESTONE';quantity_per_fg=0.15;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-50';component_material_code='RM-CLINKER';quantity_per_fg=0.75;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-50';component_material_code='RM-GYPSUM';quantity_per_fg=0.10;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-50';component_material_code='RM-LIMESTONE';quantity_per_fg=0.15;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-50';component_material_code='PK-BAG-50';quantity_per_fg=20;quantity_uom='each';scrap_factor=0.02},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-45';component_material_code='RM-CLINKER';quantity_per_fg=0.75;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-45';component_material_code='RM-GYPSUM';quantity_per_fg=0.10;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-45';component_material_code='RM-LIMESTONE';quantity_per_fg=0.15;quantity_uom='ton';scrap_factor=0.01},
  [pscustomobject]@{plant_code='P_VAL';fg_code='FG-CEM-45';component_material_code='PK-BAG-45';quantity_per_fg=22.2222;quantity_uom='each';scrap_factor=0.02}
)
$inventory = @(
  [pscustomobject]@{plant_code='P_VAL';material_code='RM-CLINKER';as_of_date='2026-11-01';on_hand_qty=500;reserved_qty=25;in_transit_qty=300;in_transit_due_date='2026-12-15';scheduled_receipts_qty=0;uom='ton'},
  [pscustomobject]@{plant_code='P_VAL';material_code='RM-GYPSUM';as_of_date='2026-11-01';on_hand_qty=100;reserved_qty=5;in_transit_qty=100;in_transit_due_date='2027-01-10';scheduled_receipts_qty=0;uom='ton'},
  [pscustomobject]@{plant_code='P_VAL';material_code='RM-LIMESTONE';as_of_date='2026-11-01';on_hand_qty=150;reserved_qty=10;in_transit_qty=0;in_transit_due_date='';scheduled_receipts_qty=0;uom='ton'},
  [pscustomobject]@{plant_code='P_VAL';material_code='PK-BAG-50';as_of_date='2026-11-01';on_hand_qty=6000;reserved_qty=200;in_transit_qty=4000;in_transit_due_date='2026-12-01';scheduled_receipts_qty=0;uom='each'},
  [pscustomobject]@{plant_code='P_VAL';material_code='PK-BAG-45';as_of_date='2026-11-01';on_hand_qty=5000;reserved_qty=100;in_transit_qty=3000;in_transit_due_date='2027-01-01';scheduled_receipts_qty=0;uom='each'}
)

$periods = for ($offset=0; $offset -lt 12; $offset++) { (Get-Date -Year 2026 -Month 11 -Day 1).AddMonths($offset) }
$monthlyRows = @()
$scenarioRows = [ordered]@{ 'System Forecast'=@(); 'Consensus Forecast'=@(); 'Custom Forecast'=@() }
$scenarioNames = @($scenarioRows.Keys)
$fgDefinitions = @(
  [pscustomobject]@{code='FG-CEM-BULK';description='Cement bulk';base=360},
  [pscustomobject]@{code='FG-CEM-50';description='Cement bag 50 kg';base=150},
  [pscustomobject]@{code='FG-CEM-45';description='Cement bag 45 kg';base=90}
)
foreach ($fg in $fgDefinitions) {
  $scenarioTotals = [ordered]@{ 'System Forecast'=@(); 'Consensus Forecast'=@(); 'Custom Forecast'=@() }
  foreach ($periodIndex in 0..11) {
    $period = $periods[$periodIndex]
    $seasonality = @(0.94,0.96,1.00,1.04,1.08,1.12,1.10,1.06,1.02,0.98,0.94,0.92)[$periodIndex]
    $systemTotal = [math]::Round($fg.base * $seasonality * (1 + 0.012 * $periodIndex), 2)
    $consensusTotal = [math]::Round($systemTotal * 1.08, 2)
    $customFactor = @(1.12,1.10,1.08,1.06,1.04,1.02,1.00,0.98,0.96,0.94,0.92,0.90)[$periodIndex]
    $customTotal = [math]::Round($systemTotal * $customFactor, 2)
    $scenarioTotals['System Forecast'] += $systemTotal
    $scenarioTotals['Consensus Forecast'] += $consensusTotal
    $scenarioTotals['Custom Forecast'] += $customTotal
    $monthlyRows += [pscustomobject]@{plant_code='P_VAL';fg_code=$fg.code;bucket_date=$period.ToString('yyyy-MM-01');bucket_type='Monthly';forecast_qty=$systemTotal;forecast_uom='ton'}
  }
  foreach ($scenarioName in $scenarioNames) {
    foreach ($customer in @(
      [pscustomobject]@{sold='SOLD-100';ship='SHIP-101';customer='North Distributor';share=0.55;channel='Distributor'},
      [pscustomobject]@{sold='SOLD-100';ship='SHIP-102';customer='Coastal Retail';share=0.45;channel='Retail'}
    )) {
      $scenarioRow = [ordered]@{
        plant_code='P_VAL';fg_code=$fg.code;product_name=$fg.description;Sold_To=$customer.sold;
        Ship_To=$customer.ship;Customer=$customer.customer;Channel=$customer.channel;uom='ton'
      }
      for ($periodIndex=0; $periodIndex -lt 12; $periodIndex++) {
        $header = $periods[$periodIndex].ToString('MMM yyyy')
        $scenarioRow[$header] = [math]::Round($scenarioTotals[$scenarioName][$periodIndex]*$customer.share, 2)
      }
      $scenarioRows[$scenarioName] += [pscustomobject]$scenarioRow
    }
  }
}

Write-CsvFile '01_plant_master.csv' $plant
Write-CsvFile '02_material_master.csv' $materials
Write-CsvFile '03_finished_goods.csv' $finishedGoods
Write-CsvFile '04_plant_constraints.csv' $constraints
Write-CsvFile '05_bom.csv' $bom
Write-CsvFile '06_inventory.csv' $inventory
Write-CsvFile '07_demand_monthly_12m.csv' $monthlyRows

function ConvertTo-ColumnName([int]$Number) {
  $name = ''
  while ($Number -gt 0) {
    $Number--
    $name = [char](65 + ($Number % 26)) + $name
    $Number = [math]::Floor($Number / 26)
  }
  return $name
}
function XmlEscape([string]$Value) { return [System.Security.SecurityElement]::Escape($Value) }
function Write-ZipText($Archive, [string]$EntryName, [string]$Content) {
  $entry = $Archive.CreateEntry($EntryName, [IO.Compression.CompressionLevel]::Optimal)
  $writer = [IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
  $writer.Write($Content)
  $writer.Dispose()
}
function Get-WorksheetXml([object[]]$Rows) {
  $xmlRows = [System.Text.StringBuilder]::new()
  for ($r=0; $r -lt $Rows.Count; $r++) {
    [void]$xmlRows.Append("<row r=`"$($r+1)`">")
    for ($c=0; $c -lt $Rows[$r].Count; $c++) {
      $value = [string]$Rows[$r][$c]
      if ($value -eq '') { continue }
      $cell = "$(ConvertTo-ColumnName ($c+1))$($r+1)"
      if ($value -match '^-?\d+(\.\d+)?$') { [void]$xmlRows.Append("<c r=`"$cell`"><v>$value</v></c>") }
      else { [void]$xmlRows.Append("<c r=`"$cell`" t=`"inlineStr`"><is><t>$(XmlEscape $value)</t></is></c>") }
    }
    [void]$xmlRows.Append('</row>')
  }
  return "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><worksheet xmlns=`"http://schemas.openxmlformats.org/spreadsheetml/2006/main`"><sheetData>$($xmlRows.ToString())</sheetData></worksheet>"
}

$xlsxPath = Join-Path $OutputDirectory '08_demand_scenario_workbook_12m.xlsx'
if (Test-Path -LiteralPath $xlsxPath) { Remove-Item -LiteralPath $xlsxPath -Force }
$fileStream = [IO.File]::Open($xlsxPath, [IO.FileMode]::CreateNew)
$archive = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Create, $false)
try {
  $sheetNames = @($scenarioRows.Keys)
  $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  $workbookSheets = ''
  $workbookRelations = ''
  $rootRelations = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  Write-ZipText $archive '_rels/.rels' $rootRelations
  for ($i=0; $i -lt $sheetNames.Count; $i++) {
    $sheetNumber = $i + 1
    $sheetName = $sheetNames[$i]
    $contentTypes += "<Override PartName=`"/xl/worksheets/sheet$sheetNumber.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml`"/>"
    $workbookSheets += "<sheet name=`"$(XmlEscape $sheetName)`" sheetId=`"$sheetNumber`" r:id=`"rId$sheetNumber`"/>"
    $workbookRelations += "<Relationship Id=`"rId$sheetNumber`" Type=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet`" Target=`"worksheets/sheet$sheetNumber.xml`"/>"
    $rows = [System.Collections.Generic.List[object[]]]::new()
    $headerRow = @('plant_code','fg_code','product_name','Sold To','Ship To','Customer','Channel','uom') + @($periods | ForEach-Object { $_.ToString('MMM yyyy') })
    [void]$rows.Add([object[]]$headerRow)
    foreach ($scenarioRow in $scenarioRows[$sheetName]) {
      $data = @($scenarioRow.plant_code,$scenarioRow.fg_code,$scenarioRow.product_name,$scenarioRow.Sold_To,$scenarioRow.Ship_To,$scenarioRow.Customer,$scenarioRow.Channel,$scenarioRow.uom)
      foreach ($period in $periods) {
        $periodHeader = $period.ToString('MMM yyyy')
        $data += [string]$scenarioRow.PSObject.Properties[$periodHeader].Value
      }
      [void]$rows.Add([object[]]$data)
    }
    Write-ZipText $archive "xl/worksheets/sheet$sheetNumber.xml" (Get-WorksheetXml -Rows $rows.ToArray())
  }
  $contentTypes += '</Types>'
  $workbook = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><workbook xmlns=`"http://schemas.openxmlformats.org/spreadsheetml/2006/main`" xmlns:r=`"http://schemas.openxmlformats.org/officeDocument/2006/relationships`"><sheets>$workbookSheets</sheets></workbook>"
  $relations = "<?xml version=`"1.0`" encoding=`"UTF-8`" standalone=`"yes`"?><Relationships xmlns=`"http://schemas.openxmlformats.org/package/2006/relationships`">$workbookRelations</Relationships>"
  Write-ZipText $archive '[Content_Types].xml' $contentTypes
  Write-ZipText $archive 'xl/workbook.xml' $workbook
  Write-ZipText $archive 'xl/_rels/workbook.xml.rels' $relations
} finally {
  $archive.Dispose()
}
$fileStream.Dispose()

Write-Host "Generated tenant validation files in $OutputDirectory"
