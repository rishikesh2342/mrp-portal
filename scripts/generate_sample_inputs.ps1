param(
  [Parameter(Mandatory=$true)][string]$WorkbookPath,
  [string]$OutputDirectory = "database/sample-data"
)

$ErrorActionPreference = 'Stop'
$culture = [Globalization.CultureInfo]::InvariantCulture
[Threading.Thread]::CurrentThread.CurrentCulture = $culture

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $WorkbookPath))
try {
  $shared = @()
  $sharedEntry = $archive.GetEntry('xl/sharedStrings.xml')
  if ($sharedEntry) {
    $reader = [IO.StreamReader]::new($sharedEntry.Open())
    [xml]$sharedXml = $reader.ReadToEnd(); $reader.Close()
    $ns = [Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
    $ns.AddNamespace('x','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $shared = @($sharedXml.SelectNodes('//x:si',$ns) | ForEach-Object { ($_.SelectNodes('.//x:t',$ns) | ForEach-Object InnerText) -join '' })
  }
  $sheetEntry = $archive.GetEntry('xl/worksheets/sheet1.xml')
  if (-not $sheetEntry) { throw 'Workbook does not contain the expected Data sheet.' }
  $reader = [IO.StreamReader]::new($sheetEntry.Open())
  [xml]$sheet = $reader.ReadToEnd(); $reader.Close()
  $ns = [Xml.XmlNamespaceManager]::new($sheet.NameTable)
  $ns.AddNamespace('x','http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $source = @()
  foreach ($row in $sheet.SelectNodes('//x:sheetData/x:row',$ns) | Select-Object -Skip 1) {
    $cells = @{}
    foreach ($cell in $row.SelectNodes('x:c',$ns)) {
      $value = $cell.SelectSingleNode('x:v',$ns)
      if ($value) {
        $text = $value.InnerText
        if ($cell.t -eq 's') { $text = $shared[[int]$text] }
        $cells[$cell.r -replace '\d',''] = $text
      }
      $inline = $cell.SelectSingleNode('x:is',$ns)
      if ($inline) { $cells[$cell.r -replace '\d',''] = ($inline.SelectNodes('.//x:t',$ns) | ForEach-Object InnerText) -join '' }
    }
    if (-not $cells.B -or -not $cells.A) { continue }
    $skuMatch = [regex]::Match($cells.B,'\d{18}')
    if (-not $skuMatch.Success) { throw "Could not find an 18-digit SKU on workbook row $($row.r)." }
    $description = $cells.C
    if (-not $description -or $description -eq 'NA') {
      $description = [regex]::Replace($cells.B,'\s*-\s*\d{18}$','')
    }
    $tagMatch = [regex]::Match($description,'(?:_|\s)([A-Za-z]{2,8})$')
    if (-not $tagMatch.Success) { throw "Could not infer a location suffix on workbook row $($row.r): $description" }
    $tag = $tagMatch.Groups[1].Value.ToUpperInvariant()
    $tag = switch ($tag) {
      'HSETTAT' { 'SET' }
      'STT' { 'SET' }
      'HFES' { 'FES' }
      'HNAD' { 'NAD' }
      'MEKN' { 'MKN' }
      'OUJDA' { 'OUJ' }
      'LAAYN' { 'LAA' }
      default { $tag }
    }
    $forecast = if ($cells.E) { [decimal]::Parse($cells.E,$culture) } else { [decimal]0 }
    $actual = if ($cells.D) { [decimal]::Parse($cells.D,$culture) } else { $null }
    $source += [pscustomobject]@{
      plant_code = "P_$tag"
      source_location_tag = $tag
      fg_code = $skuMatch.Value
      description = $description
      product_type = if ($description -match '(?i)VRAC') { 'Bulk' } else { 'Bagged' }
      bucket_date = [datetime]::FromOADate([double]$cells.A).ToString('yyyy-MM-dd',$culture)
      forecast_qty = $forecast
      actual_qty = $actual
    }
  }
} finally { $archive.Dispose() }

$locationNames = @{
  BSK='Bouskoura'; SET='Settat'; FES='Fes'; OUJ='Oujda'; NAD='Nador'
  MKN='Meknes'; TET='Tetouan'; TNG='Tangier'; LAA='Laayoune'; AGR='Agadir'
}
$plants = @($source | Group-Object plant_code | ForEach-Object {
  $tag = $_.Group[0].source_location_tag
  [pscustomobject]@{plant_code=$_.Name;plant_name="$($locationNames[$tag]) cement demand site";country_code='MAR';location=$locationNames[$tag];active_flag='true';source_location_tag=$tag;plant_mapping='INFERRED_FROM_SKU_DESCRIPTION'}
} | Sort-Object plant_code)

$materials = @(
  [pscustomobject]@{material_code='RM-CLINKER';description='Cement clinker';category='Raw';supply_type='BUY';uom='ton';unit_cost=720;scrap_pct=0.010;lead_time_buckets=2;moq=1000;order_multiple=100;safety_stock_min=5000;max_capacity=60000},
  [pscustomobject]@{material_code='RM-GYPSUM';description='Gypsum';category='Raw';supply_type='BUY';uom='ton';unit_cost=290;scrap_pct=0.010;lead_time_buckets=2;moq=200;order_multiple=50;safety_stock_min=1000;max_capacity=12000},
  [pscustomobject]@{material_code='RM-LIMESTONE';description='Limestone filler';category='Raw';supply_type='BUY';uom='ton';unit_cost=125;scrap_pct=0.010;lead_time_buckets=1;moq=500;order_multiple=100;safety_stock_min=2000;max_capacity=18000},
  [pscustomobject]@{material_code='RM-FLYASH';description='Fly ash';category='Raw';supply_type='BUY';uom='ton';unit_cost=410;scrap_pct=0.015;lead_time_buckets=2;moq=300;order_multiple=50;safety_stock_min=1500;max_capacity=10000},
  [pscustomobject]@{material_code='RM-SLAG';description='Ground granulated blast-furnace slag';category='Raw';supply_type='BUY';uom='ton';unit_cost=680;scrap_pct=0.015;lead_time_buckets=3;moq=300;order_multiple=50;safety_stock_min=1000;max_capacity=12000},
  [pscustomobject]@{material_code='RM-POZZOLAN';description='Natural pozzolan';category='Raw';supply_type='BUY';uom='ton';unit_cost=260;scrap_pct=0.015;lead_time_buckets=2;moq=250;order_multiple=50;safety_stock_min=1000;max_capacity=10000},
  [pscustomobject]@{material_code='RM-ADDITIVE';description='Cement performance additive';category='Raw';supply_type='BUY';uom='kg';unit_cost=2.5;scrap_pct=0.005;lead_time_buckets=4;moq=100;order_multiple=25;safety_stock_min=500;max_capacity=3000},
  [pscustomobject]@{material_code='PK-BAG-45';description='Cement bag 45 kg';category='Packing';supply_type='BUY';uom='each';unit_cost=1.65;scrap_pct=0.020;lead_time_buckets=3;moq=30000;order_multiple=5000;safety_stock_min=50000;max_capacity=600000},
  [pscustomobject]@{material_code='PK-BAG-50';description='Cement bag 50 kg';category='Packing';supply_type='BUY';uom='each';unit_cost=1.85;scrap_pct=0.020;lead_time_buckets=3;moq=30000;order_multiple=5000;safety_stock_min=50000;max_capacity=700000},
  [pscustomobject]@{material_code='PK-BAG-55';description='Cement bag 55 kg';category='Packing';supply_type='BUY';uom='each';unit_cost=2.00;scrap_pct=0.020;lead_time_buckets=3;moq=25000;order_multiple=5000;safety_stock_min=40000;max_capacity=600000},
  [pscustomobject]@{material_code='PK-THREAD';description='Bag sewing thread';category='Packing';supply_type='BUY';uom='kg';unit_cost=32;scrap_pct=0.010;lead_time_buckets=2;moq=25;order_multiple=5;safety_stock_min=50;max_capacity=500},
  [pscustomobject]@{material_code='PK-PALLET';description='Wood pallet';category='Packing';supply_type='BUY';uom='each';unit_cost=42;scrap_pct=0.010;lead_time_buckets=2;moq=100;order_multiple=50;safety_stock_min=300;max_capacity=10000},
  [pscustomobject]@{material_code='PK-STRETCH';description='Pallet stretch film';category='Packing';supply_type='BUY';uom='kg';unit_cost=19;scrap_pct=0.020;lead_time_buckets=1;moq=100;order_multiple=25;safety_stock_min=250;max_capacity=2500},
  [pscustomobject]@{material_code='PK-INK';description='Bag printing ink';category='Packing';supply_type='BUY';uom='kg';unit_cost=95;scrap_pct=0.020;lead_time_buckets=2;moq=25;order_multiple=5;safety_stock_min=40;max_capacity=400}
)
$materialByCode = @{}; foreach ($material in $materials) { $materialByCode[$material.material_code] = $material }

$finishedGoods = @($source | Group-Object { "$($_.plant_code)|$($_.fg_code)" } | ForEach-Object {
  $first = $_.Group[0]
  [pscustomobject]@{plant_code=$first.plant_code;fg_code=$first.fg_code;description=$first.description;product_type=$first.product_type;uom='ton';active_flag='true';source_location_tag=$first.source_location_tag}
} | Sort-Object plant_code,fg_code)

$bom = @()
foreach ($fg in $finishedGoods) {
  $name = $fg.description.ToUpperInvariant()
  if ($name -match 'CPJ\s*65') { $recipe = @(@('RM-CLINKER',0.84),@('RM-GYPSUM',0.05),@('RM-LIMESTONE',0.11)) }
  elseif ($name -match 'ECOPLANET|CLC') { $recipe = @(@('RM-CLINKER',0.70),@('RM-GYPSUM',0.05),@('RM-LIMESTONE',0.10),@('RM-FLYASH',0.10),@('RM-SLAG',0.05)) }
  elseif ($name -match 'CPJ\s*45|SWARI|BLINDE|LBNI|PREFA|LAMLIH|DWAM') { $recipe = @(@('RM-CLINKER',0.75),@('RM-GYPSUM',0.05),@('RM-LIMESTONE',0.10),@('RM-POZZOLAN',0.10)) }
  else { $recipe = @(@('RM-CLINKER',0.90),@('RM-GYPSUM',0.05),@('RM-LIMESTONE',0.05)) }
  foreach ($component in $recipe) {
    $mat = $materialByCode[$component[0]]
    $bom += [pscustomobject]@{plant_code=$fg.plant_code;fg_code=$fg.fg_code;component_material_code=$mat.material_code;quantity_per_fg=[decimal]$component[1];quantity_uom=$mat.uom;scrap_factor=$mat.scrap_pct;recipe_source='SYNTHETIC_CEMENT_RECIPE'}
  }
  if ($fg.product_type -eq 'Bagged') {
    $weightMatch = [regex]::Match($name,'(\d{2})\s*KG')
    $bagWeight = if ($weightMatch.Success) { [int]$weightMatch.Groups[1].Value } else { 45 }
    $bagCode = switch ($bagWeight) { 50 {'PK-BAG-50'} 55 {'PK-BAG-55'} default {'PK-BAG-45'} }
    $bag = $materialByCode[$bagCode]
    $bom += [pscustomobject]@{plant_code=$fg.plant_code;fg_code=$fg.fg_code;component_material_code=$bagCode;quantity_per_fg=[math]::Round(1000 / $bagWeight,6);quantity_uom='each';scrap_factor=$bag.scrap_pct;recipe_source='SYNTHETIC_PACKAGING_RECIPE'}
    foreach ($pair in @(@('PK-THREAD',0.04),@('PK-PALLET',0.04),@('PK-STRETCH',0.08),@('PK-INK',0.005))) {
      $mat = $materialByCode[$pair[0]]
      $bom += [pscustomobject]@{plant_code=$fg.plant_code;fg_code=$fg.fg_code;component_material_code=$mat.material_code;quantity_per_fg=[decimal]$pair[1];quantity_uom=$mat.uom;scrap_factor=$mat.scrap_pct;recipe_source='SYNTHETIC_PACKAGING_RECIPE'}
    }
  }
}

$asOfDate = '2026-10-01'
$constraints = @(); $inventory = @()
foreach ($plant in $plants) {
  foreach ($material in $materials) {
    $safety = [decimal]$material.safety_stock_min
    $lead = [int]$material.lead_time_buckets
    $constraints += [pscustomobject]@{plant_code=$plant.plant_code;material_code=$material.material_code;min_stock_qty=$safety;reorder_level=[math]::Round($safety * 1.25,2);max_stock_qty=[math]::Round($safety * 2.5,2);max_storage_capacity=$material.max_capacity;lead_time_buckets=$lead;moq=$material.moq;order_multiple=$material.order_multiple;uom=$material.uom}
    $onHand = [math]::Round($safety * 1.2,2); $reserved = [math]::Round($onHand * 0.05,2); $inTransit = [decimal]0; $case = 'BASELINE'
    if ($plant.plant_code -eq 'P_SET' -and $material.material_code -eq 'RM-CLINKER') { $onHand=2500; $reserved=100; $case='VALIDATION_LOW_STOCK' }
    if ($plant.plant_code -eq 'P_BSK' -and $material.material_code -eq 'PK-BAG-50') { $onHand=0; $reserved=0; $inTransit=20000; $case='VALIDATION_IN_TRANSIT_RECEIPT' }
    if ($plant.plant_code -eq 'P_FES' -and $material.material_code -eq 'RM-GYPSUM') { $onHand=[math]::Round($safety * 3.5,2); $reserved=0; $case='VALIDATION_EXCESS_STOCK' }
    $inventory += [pscustomobject]@{plant_code=$plant.plant_code;material_code=$material.material_code;as_of_date=$asOfDate;on_hand_qty=$onHand;reserved_qty=$reserved;in_transit_qty=$inTransit;in_transit_due_date=if($inTransit -gt 0){'2026-11-08'}else{''};scheduled_receipts_qty=0;uom=$material.uom;validation_case=$case}
  }
}

$start = [datetime]'2026-11-01'
$weeks = @(); for ($i=0; $i -lt 14; $i++) { $weeks += $start.AddDays(7*$i) }
$sourceMonthly = @($source | ForEach-Object { [pscustomobject]@{plant_code=$_.plant_code;fg_code=$_.fg_code;description=$_.description;source_location_tag=$_.source_location_tag;period_start=$_.bucket_date;forecast_qty=$_.forecast_qty;actual_qty=$_.actual_qty;uom='ton';source_file=[IO.Path]::GetFileName($WorkbookPath);plant_mapping='INFERRED_FROM_SKU_DESCRIPTION'} })
$demand = @()
$allocationDetail = @()
foreach ($item in $finishedGoods) {
  foreach ($monthStart in @([datetime]'2026-11-01',[datetime]'2026-12-01',[datetime]'2027-01-01')) {
    $monthEnd = $monthStart.AddMonths(1).AddDays(-1)
    $key = "$($item.plant_code)|$($item.fg_code)|$($monthStart.ToString('yyyy-MM-01',$culture))"
    $monthlyRows = @($source | Where-Object { $_.plant_code -eq $item.plant_code -and $_.fg_code -eq $item.fg_code -and $_.bucket_date.StartsWith($monthStart.ToString('yyyy-MM',$culture)) })
    $monthQty = if ($monthlyRows.Count) { [decimal]$monthlyRows[0].forecast_qty } else { [decimal]0 }
    $actualQty = if ($monthlyRows.Count -and $null -ne $monthlyRows[0].actual_qty) { $monthlyRows[0].actual_qty } else { '' }
    $overlaps = @(); foreach ($week in $weeks) {
      $weekEnd = $week.AddDays(6)
      $from = if ($week -gt $monthStart) { $week } else { $monthStart }
      $to = if ($weekEnd -lt $monthEnd) { $weekEnd } else { $monthEnd }
      if ($to -ge $from) { $overlaps += [pscustomobject]@{week=$week;days=($to-$from).Days+1} }
    }
    $allocated = [decimal]0
    for ($i=0; $i -lt $overlaps.Count; $i++) {
      $qty = if ($i -eq $overlaps.Count-1) { $monthQty - $allocated } else { [math]::Round($monthQty * $overlaps[$i].days / $monthStart.AddMonths(1).AddDays(-$monthStart.Day).Day,2,[MidpointRounding]::AwayFromZero) }
      $allocated += $qty
      $allocationDetail += [pscustomobject]@{plant_code=$item.plant_code;fg_code=$item.fg_code;source_month=$monthStart.ToString('yyyy-MM-01',$culture);bucket_date=$overlaps[$i].week.ToString('yyyy-MM-dd',$culture);allocated_qty=$qty;source_monthly_qty=$monthQty;allocation_method='MONTHLY_TOTAL_PRORATED_BY_OVERLAPPING_DAYS'}
      $demand += [pscustomobject]@{plant_code=$item.plant_code;fg_code=$item.fg_code;bucket_date=$overlaps[$i].week.ToString('yyyy-MM-dd',$culture);bucket_type='Weekly';forecast_qty=$qty;forecast_uom='ton';source_month=$monthStart.ToString('yyyy-MM-01',$culture);source_monthly_qty=$monthQty;source_actual_qty=$actualQty;source_file=[IO.Path]::GetFileName($WorkbookPath);allocation_method='MONTHLY_TOTAL_PRORATED_BY_OVERLAPPING_DAYS';location_mapping='INFERRED_FROM_SKU_DESCRIPTION'}
    }
  }
}
$weeklyDemand = @()
foreach ($group in $demand | Group-Object { "$($_.plant_code)|$($_.fg_code)|$($_.bucket_date)" }) {
  $first = $group.Group[0]
  $weeklyDemand += [pscustomobject]@{
    plant_code=$first.plant_code;fg_code=$first.fg_code;bucket_date=$first.bucket_date
    bucket_type='Weekly';forecast_qty=[math]::Round((($group.Group | Measure-Object forecast_qty -Sum).Sum),2)
    forecast_uom='ton';source_months=(($group.Group.source_month | Sort-Object -Unique) -join ';')
    source_actual_qty='';source_file=[IO.Path]::GetFileName($WorkbookPath)
    allocation_method='MONTHLY_TOTAL_PRORATED_BY_OVERLAPPING_DAYS'
    location_mapping='INFERRED_FROM_SKU_DESCRIPTION'
  }
}
$demand = @($weeklyDemand | Sort-Object plant_code,fg_code,bucket_date)

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$plants | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'plant_master.csv') -NoTypeInformation -Encoding utf8
$materials | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'material_master.csv') -NoTypeInformation -Encoding utf8
$finishedGoods | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'fg_master.csv') -NoTypeInformation -Encoding utf8
$sourceMonthly | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'demand_source_monthly.csv') -NoTypeInformation -Encoding utf8
$allocationDetail | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'demand_allocation_detail.csv') -NoTypeInformation -Encoding utf8
$demand | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'demand_input.csv') -NoTypeInformation -Encoding utf8
$inventory | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'inventory_input.csv') -NoTypeInformation -Encoding utf8
$constraints | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'plant_constraints.csv') -NoTypeInformation -Encoding utf8
$bom | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'bom_input.csv') -NoTypeInformation -Encoding utf8

Write-Output "Plants: $($plants.Count); finished goods: $($finishedGoods.Count); weekly demand rows: $($demand.Count); inventory rows: $($inventory.Count); constraints: $($constraints.Count); BOM rows: $($bom.Count)"
