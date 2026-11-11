$ErrorActionPreference='Stop'
$root=Get-Location
$source=Join-Path $root 'docs/forward_mrp_dashboard_guide.md'
$output=Join-Path $root 'docs/forward_mrp_dashboard_guide.pdf'
$W=595;$H=842;$script:C=[Text.StringBuilder]::new();$pages=[Collections.Generic.List[byte[]]]::new();$ascii=[Text.Encoding]::ASCII
function color([string]$hex){$v=$hex.TrimStart('#');$r=[Convert]::ToInt32($v.Substring(0,2),16);$g=[Convert]::ToInt32($v.Substring(2,2),16);$b=[Convert]::ToInt32($v.Substring(4,2),16);return ,@(($r/255.0),($g/255.0),($b/255.0))}
function rect([double]$x,[double]$y,[double]$w,[double]$h,[string]$hex){$c=color $hex;[void]$script:C.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0.###} {1:0.###} {2:0.###} rg {3:0.##} {4:0.##} {5:0.##} {6:0.##} re f`n",$c[0],$c[1],$c[2],$x,$H-$y-$h,$w,$h)}
function text([double]$x,[double]$y,[string]$value,[double]$size=8.4,[string]$hex='#354A63',[bool]$bold=$false){$c=color $hex;$font=if($bold){'F2'}else{'F1'};$v=$value.Replace('\','\\').Replace('(','\(').Replace(')','\)');[void]$script:C.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"BT /{0} {1:0.##} Tf {2:0.###} {3:0.###} {4:0.###} rg 1 0 0 1 {5:0.##} {6:0.##} Tm ({7}) Tj ET`n",$font,$size,$c[0],$c[1],$c[2],$x,$H-$y,$v)}
function lines([string]$value,[int]$limit){$result=[Collections.Generic.List[string]]::new();$line='';foreach($word in ($value -split '\s+')){if(!$word){continue};if(!$line){$line=$word}elseif(($line.Length+$word.Length+1)-le $limit){$line+=" $word"}else{$result.Add($line);$line=$word}};if($line){$result.Add($line)};return ,$result.ToArray()}
function beginPage([int]$n){$script:C.Clear()|Out-Null;rect 0 0 $W $H '#F8FAFC';rect 0 0 $W 8 '#1679E8';text 40 32 'MRP PORTAL  /  FORWARD MRP PLAN GUIDE' 7.5 '#657A94' $true;rect 40 48 515 1 '#D9E3EF';text 40 822 'Dashboard | Forward MRP Plan | field-by-field guide' 7 '#71839A';text 538 822 ("{0:00}" -f $n) 8 '#1679E8' $true;$script:Y=73}
function finishPage{$pages.Add($ascii.GetBytes($script:C.ToString()))}
function addBlock([string]$value,[string]$kind='p'){
  $txt=$value.Trim();if(!$txt){$script:Y+=3;return}
  $txt=$txt -replace '\*\*','' -replace '`','' -replace '\[([^\]]+)\]\([^)]+\)','$1' -replace '^[-*+]\s+','• ' -replace '^\d+\.\s+','• '
  $size=8.2;$lead=11.5;$hex='#40556E';$bold=$false;$indent=42
  switch($kind){'h1'{$size=19;$lead=24;$hex='#17365D';$bold=$true;$script:Y+=5} 'h2'{$size=13;$lead=17;$hex='#17365D';$bold=$true;$script:Y+=6} 'h3'{$size=10;$lead=13;$hex='#1679E8';$bold=$true;$script:Y+=3} 'table'{$size=7.4;$lead=10;$indent=48} 'code'{$size=7.8;$lead=11;$hex='#245789';$indent=50} 'callout'{$size=8.2;$lead=12;$hex='#765321';$indent=50}}
  $wrapLimit=[Math]::Max(25,[int]((515-($indent-40))/($size*.50)))
  $wrapped=lines $txt $wrapLimit
  if($script:Y+($wrapped.Count*$lead)+8 -gt 797){finishPage;beginPage ($pages.Count+1)}
  if($kind -eq 'table'){rect 40 ($script:Y-8) 515 (($wrapped.Count*$lead)+10) '#F0F5FA'}
  if($kind -eq 'callout'){rect 40 ($script:Y-8) 515 (($wrapped.Count*$lead)+10) '#FFF6E8'}
  foreach($l in $wrapped){text $indent $script:Y $l $size $hex $bold;$script:Y+=$lead}
  $script:Y+=5
}

# Cover page
$script:C.Clear()|Out-Null;rect 0 0 $W $H '#17365D';rect 0 0 $W 12 '#43B9AB';text 48 58 'MRP PORTAL  /  VISUAL OPERATING GUIDE' 8 '#A6DDD4' $true;text 48 165 'DASHBOARD' 31 '#FFFFFF' $true;text 48 207 'FORWARD MRP PLAN' 25 '#80D4C5' $true
[void]$script:C.Append("`n")
$coverLines=@('A plain-language field guide to the planning controls, demand scenarios, charts, KPI cards, and time-phased material table.','')
$y=250;foreach($line in $coverLines){if($line){text 49 $y $line 11 '#E0EAF6';$y+=20}else{$y+=10}}
rect 48 328 499 145 '#24496F';text 67 357 'WHAT THE DASHBOARD ANSWERS' 8.5 '#A6DDD4' $true
text 67 383 'How much material will each plant need, when will stock fall short,' 9.4 '#FFFFFF';text 67 400 'and what replenishment should a planner review?' 9.4 '#FFFFFF'
text 67 438 'This is a recommendation. It does not create or release a purchase order.' 8.1 '#DCE7F4'
text 48 521 'THE PLANNING FLOW' 8 '#A6DDD4' $true
$chips=@(@('Forecast',48),@('BOM',151),@('Stock + receipts',226),@('Net need',361),@('Order advice',445));foreach($chip in $chips){rect $chip[1] 545 95 34 '#2A5278';text ($chip[1]+8) 566 $chip[0] 7.2 '#FFFFFF' $true}
text 48 630 'Tenant data + selected forecast -> material demand -> supply netting' 9 '#E0EAF6';text 48 649 '-> planned orders, release dates, and capacity alerts' 9 '#E0EAF6';rect 48 774 499 1 '#5D7D9B';text 48 797 'Purpose  |  inputs  |  formulas  |  outputs  |  current behavior' 7.5 '#B7C9DC';text 520 797 '01' 8 '#A6DDD4' $true;$pages.Add($ascii.GetBytes($script:C.ToString()))

# Convert Markdown to readable, paginated PDF text. Tables become field-by-field paragraphs.
$content=Get-Content -Raw -Encoding UTF8 $source
$content=$content -replace '(?m)^```.*$', ''
$rawLines=$content -split "`r?`n";$insideCode=$false;$inTable=$false;beginPage 2
foreach($line in $rawLines){
  $s=$line.Trim();if(!$s){$inTable=$false;continue}
  if($s.StartsWith('|')){
    if($s -match '^\|?\s*:?-{3,}') {continue}
    $cells=@($s.Trim('|').Split('|')|ForEach-Object{$_.Trim()})
    if($cells.Count -ge 2){$rowText=if($cells.Count -eq 2){"$($cells[0]) - $($cells[1])"}else{"$($cells[0]) - $($cells[1..($cells.Count-1)] -join ' | ')"};addBlock $rowText 'table'}
    $inTable=$true;continue
  }
  if($s -match '^#{1}\s+(.+)'){addBlock $Matches[1] 'h1';continue}
  if($s -match '^#{2}\s+(.+)'){addBlock $Matches[1] 'h2';continue}
  if($s -match '^#{3,}\s+(.+)'){addBlock $Matches[1] 'h3';continue}
  if($s -match '^>\s*(.+)'){addBlock $Matches[1] 'callout';continue}
  if($s -match '^[-*+]\s+' -or $s -match '^\d+\.\s+'){addBlock $s;continue}
  if($s -match '^---+$'){continue}
  if($s -match '^`'){addBlock $s 'code';continue}
  addBlock $s
}
finishPage

# Assemble a PDF with built-in Helvetica fonts.
$objects=[Collections.Generic.List[byte[]]]::new();function pdfobj([string]$s){$objects.Add($ascii.GetBytes($s))};pdfobj '<< /Type /Catalog /Pages 2 0 R >>';$kids=@(for($i=0;$i -lt $pages.Count;$i++){"$((5+2*$i)) 0 R"});$kidText=$kids -join ' ';pdfobj ("<< /Type /Pages /Kids [$kidText] /Count $($pages.Count) >>");pdfobj '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';pdfobj '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
for($i=0;$i -lt $pages.Count;$i++){$p=5+2*$i;$stream=$pages[$i];pdfobj "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $($p+1) 0 R >>";$body=$ascii.GetString($stream);pdfobj "<< /Length $($stream.Length) >>`nstream`n$body`nendstream"}
$ms=[IO.MemoryStream]::new();$header=$ascii.GetBytes("%PDF-1.4`n%MRPGuide`n");$ms.Write($header,0,$header.Length);$offsets=[Collections.Generic.List[long]]::new();$offsets.Add(0);for($i=0;$i -lt $objects.Count;$i++){$offsets.Add($ms.Position);$b=$ascii.GetBytes("$($i+1) 0 obj`n");$ms.Write($b,0,$b.Length);$ms.Write($objects[$i],0,$objects[$i].Length);$b=$ascii.GetBytes("`nendobj`n");$ms.Write($b,0,$b.Length)};$xref=$ms.Position;$sb=[Text.StringBuilder]::new();[void]$sb.Append("xref`n0 $($objects.Count+1)`n0000000000 65535 f `n");for($i=1;$i -lt $offsets.Count;$i++){[void]$sb.AppendFormat([Globalization.CultureInfo]::InvariantCulture,"{0:0000000000} 00000 n `n",$offsets[$i])};[void]$sb.Append("trailer`n<< /Size $($objects.Count+1) /Root 1 0 R >>`nstartxref`n$xref`n%%EOF`n");$tail=$ascii.GetBytes($sb.ToString());$ms.Write($tail,0,$tail.Length);[IO.File]::WriteAllBytes($output,$ms.ToArray());Write-Host "Wrote $output ($($pages.Count) pages)"
