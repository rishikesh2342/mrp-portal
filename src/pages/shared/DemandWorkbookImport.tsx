import { useMemo, useRef, useState } from "react";
import { FileUp, LoaderCircle, X } from "lucide-react";
import { readXlsx } from "../../lib/xlsx-reader";
import "./DemandWorkbookImport.css";

type Plant = { plant_code: string; plant_name: string };
type FG = { plant_code: string; fg_code: string; description: string };
type ParsedSheet = { name: string; rows: string[][] };
type Props = { plants: Plant[]; finishedGoods: FG[]; onNotify: (message: string) => void; onImported: (id: string, bucket: "Monthly" | "Weekly") => void };
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const dateHeader = (s: string) => /^(\d{4}[-/]\d{1,2}([-/]\d{1,2})?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}-w\d{1,2}|w\d{1,2}[- ]\d{4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(s.trim()) || (/^\d{5}(\.\d+)?$/.test(s.trim()) && Number(s) > 30000 && Number(s) < 80000);
const findColumn = (headers: string[], words: string[]) => headers.findIndex((h) => words.some((word) => slug(h).includes(word)));
const normCode = (s: string) => s.trim().replace(/^0+(?=\d)/, "");
const guessScenarioType = (name: string) => {
  const text = name.toLowerCase();
  if (/previous\s*year|prior\s*year|py\s*[-_ ]?volume/.test(text)) return "previous_year";
  if (/actual|sales\s*history/.test(text)) return "actual";
  if (/system/.test(text)) return "system_forecast";
  if (/consensus/.test(text)) return "consensus_forecast";
  return "custom_forecast";
};

function parseDate(header: string, format: "DMY" | "MDY") {
  const text = header.trim();
  let year: number, month: number, day: number;
  if (/^\d{5}(\.\d+)?$/.test(text) && Number(text) > 30000 && Number(text) < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000).toISOString().slice(0, 10);
  }
  let week = text.match(/^(\d{4})-W(\d{1,2})$/i) || text.match(/^W(\d{1,2})[- ](\d{4})$/i);
  if (week) {
    const year = Number(week[1].toLowerCase().startsWith("w") ? week[2] : week[1]);
    const number = Number(week[1].toLowerCase().startsWith("w") ? week[1].slice(1) : week[2]);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (number - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }
  let m = text.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/);
  if (m) { year = Number(m[1]); month = Number(m[2]); day = Number(m[3] || 1); }
  else if ((m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/))) {
    const a = Number(m[1]), b = Number(m[2]);
    month = format === "DMY" ? b : a; day = format === "DMY" ? a : b; year = Number(m[3]);
    if (year < 100) year += 2000;
  } else if ((m = text.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[ -](\d{2,4})$/i))) {
    month = new Date(`${m[1]} 1, 2000`).getMonth() + 1; year = Number(m[2]); if (year < 100) year += 2000; day = 1;
  } else return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function DemandWorkbookImport({ plants, finishedGoods, onNotify, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [plantCol, setPlantCol] = useState(0);
  const [fgCol, setFgCol] = useState(0);
  const [dateCols, setDateCols] = useState<number[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioType, setScenarioType] = useState("consensus_forecast");
  const [bucket, setBucket] = useState<"Monthly" | "Weekly">("Monthly");
  const [dateFormat, setDateFormat] = useState<"DMY" | "MDY">("DMY");
  const [plantMap, setPlantMap] = useState<Record<string, string>>({});
  const [fgMap, setFgMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const sheet = sheets[sheetIndex];
  const dataRows = useMemo(() => sheet?.rows.slice(headerRow + 1).filter((row) => row.some(Boolean)) || [], [sheet, headerRow]);
  const sourcePlants = [...new Set(dataRows.map((r) => r[plantCol] || "").filter(Boolean))];
  const sourceFgs = [...new Set(dataRows.map((r) => r[fgCol] || "").filter(Boolean))];
  const missingPlants = sourcePlants.filter((code) => !plantMap[code] && !plants.some((p) => normCode(p.plant_code) === normCode(code)));
  const missingFgs = sourceFgs.filter((code) => !fgMap[code] && !finishedGoods.some((fg) => normCode(fg.fg_code) === normCode(code)));

  const analyze = (next: ParsedSheet[], idx: number) => {
    const candidate = next[idx];
    if (!candidate) return;
    const best = candidate.rows.slice(0, 25).map((row, i) => ({ row, i, score: row.filter((v) => dateHeader(v)).length + (findColumn(row, ["plant", "site"]) >= 0 ? 2 : 0) + (findColumn(row, ["material", "product", "fg_code", "sku"]) >= 0 ? 2 : 0) })).sort((a,b) => b.score - a.score)[0];
    const index = best?.i || 0;
    const cols = (candidate.rows[index] || []).map((h) => h.trim());
    setHeaderRow(index); setHeaders(cols);
    setPlantCol(Math.max(0, findColumn(cols, ["plant", "site"])));
    setFgCol(Math.max(0, findColumn(cols, ["material", "product", "fg_code", "sku"])));
    setDateCols(cols.map((h, i) => dateHeader(h) && parseDate(h, "DMY") ? i : -1).filter((i) => i >= 0));
    setScenarioName(candidate.name);
    setScenarioType(guessScenarioType(candidate.name));
  };
  const loadFile = async (file?: File) => {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) { onNotify("Choose an Excel .xlsx workbook."); return; }
    if (file.size > 30 * 1024 * 1024) { onNotify("Workbook must be 30 MB or smaller."); return; }
    setBusy(true);
    try {
      const parsed = await readXlsx(file);
      setFileName(file.name); setSheets(parsed.sheets); setSheetIndex(0); setOpen(true); analyze(parsed.sheets, 0);
      setPlantMap({}); setFgMap({});
    } catch (error) { onNotify(error instanceof Error ? error.message : "Could not read workbook."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  const importSheet = async () => {
    if (!sheet || !dateCols.length) { onNotify("Choose a worksheet with dated forecast columns."); return; }
    if (missingPlants.length || missingFgs.length) {
      onNotify(`Map all source codes first. Unmapped plants: ${missingPlants.length}; unmapped products: ${missingFgs.length}.`);
      return;
    }
    setBusy(true);
    try {
      const rows = dataRows.flatMap((row, rowIndex) => {
        const sourcePlant = row[plantCol] || "", sourceFg = row[fgCol] || "";
        const plantCode = plantMap[sourcePlant] || plants.find((p) => normCode(p.plant_code) === normCode(sourcePlant))?.plant_code;
        const fgCode = fgMap[sourceFg] || finishedGoods.find((fg) => normCode(fg.fg_code) === normCode(sourceFg))?.fg_code;
        if (!plantCode || !fgCode) return [];
        const dimensions: Record<string, string> = {};
        headers.forEach((header, col) => { if (col !== plantCol && col !== fgCol && !dateCols.includes(col) && header && row[col]) dimensions[slug(header)] = row[col]; });
        const uomIndex = findColumn(headers, ["uom", "unit"]);
        return dateCols.flatMap((col) => {
          const bucketDate = parseDate(headers[col], dateFormat);
          const forecastQty = Number(String(row[col] || "").replace(/,/g, ""));
          const isReference = scenarioType === "actual" || scenarioType === "previous_year";
          if (!bucketDate || !row[col] || !Number.isFinite(forecastQty) || (!isReference && forecastQty < 0)) return [];
          return [{ plantCode, fgCode, bucketDate: bucket === "Monthly" ? `${bucketDate.slice(0, 7)}-01` : bucketDate, forecastQty, uom: uomIndex >= 0 ? row[uomIndex] : null, dimensions, sourceRowNumber: headerRow + rowIndex + 2 }];
        });
      });
      if (!rows.length) throw new Error("No rows mapped. Map every source plant and product code to an active portal code.");
      const response = await fetch("/api/demand/scenario-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, sourceSheet: sheet.name, scenarioName: scenarioName || sheet.name, scenarioType, bucketType: bucket, dateFormat, plantColumn: headers[plantCol], productColumn: headers[fgCol], dateColumns: dateCols.map((i) => headers[i]), codeMappings: { plantMap, fgMap }, rows }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Demand workbook import failed.");
      onImported(result.importId, bucket); onNotify(`${result.imported.toLocaleString()} demand periods imported as “${result.scenarioName}”.`); setOpen(false);
    } catch (error) { onNotify(error instanceof Error ? error.message : "Demand workbook import failed."); }
    finally { setBusy(false); }
  };
  return <>
    <input ref={input} hidden type="file" accept=".xlsx" onChange={(e) => void loadFile(e.target.files?.[0])}/>
    <button className="button secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? <LoaderCircle size={15}/> : <FileUp size={15}/>} Import demand workbook</button>
    {open && <div className="demand-workbook-backdrop" role="presentation"><section className="demand-workbook-modal" role="dialog" aria-modal="true" aria-label="Import forecast workbook">
      <header className="demand-workbook-heading"><div><h2>Import demand workbook</h2><p>Choose one worksheet and scenario. Its dimensions stay available for planning filters.</p></div><button aria-label="Close" onClick={() => setOpen(false)}><X size={18}/></button></header>
      <div className="demand-workbook-body">
        <label>Worksheet<select value={sheetIndex} onChange={(e) => { const i = Number(e.target.value); setSheetIndex(i); analyze(sheets, i); }}>
          {sheets.map((s,i) => <option key={s.name} value={i}>{s.name}</option>)}</select></label>
        <label>Scenario name<input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)}/></label>
        <label>Scenario type<select value={scenarioType} onChange={(e) => setScenarioType(e.target.value)}><option value="system_forecast">System forecast</option><option value="consensus_forecast">Consensus forecast</option><option value="custom_forecast">Custom forecast</option><option value="actual">Actuals (reference only)</option><option value="previous_year">Previous year (reference only)</option></select></label>
        <div className="demand-workbook-form-grid"><label>Header row<input type="number" min="1" value={headerRow + 1} onChange={(e) => { const i = Math.max(0, Number(e.target.value)-1); setHeaderRow(i); const h=sheet?.rows[i] || []; setHeaders(h); setPlantCol(Math.max(0,findColumn(h,["plant","site"]))); setFgCol(Math.max(0,findColumn(h,["material","product","fg_code","sku"]))); setDateCols(h.map((v,n)=>dateHeader(v)&&parseDate(v,dateFormat)?n:-1).filter((n)=>n>=0)); }}/></label>
          <label>Period size<select value={bucket} onChange={(e) => setBucket(e.target.value as "Monthly"|"Weekly")}><option>Monthly</option><option>Weekly</option></select></label>
          <label>Date order<select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as "DMY"|"MDY")}><option value="DMY">Day / Month / Year</option><option value="MDY">Month / Day / Year</option></select></label></div>
        <div className="demand-workbook-form-grid"><label>Plant column<select value={plantCol} onChange={(e) => setPlantCol(Number(e.target.value))}>{headers.map((h,i)=><option key={i} value={i}>{h || `Column ${i+1}`}</option>)}</select></label><label>Product/material column<select value={fgCol} onChange={(e) => setFgCol(Number(e.target.value))}>{headers.map((h,i)=><option key={i} value={i}>{h || `Column ${i+1}`}</option>)}</select></label></div>
        <label>Forecast date columns<select multiple value={dateCols.map(String)} onChange={(e) => setDateCols(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}>{headers.map((h,i)=><option key={i} value={i}>{h || `Column ${i+1}`}</option>)}</select><small>Use Ctrl-click to select or clear multiple period columns.</small></label>
        <details><summary>Map source plant codes ({sourcePlants.length}; {missingPlants.length} need mapping)</summary>{sourcePlants.map((code) => <label key={code}>{code}<select value={plantMap[code] || plants.find((p)=>normCode(p.plant_code)===normCode(code))?.plant_code || ""} onChange={(e)=>setPlantMap({...plantMap,[code]:e.target.value})}><option value="">Choose portal plant</option>{plants.map((p)=><option key={p.plant_code} value={p.plant_code}>{p.plant_name} ({p.plant_code})</option>)}</select></label>)}</details>
        <details><summary>Map source product codes ({sourceFgs.length}; {missingFgs.length} need mapping)</summary>{sourceFgs.map((code) => <label key={code}>{code}<select value={fgMap[code] || finishedGoods.find((f)=>normCode(f.fg_code)===normCode(code))?.fg_code || ""} onChange={(e)=>setFgMap({...fgMap,[code]:e.target.value})}><option value="">Choose portal finished good</option>{finishedGoods.map((f)=><option key={`${f.plant_code}|${f.fg_code}`} value={f.fg_code}>{f.fg_code} · {f.description} ({f.plant_code})</option>)}</select></label>)}</details>
        <p className="filter-help">Preview: {dataRows.length.toLocaleString()} source rows · {dateCols.length} period columns. Non-date columns (customer, Sold To, Ship To, sales group, and others) are retained as dimensions. Only the selected sheet is imported.</p>
      </div><footer className="demand-workbook-actions"><button className="button secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="button primary" disabled={busy} onClick={()=>void importSheet()}>{busy ? "Importing…" : "Import selected scenario"}</button></footer>
    </section></div>}
  </>;
}
