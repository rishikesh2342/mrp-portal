import { Activity, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react'
import type { PageName, PageProps } from '../types'

export type OverviewData = { page: PageName; description: string; stats: [string, string, string][]; columns: string[]; rows: string[][] }

export default function OverviewPage({ data, onNotify }: PageProps & { data: OverviewData }) {
  return <section className="dashboard-content module-content">
    <div className="content-intro"><div><h2>{data.page} overview</h2><p>{data.description}</p></div><button className="button primary" onClick={() => onNotify(`${data.page}: create form opened`)}><Plus size={15}/> Add {data.page === 'Settings' ? 'rule' : 'record'}</button></div>
    <div className="metric-grid module-metrics">{data.stats.map(([label,value,note],index)=><article className="metric-card" key={label}><div className="metric-top"><div className={`metric-icon metric-icon-${index}`}><Activity size={16}/></div><span className="metric-foot">{index===0?'OVERVIEW':index===1?'THIS PERIOD':'PERFORMANCE'}</span></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-foot">{note}</div></article>)}</div>
    <article className="table-card module-table"><div className="table-heading"><div><h3>{data.page} records</h3><p>Latest updates across your planning workspace</p></div><button className="button secondary" onClick={()=>onNotify('Filters opened')}><SlidersHorizontal size={14}/> Filters</button></div><div className="data-table"><div className="module-row module-table-header">{data.columns.map((column,index)=><span key={`${column}-${index}`}>{column}</span>)}</div>{data.rows.map((row,index)=><div className="module-row" key={`${data.page}-${index}`}>{row.map((cell,column)=><span className={column===row.length-1?'record-status':''} key={`${cell}-${column}`}>{cell}</span>)}</div>)}</div><div className="module-table-footer"><span>Showing {data.rows.length} records</span><button className="text-action" onClick={()=>onNotify(`All ${data.page.toLowerCase()} records loaded`)}>View all records <ChevronRight size={14}/></button></div></article>
  </section>
}
