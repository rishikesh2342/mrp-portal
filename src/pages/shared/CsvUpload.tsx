import { useRef, useState } from 'react'
import { FileUp, LoaderCircle } from 'lucide-react'

export type CsvDataset = 'plants' | 'materials' | 'finished_goods' | 'plant_constraints' | 'bom' | 'inventory' | 'demand' | 'demand_monthly'

const datasetLabels: Record<CsvDataset, string> = {
  plants: 'Plant master', materials: 'Material master', finished_goods: 'Finished goods',
  plant_constraints: 'Plant constraints', bom: 'Bill of materials', inventory: 'Inventory & stock', demand: 'Weekly demand forecast', demand_monthly: 'Monthly demand forecast',
}

export default function CsvUpload({ datasets, onNotify }: { datasets: CsvDataset[]; onNotify: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dataset, setDataset] = useState<CsvDataset>(datasets[0])
  const [busy, setBusy] = useState(false)

  const upload = async (file?: File) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onNotify('Choose a .csv file. Excel workbooks are not accepted here.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      onNotify('CSV files must be 10 MB or smaller.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setBusy(true)
    try {
      const response = await fetch('/api/import/csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset, fileName: file.name, csvText: await file.text() }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'CSV upload failed.')
      onNotify(`${datasetLabels[dataset]}: ${body.imported} rows uploaded${body.updated ? `, ${body.updated} updated` : ''}.`)
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'CSV upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <div className="csv-upload">
    <label className="csv-upload-select">Upload type
      <select value={dataset} onChange={event => setDataset(event.target.value as CsvDataset)} disabled={busy}>
        {datasets.map(item => <option key={item} value={item}>{datasetLabels[item]}</option>)}
      </select>
    </label>
    <input ref={inputRef} className="csv-upload-input" type="file" accept=".csv,text/csv" disabled={busy} onChange={event => void upload(event.target.files?.[0])}/>
    <button className="button secondary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
      {busy ? <LoaderCircle className="csv-upload-spin" size={15}/> : <FileUp size={15}/>}
      {busy ? 'Uploading…' : 'Upload CSV'}
    </button>
  </div>
}
