$ErrorActionPreference = 'Stop'
$OutputPath = Join-Path (Get-Location) 'docs/master_data_guide.pdf'
$PageWidth = 595
$PageHeight = 842
$script:Content = [System.Text.StringBuilder]::new()
$script:Blue = '#1679E8'
$script:Navy = '#17365D'
$script:Ink = '#24364B'
$script:Muted = '#657A94'
$script:Line = '#D9E3EF'
$script:Pale = '#F3F7FC'
$script:Teal = '#159A83'
$script:Amber = '#E8A33C'

function ColorRgb([string]$Hex) {
  $value = $Hex.TrimStart('#')
  $red=[Convert]::ToInt32($value.Substring(0,2),16)/255.0
  $green=[Convert]::ToInt32($value.Substring(2,2),16)/255.0
  $blue=[Convert]::ToInt32($value.Substring(4,2),16)/255.0
  return ,@($red,$green,$blue)
}
function FillColor([string]$Color) { $c=ColorRgb $Color; [void]$script:Content.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0.###} {1:0.###} {2:0.###} rg`n",$c[0],$c[1],$c[2]) }
function StrokeColor([string]$Color) { $c=ColorRgb $Color; [void]$script:Content.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0.###} {1:0.###} {2:0.###} RG`n",$c[0],$c[1],$c[2]) }
function Rect([double]$X,[double]$Y,[double]$W,[double]$H,[string]$Fill,[string]$Stroke=$null) {
  if($Fill){FillColor $Fill}; if($Stroke){StrokeColor $Stroke; [void]$script:Content.Append("1 w`n")}
  $bottom=$PageHeight-$Y-$H
  [void]$script:Content.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0.##} {1:0.##} {2:0.##} {3:0.##} re ",$X,$bottom,$W,$H)
  if($Fill -and $Stroke){[void]$script:Content.Append("B`n")} elseif($Fill){[void]$script:Content.Append("f`n")} elseif($Stroke){[void]$script:Content.Append("S`n")}
}
function Rule([double]$X1,[double]$Y1,[double]$X2,[double]$Y2,[string]$Color='#D9E3EF',[double]$Width=1) {
  StrokeColor $Color; [void]$script:Content.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0.##} w {1:0.##} {2:0.##} m {3:0.##} {4:0.##} l S`n",$Width,$X1,$PageHeight-$Y1,$X2,$PageHeight-$Y2)
}
function Text([double]$X,[double]$Y,[string]$Value,[double]$Size=9,[string]$Color='#24364B',[bool]$Bold=$false) {
  $font=if($Bold){'F2'}else{'F1'}; $rgb=ColorRgb $Color
  $safe=$Value.Replace('\','\\').Replace('(','\(').Replace(')','\)')
  [void]$script:Content.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"BT /{0} {1:0.##} Tf {2:0.###} {3:0.###} {4:0.###} rg 1 0 0 1 {5:0.##} {6:0.##} Tm ({7}) Tj ET`n",$font,$Size,$rgb[0],$rgb[1],$rgb[2],$X,$PageHeight-$Y,$safe)
}
function Wrap([string]$Value,[int]$Limit) {
  $lines=[System.Collections.Generic.List[string]]::new(); $current=''
  foreach($word in ($Value -split '\s+')) {
    if(-not $word){continue}
    if(-not $current){$current=$word}
    elseif(($current.Length+$word.Length+1) -le $Limit){$current+=" $word"}
    else{$lines.Add($current);$current=$word}
  }
  if($current){$lines.Add($current)}
  return ,$lines.ToArray()
}
function Paragraph([double]$X,[double]$Y,[string]$Value,[double]$MaxWidth=500,[double]$Size=9,[string]$Color='#657A94',[double]$Leading=13,[bool]$Bold=$false) {
  $limit=[Math]::Max(10,[int]($MaxWidth/($Size*0.53)))
  $lines=Wrap $Value $limit
  foreach($line in $lines){Text $X $Y $line $Size $Color $Bold; $Y+=$Leading}
  return $Y
}
function PageStart([int]$Number,[string]$Section,[string]$Title,[string]$Subtitle='') {
  $script:Content.Clear()|Out-Null
  Rect 0 0 $PageWidth $PageHeight '#F6F8FB'
  Rect 0 0 $PageWidth 9 $script:Blue
  Text 40 34 'MRP PORTAL  /  MASTER DATA GUIDE' 8 $script:Muted $true
  Text 40 69 $Section.ToUpper() 8 $script:Blue $true
  Text 40 100 $Title 23 $script:Navy $true
  if($Subtitle){Text 40 120 $Subtitle 8.5 $script:Muted}
  Rule 40 133 555 133 $script:Line 1
}
function PageEnd([int]$Number,[string]$Label) {
  Rule 40 806 555 806 $script:Line 0.8
  Text 40 823 $Label 7 $script:Muted
  Text 536 823 ("{0:00}" -f $Number) 8 $script:Blue $true
}
function Table([string[]]$Headers,[object[]]$Rows,[double]$X,[double]$Y,[double[]]$Widths,[double]$FontSize=7.4,[int]$MaxLines=3,[double]$MinRowHeight=20) {
  $headerHeight=23; $width=[double](($Widths | Measure-Object -Sum).Sum)
  Rect $X $Y $width $headerHeight '#E8F0F8' '#D9E3EF'
  $cursor=$X
  for($i=0;$i -lt $Headers.Count;$i++){Text ($cursor+5) ($Y+15) $Headers[$i] 7.2 '#35516F' $true;$cursor+=$Widths[$i]}
  $Y+=$headerHeight; $rowIndex=0
  foreach($row in $Rows){
    $wrapped=[System.Collections.Generic.List[object]]::new(); $linesHigh=1
    for($i=0;$i -lt $Headers.Count;$i++){
      $limit=[Math]::Max(8,[int](($Widths[$i]-10)/($FontSize*0.52)))
      $cellLines=Wrap ([string]$row[$i]) $limit
      if($cellLines.Count -gt $MaxLines){$cellLines=@($cellLines | Select-Object -First $MaxLines);$cellLines[-1]=$cellLines[-1].TrimEnd('.')+'...'}
      $wrapped.Add($cellLines); if($cellLines.Count -gt $linesHigh){$linesHigh=$cellLines.Count}
    }
    $rowHeight=[Math]::Max($MinRowHeight,($linesHigh*9)+8)
    $fill=if($rowIndex%2 -eq 0){'#FFFFFF'}else{'#F3F7FB'}
    Rect $X $Y $width $rowHeight $fill '#E4EAF1'
    $cursor=$X
    for($i=0;$i -lt $Headers.Count;$i++){
      $cellLines=$wrapped[$i]; $cellColor=if($i -eq 0){'#245789'}else{'#475D78'}; for($li=0;$li -lt $cellLines.Count;$li++){Text ($cursor+5) ($Y+12+($li*9)) ([string]$cellLines[$li]) $FontSize $cellColor ($i -eq 0)}
      $cursor+=$Widths[$i]
    }
    $Y+=$rowHeight; $rowIndex++
  }
  return $Y
}
function Card([double]$X,[double]$Y,[double]$W,[double]$H,[string]$Title,[string]$Body,[string]$Tag='') {
  Rect $X $Y $W $H '#FFFFFF' '#DCE5EF'
  Rect $X $Y 4 $H $script:Blue
  if($Tag){Text ($X+13) ($Y+17) $Tag.ToUpper() 6.5 $script:Blue $true; Text ($X+13) ($Y+34) $Title 10 $script:Navy $true; [void](Paragraph ($X+13) ($Y+51) $Body ($W-26) 7.2 '#5F7188' 10)}
  else{Text ($X+13) ($Y+20) $Title 10 $script:Navy $true; [void](Paragraph ($X+13) ($Y+38) $Body ($W-26) 7.4 '#5F7188' 10)}
}

$pages=[System.Collections.Generic.List[byte[]]]::new()

# 1 - cover and key implementation note
$script:Content.Clear()|Out-Null
Rect 0 0 $PageWidth $PageHeight '#17365D'
Rect 0 0 $PageWidth 12 '#43B9AB'
Text 48 56 'MRP PORTAL  /  VISUAL OPERATING GUIDE' 8 '#A6DDD4' $true
Text 48 176 'MASTER' 35 '#FFFFFF' $true
Text 48 221 'DATA' 35 '#80D4C5' $true
[void](Paragraph 49 255 'A visual guide to the five data domains, every supported upload field, and how master records feed a tenant MRP plan.' 465 12 '#E0EAF6' 18)
Rect 48 335 499 146 '#24496F' '#4B6E90'
Text 68 365 'IMPORTANT: SAMPLE DISPLAY VS. REAL TENANT DATA' 8.3 '#A6DDD4' $true
[void](Paragraph 68 391 'The Master Data grid and its counts are currently hard-coded demonstration rows. CSV upload is a separate working flow that writes supported records into the selected tenant database. The grid does not yet display uploaded records.' 454 10 '#FFFFFF' 15)
Rect 68 445 210 24 '#3B5F81'
Text 79 461 'DEMO GRID  !=  DATABASE CATALOG' 7.2 '#FFFFFF' $true
Text 48 526 'THE PLANNING FLOW' 8 '#A6DDD4' $true
$chips=@(@('Plant',48,555,69),@('Materials',131,555,83),@('Products + BOM',228,555,126),@('Constraints',365,555,96),@('Stock + demand',471,555,76))
foreach($chip in $chips){Rect $chip[1] $chip[2] $chip[3] 33 '#24496F' '#5D7D9B';Text ($chip[1]+7) ($chip[2]+21) $chip[0] 7 '#FFFFFF' $true}
Text 48 619 'Then MRP explodes demand through the BOM, nets it against stock and receipts,' 9 '#DCE7F4'
Text 48 635 'and applies safety stock, order sizing, lead time, and capacity checks.' 9 '#DCE7F4'
Rule 48 781 547 781 '#5D7D9B' 0.8
Text 48 800 'Purpose  |  fields  |  sources  |  calculation flow' 7.5 '#B7C9DC'
Text 514 800 '01' 8 '#A6DDD4' $true
$pages.Add([System.Text.Encoding]::ASCII.GetBytes($script:Content.ToString()))

# 2 - interface map
PageStart 2 '01 / Read the page correctly' 'Screen map' 'Understand which controls are operational before relying on the displayed values.'
Card 40 148 248 91 'Working tenant path' 'Select the tenant, select an upload type, and upload a valid CSV. The server validates fields and references, then writes records to that tenant schema.' 'DATABASE-BACKED'
Card 300 148 255 91 'Demo display path' 'Grid rows, counts, owners, statuses, KPIs, sync time, data score, Add/Edit, Toggle and Export are local sample UI, not persisted tenant data.' 'FRONTEND SAMPLE'
Text 40 264 'HEADER + CONTROLS' 8 $script:Blue $true
$controls=@(
  @('Tenant selector','Sets tenant context for CSV API uploads; verify before every upload.'),
  @('Export','Downloads filtered demo rows; it is not a database export.'),
  @('Upload type','Plant master, Material master, Finished goods, Plant constraints, or BOM.'),
  @('Upload CSV','Uploads selected CSV and reports success or validation/reference errors.'),
  @('Add [record]','Opens generic demo form; browser-only state, not a database create.'),
  @('Search / status','Filters displayed demo rows by text and sample status.'),
  @('Row actions','Edit/Toggle are local; Copy code copies the displayed identifier.'),
  @('Checkbox / pages','Visual sample controls; no connected bulk or database pagination.')
)
$y=Table @('CONTROL','WHAT IT DOES') $controls 40 275 @(115,400) 7.8 2
Text 40 ($y+17) 'GRID COLUMNS' 8 $script:Blue $true
$columns=@(
  @('Code / Name','Business identifier and readable label for the sample row.'),
  @('Category / Type','Grouping whose meaning changes with the selected domain.'),
  @('Unit','UOM for items; demo table may reuse it for lead time, location, or value.'),
  @('Planning attributes','Short demo note; real import uses individual typed CSV columns.'),
  @('Updated / Owner / Status','Illustrative labels, not tenant audit or activation state.'),
  @('Master records / Active','Counts over local demo arrays, not uploaded tenant rows.'),
  @('Needs review / Last sync','Static demonstration metrics; no live quality scan or sync timestamp.'),
  @('Data quality','Fixed sample percentage; not computed from database validation.')
)
[void](Table @('FIELD','MEANING') $columns 40 ($y+27) @(155,360) 7.5 2)
Text 40 721 'ADD / EDIT FORM' 7.6 $script:Blue $true
[void](Paragraph 40 736 'Code and Name are required. Category/Type, Unit or Value, and Planning attributes/Notes are generic optional inputs. They do not map all database columns and remain local demo state.' 510 7.2 '#5F7188' 10)
PageEnd 2 'Master Data | current screen behavior'
$pages.Add([System.Text.Encoding]::ASCII.GetBytes($script:Content.ToString()))

# 3 - data domains
PageStart 3 '02 / The five data domains' 'Purpose, source, and use' 'These are page groupings, not five physical database tables.'
$domainCards=@(
  @('1 / MATERIALS','Components and supply items','Demo examples: RM-0045 Aluminum Sheet, MT-0012 Motor Assembly, PK-3011 Packaging Box, SP-7781 Screw M6, RM-1120 Copper Wire, EL-2204 Control Relay.','Actual MRP source: Material master CSV. Defines unit, cost, scrap, sourcing and replenishment policy.'),
  @('2 / PRODUCTS + BOMS','Forecastable products and recipes','Demo products: PRD-1001 Control Panel, PRD-1002 Switch Assembly, PRD-1003 Power Module, PRD-1004 Enclosure Unit.','Actual MRP sources: Finished goods + Bill of materials CSVs. BOM ratios translate product demand into components.'),
  @('3 / SUPPLIERS','Vendor identity and performance','Demo examples: SUP-001 ABC Suppliers, SUP-002 Global Traders, SUP-004 PackRight Solutions.','Current state: hard-coded sample only. No Supplier upload or database CRUD path exists on this page.'),
  @('4 / LOCATIONS','Sites, plants and warehouses','Demo examples: LOC-001 Main Warehouse, LOC-002 Plant North, LOC-003 Plant Central.','Actual MRP source: Plant master CSV. Plant code scopes demand, stock, products, BOM and constraints.'),
  @('5 / PLANNING PARAMETERS','Replenishment policy values','Demo examples: Default service level, Planning time fence, Default calendar.','Actual MRP sources: Material master + Plant constraints. The demo items themselves are not applied.'),
  @('OTHER PLANNING INPUTS','Stock and forecast','These are not Master Data tabs. Inventory and Demand Planning provide changing, time-phased operating data.','Actual sources: Inventory CSV + weekly/monthly demand CSV or imported workbook scenario.')
)
$coords=@(@(40,148),@(305,148),@(40,280),@(305,280),@(40,412),@(305,412))
for($i=0;$i -lt $domainCards.Count;$i++){
  $d=$domainCards[$i];$x=$coords[$i][0];$top=$coords[$i][1]
  Rect $x $top 250 119 '#FFFFFF' '#DCE5EF';Rect $x $top 4 119 $(if($i -eq 2){$script:Amber}else{$script:Blue})
  Text ($x+13) ($top+17) $d[0] 7 $script:Blue $true;Text ($x+13) ($top+34) $d[1] 9.5 $script:Navy $true
  $yy=Paragraph ($x+13) ($top+50) $d[2] 222 7.1 '#5F7188' 9
  [void](Paragraph ($x+13) ($yy+2) $d[3] 222 7.1 '#16766A' 9 $true)
}
Rect 40 552 515 112 '#FFF5E8' '#EFD4AC'
Text 56 577 'WHERE DO THE VISIBLE RECORDS COME FROM?' 8 '#95600E' $true
[void](Paragraph 56 597 'The example codes and names above are seeded in the frontend source for screen demonstration. They do not come from SAP, ERP, a vendor integration, or the selected tenant database. A CSV upload may succeed even though the static grid does not refresh.' 480 8.6 '#765321' 12)
Text 40 669 'DOMAIN TO REAL UPLOAD TYPE' 8 $script:Blue $true
$mapRows=@(@('Materials','Material master'),@('Products','Finished goods + Bill of materials'),@('Locations','Plant master'),@('Planning Parameters','Material master + Plant constraints'),@('Suppliers','No upload type currently supported'))
[void](Table @('PAGE DOMAIN','TENANT DATABASE INPUT') $mapRows 40 682 @(190,325) 7.5 1 18)
PageEnd 3 'Master Data | demo examples vs. MRP source data'
$pages.Add([System.Text.Encoding]::ASCII.GetBytes($script:Content.ToString()))

# 4 - plants and materials
PageStart 4 '03 / CSV field reference' 'Plant + material master' 'Upload these foundation records first; later files depend on their identifiers.'
Card 40 145 515 49 'PLANT MASTER' 'Answers: where does planning take place? Country code and plant code are shared references for tenant operations.'
$plantRows=@(
  @('plant_code','Stable plant key referenced by products, BOM, inventory, constraints, and demand.'),
  @('plant_name','Readable name for the facility.'),
  @('country_code','Three-letter country code for country filter and currency context; country must be configured or supplied with supported metadata.'),
  @('location','Descriptive city, region, or site location.'),
  @('active_flag','true/false; inactive plants are excluded from planning options.')
)
$y=Table @('CSV FIELD','MEANING + MRP USE') $plantRows 40 204 @(125,390) 7.5 2
Card 40 ($y+12) 515 48 'MATERIAL MASTER' 'Answers: what item is needed, in what unit, and with what supply and replenishment policy?'
$materialRows=@(
  @('material_code','Unique tenant item key referenced by BOM, inventory, and constraints.'),
  @('description','Readable material name.'),
  @('category','Raw, Packing, or Intermediate; classification and filtering.'),
  @('supply_type','BUY = procure externally. MAKE = manufacture internally; MAKE materials may have their own BOM.'),
  @('uom','Stock/planning unit such as ton, kg, or each. Keep coherent with BOM and stock.'),
  @('unit_cost','Cost per unit used in planned procurement value and spend reporting.'),
  @('scrap_pct','Loss fraction from 0 up to but not including 1; 0.02 means 2% extra consumption.'),
  @('lead_time_buckets','Weekly/monthly replenishment buckets; interpretation follows the run time-bucket type.'),
  @('moq','Minimum order quantity applied when net requirement is positive.'),
  @('order_multiple','Order increment to round suggested quantity upward to.'),
  @('safety_stock_min','Default projected-stock floor; plant constraints may override it.'),
  @('max_capacity','Default capacity ceiling for alerts; plant constraints may override it.')
)
[void](Table @('CSV FIELD','MEANING + MRP USE') $materialRows 40 ($y+64) @(125,390) 7.2 2)
Rect 40 760 515 29 '#EAF5F2' '#BDE0D7'
Text 51 778 'Keep units consistent: BOM consumption and stock must use compatible UOMs.' 7.4 '#35665B' $true
PageEnd 4 'Master Data | plant and material fields'
$pages.Add([System.Text.Encoding]::ASCII.GetBytes($script:Content.ToString()))

# 5 - finished goods BOM constraints
PageStart 5 '04 / CSV field reference' 'Products + replenishment policy' 'These records connect forecasted finished goods to the materials that must be supplied.'
Text 40 153 'FINISHED GOODS' 8 $script:Blue $true
$fgRows=@(
  @('plant_code','Plant where product is planned; must exist.'),@('fg_code','Finished-good key used by demand and BOM parent.'),@('description','Readable product name.'),@('product_type','Bulk or Bagged; supports product-type filtering.'),@('uom','Forecast/output unit coherent with demand and BOM ratio.'),@('active_flag','true/false; only active products are available for planning.')
)
$y=Table @('CSV FIELD','MEANING + MRP USE') $fgRows 40 164 @(125,390) 7.2 2
Text 40 ($y+14) 'BILL OF MATERIALS (BOM)' 8 $script:Blue $true
$bomRows=@(
  @('plant_code','Plant-specific product structure.'),@('fg_code','Parent finished good; must exist at the same plant.'),@('component_material_code','Consumed child material; must exist in Material master.'),@('quantity_per_fg','Component quantity needed per one parent unit; core BOM ratio.'),@('quantity_uom','Source unit for component quantity; keep consistent with material.'),@('scrap_factor','Optional source field. Current import/calculation ignores it; material scrap_pct is used.')
)
$y=Table @('CSV FIELD','MEANING + MRP USE') $bomRows 40 ($y+27) @(155,360) 7.1 2
Rect 40 ($y+8) 515 42 '#FFF5E8' '#EFD4AC'
Text 51 ($y+24) 'BOM upload replaces all existing components for every parent included.' 7.4 '#95600E' $true
Text 51 ($y+38) 'Upload complete component rows; a partial file removes omitted components.' 7.2 '#765321'
Text 40 ($y+65) 'PLANT CONSTRAINTS' 8 $script:Blue $true
$constraintRows=@(
  @('plant_code + material_code','Plant/material pair the rule applies to; both must exist.'),
  @('min_stock_qty','Plant-level projected stock floor used as safety-stock target.'),
  @('reorder_level','Stored reorder point; not used by current forward netting formula.'),
  @('max_stock_qty','Maximum stock reference and fallback capacity limit.'),
  @('max_storage_capacity','Storage limit used for capacity alert when provided.'),
  @('lead_time_buckets','Plant/material lead-time override; material default is fallback.'),
  @('moq','Plant/material minimum-order override.'),
  @('order_multiple','Plant/material order-increment override.'),
  @('uom','Optional reference unit for constraint quantities.')
)
[void](Table @('CSV FIELD','MEANING + MRP USE') $constraintRows 40 ($y+78) @(155,360) 7.1 2)
Text 40 783 'Demo service level, planning time fence, and calendar are not currently applied by forward MRP.' 7 '#765321'
PageEnd 5 'Master Data | product, BOM, and constraints'
$pages.Add([System.Text.Encoding]::ASCII.GetBytes($script:Content.ToString()))

# 6 - flow and calculation
PageStart 6 '05 / From upload to decision' 'How MRP uses master data' 'The order below satisfies reference checks and produces traceable time-phased requirements.'
$steps=@(@('1','PLANT','site + country'),@('2','MATERIALS','items + policy'),@('3','PRODUCTS','finished goods'),@('4','CONSTRAINTS','plant overrides'),@('5','BOM','complete recipe'),@('6','STOCK','on-hand + receipts'),@('7','DEMAND','forecast periods'),@('8','RUN MRP','selected tenant'))
$x=40;$top=153
for($i=0;$i -lt $steps.Count;$i++){
  $s=$steps[$i];Rect $x $top 119 51 '#FFFFFF' '#DCE5EF';Rect $x $top 24 24 '#E7F1FF'
  Text ($x+8) ($top+16) $s[0] 8 $script:Blue $true;Text ($x+31) ($top+16) $s[1] 6.6 $script:Navy $true;Text ($x+8) ($top+39) $s[2] 7 $script:Muted
  $x+=132;if($i -eq 3){$x=40;$top=216}
}
Rect 40 287 515 79 '#17365D'
Text 58 313 'GROSS COMPONENT REQUIREMENT' 7.5 '#A6DDD4' $true
Text 58 340 'Forecast x BOM ratio x (1 + material scrap_pct)' 14 '#FFFFFF' $true
Text 58 356 'Aggregated by plant, material, and planning time bucket.' 7.5 '#DCE7F4'
Card 40 385 250 101 'NET + SIZE' 'Net scheduled and in-transit receipts and gross requirements against projected stock. If stock would fall below the minimum, the gap is net requirement. Apply MOQ and order multiple; use lead time for release timing.' 'CALCULATION'
Card 305 385 250 101 'ALERT + REVIEW' 'Capacity alert when projected stock exceeds configured capacity. Expedite alert when release is due by the first bucket. MRP creates recommendations; it does not send a supplier order.' 'OUTPUT'
Text 40 511 'RECOMMENDED UPLOAD ORDER' 8 $script:Blue $true
$order=@(@('1','Plant master'),@('2','Material master'),@('3','Finished goods'),@('4','Plant constraints'),@('5','Bill of materials'),@('6','Inventory & stock'),@('7','Demand / scenario'),@('8','Run MRP'))
[void](Table @('STEP','ACTION') $order 40 523 @(72,443) 7.5 1)
Rect 40 744 515 49 '#FFF5E8' '#EFD4AC'
Text 51 762 'CURRENT FORMULA BOUNDARIES' 7.3 '#95600E' $true
Text 51 779 'Reserved stock is not deducted; reorder_level is stored but not netted; BOM scrap_factor is ignored.' 6.6 '#765321'
Text 51 789 'Material scrap_pct is applied. Maximum capacity flags excess stock but does not cap order quantity.' 6.6 '#765321'
PageEnd 6 'Master Data | upload order, formula, and limits'
$pages.Add([System.Text.Encoding]::ASCII.GetBytes($script:Content.ToString()))

# Assemble a standards-compliant PDF with built-in Helvetica fonts.
$objects=[System.Collections.Generic.List[byte[]]]::new()
$ascii=[System.Text.Encoding]::ASCII
function Obj([string]$TextValue){$objects.Add($ascii.GetBytes($TextValue))}
Obj '<< /Type /Catalog /Pages 2 0 R >>'
$pageKids=@(for($i=0;$i -lt $pages.Count;$i++){$pageObj=5+($i*2);"$pageObj 0 R"})
Obj ("<< /Type /Pages /Kids ["+($pageKids -join ' ')+"] /Count $($pages.Count) >>")
Obj '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
Obj '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
for($i=0;$i -lt $pages.Count;$i++){
  $pageObj=5+($i*2);$streamObj=$pageObj+1;$stream=$pages[$i]
  Obj "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $streamObj 0 R >>"
  $streamText=$ascii.GetString($stream)
  Obj ("<< /Length $($stream.Length) >>`nstream`n$streamText`nendstream")
}
$pdf=[System.IO.MemoryStream]::new();$head=$ascii.GetBytes("%PDF-1.4`n%MRPGuide`n");$pdf.Write($head,0,$head.Length)
$offsets=[System.Collections.Generic.List[long]]::new();$offsets.Add(0)
for($i=0;$i -lt $objects.Count;$i++){
  $offsets.Add($pdf.Position);$prefix=$ascii.GetBytes("$($i+1) 0 obj`n");$pdf.Write($prefix,0,$prefix.Length)
  $pdf.Write($objects[$i],0,$objects[$i].Length);$suffix=$ascii.GetBytes("`nendobj`n");$pdf.Write($suffix,0,$suffix.Length)
}
$xrefOffset=$pdf.Position;$xref=[System.Text.StringBuilder]::new();[void]$xref.Append("xref`n0 $($objects.Count+1)`n0000000000 65535 f `n")
for($i=1;$i -lt $offsets.Count;$i++){[void]$xref.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0000000000} 00000 n `n",$offsets[$i])}
[void]$xref.Append("trailer`n<< /Size $($objects.Count+1) /Root 1 0 R >>`nstartxref`n$xrefOffset`n%%EOF`n")
$tail=$ascii.GetBytes($xref.ToString());$pdf.Write($tail,0,$tail.Length)
[System.IO.File]::WriteAllBytes($OutputPath,$pdf.ToArray())
Write-Host "Wrote $OutputPath ($($pages.Count) pages, $((Get-Item $OutputPath).Length) bytes)"
