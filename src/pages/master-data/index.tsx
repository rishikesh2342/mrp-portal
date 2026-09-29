import { useMemo, useState, type FormEvent } from 'react'
import { Boxes, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, Copy, Download, Ellipsis, FileSpreadsheet, Filter, Layers3, MapPin, Package, Plus, Search, Settings2, ShieldCheck, Tags, Users, X } from 'lucide-react'
import type { PageProps } from '../types'

type Catalog='Materials'|'Products & BOMs'|'Suppliers'|'Locations'|'Planning Parameters'
type RecordRow={id:string;name:string;category:string;unit:string;detail:string;status:'Active'|'Review'|'Inactive';updated:string;owner:string}
const catalogs:Catalog[]=['Materials','Products & BOMs','Suppliers','Locations','Planning Parameters']
const initialData:Record<Catalog,RecordRow[]>={
 Materials:[
  {id:'RM-0045',name:'Aluminum Sheet',category:'Raw Material · Metals',unit:'Kg',detail:'Lead 10d · Safety 100 · MOQ 200',status:'Active',updated:'Today, 09:20',owner:'R. Mishra'},
  {id:'MT-0012',name:'Motor Assembly',category:'Component · Electrical',unit:'Pcs',detail:'Lead 15d · Safety 50 · MOQ 25',status:'Active',updated:'Yesterday, 16:35',owner:'A. Kumar'},
  {id:'PK-3011',name:'Packaging Box',category:'Packaging',unit:'Pcs',detail:'Lead 7d · Safety 500 · MOQ 100',status:'Active',updated:'24 Sep 2026',owner:'S. Patel'},
  {id:'SP-7781',name:'Screw M6',category:'Component · Hardware',unit:'Pcs',detail:'Lead 5d · Safety 100 · MOQ 500',status:'Review',updated:'23 Sep 2026',owner:'R. Mishra'},
  {id:'RM-1120',name:'Copper Wire',category:'Raw Material · Metals',unit:'Kg',detail:'Lead 12d · Safety 100 · MOQ 100',status:'Active',updated:'22 Sep 2026',owner:'A. Kumar'},
  {id:'EL-2204',name:'Control Relay',category:'Component · Electrical',unit:'Pcs',detail:'Lead time missing · Safety 40',status:'Review',updated:'20 Sep 2026',owner:'S. Patel'},
 ],
 'Products & BOMs':[
  {id:'PRD-1001',name:'Control Panel',category:'Finished Good · Electronics',unit:'Each',detail:'BOM v3 · 12 components · 4 operations',status:'Active',updated:'Today, 08:50',owner:'R. Mishra'},
  {id:'PRD-1002',name:'Switch Assembly',category:'Finished Good · Electrical',unit:'Each',detail:'BOM v2 · 8 components · 3 operations',status:'Active',updated:'24 Sep 2026',owner:'A. Kumar'},
  {id:'PRD-1003',name:'Power Module',category:'Finished Good · Electronics',unit:'Each',detail:'BOM incomplete · 2 components missing',status:'Review',updated:'23 Sep 2026',owner:'S. Patel'},
  {id:'PRD-1004',name:'Enclosure Unit',category:'Subassembly · Metals',unit:'Each',detail:'BOM v1 · 6 components · 2 operations',status:'Active',updated:'21 Sep 2026',owner:'R. Mishra'},
 ],
 Suppliers:[
  {id:'SUP-001',name:'ABC Suppliers',category:'Raw Materials',unit:'10 days',detail:'Mumbai, MH · GST verified · Rating 4.5',status:'Active',updated:'Today, 08:15',owner:'Procurement'},
  {id:'SUP-002',name:'Global Traders',category:'Components',unit:'15 days',detail:'Delhi · GST verified · Rating 4.2',status:'Active',updated:'24 Sep 2026',owner:'Procurement'},
  {id:'SUP-004',name:'PackRight Solutions',category:'Packaging',unit:'20 days',detail:'Ahmedabad, GJ · Documents under review',status:'Review',updated:'22 Sep 2026',owner:'S. Patel'},
 ],
 Locations:[
  {id:'LOC-001',name:'Main Warehouse',category:'Warehouse · Central',unit:'Pune, MH',detail:'Capacity 12,000 m³ · 4,200 m³ used',status:'Active',updated:'18 Sep 2026',owner:'Operations'},
  {id:'LOC-002',name:'Plant North',category:'Manufacturing · North',unit:'Delhi, DL',detail:'Capacity 8,000 m³ · 5,100 m³ used',status:'Active',updated:'18 Sep 2026',owner:'Operations'},
  {id:'LOC-003',name:'Plant Central',category:'Manufacturing · Central',unit:'Pune, MH',detail:'Cycle count overdue',status:'Review',updated:'17 Sep 2026',owner:'Operations'},
 ],
 'Planning Parameters':[
  {id:'PAR-001',name:'Default service level',category:'Inventory Policy',unit:'95%',detail:'Applied to 1,248 materials · Updated by planning admin',status:'Active',updated:'Today, 09:00',owner:'Admin'},
  {id:'PAR-002',name:'Planning time fence',category:'Demand Planning',unit:'30 days',detail:'Forecast consumption enabled',status:'Active',updated:'20 Sep 2026',owner:'R. Mishra'},
  {id:'PAR-003',name:'Default calendar',category:'Production Scheduling',unit:'5 days / week',detail:'Holiday calendar missing for Q1 2027',status:'Review',updated:'18 Sep 2026',owner:'Operations'},
 ]
}
const icons=[Package,Boxes,Users,MapPin,Settings2]
const toSlug=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,'-')

export default function MasterDataPage({onNotify}:PageProps){
 const [catalog,setCatalog]=useState<Catalog>('Materials')
 const [data,setData]=useState(initialData)
 const [query,setQuery]=useState('')
 const [status,setStatus]=useState('All statuses')
 const [showForm,setShowForm]=useState(false)
 const [editing,setEditing]=useState<RecordRow|null>(null)
 const [recordName,setRecordName]=useState('')
 const [recordCode,setRecordCode]=useState('')
 const [categoryName,setCategoryName]=useState('')
 const [unit,setUnit]=useState('')
 const [detail,setDetail]=useState('')
 const [activeMenu,setActiveMenu]=useState<string|null>(null)
 const activeRows=data[catalog]
 const filtered=useMemo(()=>activeRows.filter(row=>(status==='All statuses'||row.status===status)&&`${row.id} ${row.name} ${row.category} ${row.detail}`.toLowerCase().includes(query.toLowerCase())),[activeRows,status,query])
 const currentIcon=icons[catalogs.indexOf(catalog)]
 const Icon=currentIcon
 const reviewCount=Object.values(data).flat().filter(row=>row.status==='Review').length
 const openCreate=(row?:RecordRow)=>{setEditing(row??null);setRecordName(row?.name??'');setRecordCode(row?.id??'');setCategoryName(row?.category??'');setUnit(row?.unit??'');setDetail(row?.detail??'');setShowForm(true)}
 const saveRecord=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const next:RecordRow={id:recordCode,name:recordName,category:categoryName||catalog,unit:unit||'—',detail:detail||'Planning attributes configured',status:'Active',updated:'Just now',owner:'R. Mishra'};setData({...data,[catalog]:editing?data[catalog].map(row=>row.id===editing.id?next:row):[next,...data[catalog]]});setShowForm(false);onNotify(`${catalog.slice(0,-1)} ${editing?'updated':'added'} successfully`)}
 const exportCatalog=()=>{const csv=[['Code','Name','Category','Unit / Value','Details','Status','Last Updated','Owner'],...filtered.map(row=>[row.id,row.name,row.category,row.unit,row.detail,row.status,row.updated,row.owner])].map(row=>row.join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${toSlug(catalog)}.csv`;a.click();URL.revokeObjectURL(url);onNotify(`${catalog} exported`)}
 return <section className="master-data-page">
  <div className="master-heading"><div><span className="master-eyebrow">FOUNDATION DATA</span><h1>Master Data</h1><p>Maintain the trusted records and planning rules behind your MRP workflows.</p></div><div className="master-heading-actions"><button className="button secondary" onClick={exportCatalog}><Download size={15}/> Export</button><button className="button secondary" onClick={()=>onNotify('Master data import template downloaded')}><FileSpreadsheet size={15}/> Import</button><button className="button primary" onClick={()=>openCreate()}><Plus size={16}/> Add {catalog==='Products & BOMs'?'Product':catalog==='Planning Parameters'?'Parameter':catalog==='Locations'?'Location':catalog.slice(0,-1)}</button></div></div>
  <div className="master-kpis"><article><span className="master-kpi-icon blue"><Layers3 size={19}/></span><div><small>Master records</small><strong>{Object.values(data).flat().length.toLocaleString('en-IN')}</strong><p>Across {catalogs.length} data domains</p></div></article><article><span className="master-kpi-icon green"><ShieldCheck size={19}/></span><div><small>Active records</small><strong>{Object.values(data).flat().filter(row=>row.status==='Active').length.toLocaleString('en-IN')}</strong><p>Ready for planning use</p></div></article><article><span className="master-kpi-icon amber"><CircleAlert size={19}/></span><div><small>Needs review</small><strong>{reviewCount}</strong><p>Incomplete or pending validation</p></div></article><article><span className="master-kpi-icon purple"><Clock3 size={19}/></span><div><small>Last sync</small><strong>09:42 AM</strong><p>Today · All domains synced</p></div></article></div>
  <div className="master-workspace"><aside className="master-catalog"><div className="master-catalog-heading"><h2>Data domains</h2><span>{catalogs.length}</span></div>{catalogs.map((item,index)=>{const CatalogIcon=icons[index];const count=data[item].length;return <button key={item} className={catalog===item?'active':''} onClick={()=>{setCatalog(item);setStatus('All statuses');setQuery('')}}><CatalogIcon size={17}/><span>{item}<small>{count.toLocaleString('en-IN')} records</small></span><ChevronRight size={15}/></button>})}<div className="master-integrity"><div><ShieldCheck size={15}/> Data quality</div><strong>96.8%</strong><span><i/></span><small>Validated records across all domains</small></div></aside>
   <div className="master-content"><header className="master-content-head"><div><div className="master-title-line"><span className="master-active-icon"><Icon size={17}/></span><h2>{catalog}</h2><span className="master-count">{activeRows.length} records</span></div><p>{catalog==='Materials'?'Material codes, purchasing attributes, stock policy and lead times.':catalog==='Products & BOMs'?'Finished goods, product structures, components and routing references.':catalog==='Suppliers'?'Supplier identities and procurement attributes used by purchase planning.':catalog==='Locations'?'Warehouses and plants used for inventory and production planning.':'Shared defaults and policy values that drive planning calculations.'}</p></div><div className="master-content-actions"><label className="master-search"><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder={`Search ${catalog.toLowerCase()}...`}/></label><label className="master-status-filter"><Filter size={14}/><select value={status} onChange={event=>setStatus(event.target.value)}><option>All statuses</option><option>Active</option><option>Review</option><option>Inactive</option></select><ChevronDown size={12}/></label></div></header>
    <div className="master-table-wrap"><table className="master-table"><thead><tr><th><input type="checkbox" aria-label="Select all records"/></th><th>Code</th><th>Name</th><th>Category / Type</th><th>{catalog==='Suppliers'?'Lead Time':catalog==='Locations'?'Location':catalog==='Planning Parameters'?'Value':'Unit'}</th><th>Planning attributes</th><th>Last updated</th><th>Owner</th><th>Status</th><th/></tr></thead><tbody>{filtered.map(row=><tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.id}`}/></td><td className="master-code">{row.id}</td><td><strong>{row.name}</strong></td><td>{row.category}</td><td>{row.unit}</td><td className="master-detail-cell">{row.detail}</td><td>{row.updated}</td><td>{row.owner}</td><td><span className={`master-status-badge ${row.status.toLowerCase()}`}><i/>{row.status}</span></td><td className="master-row-actions"><button aria-label={`Actions for ${row.name}`} onClick={()=>setActiveMenu(activeMenu===row.id?null:row.id)}><Ellipsis size={17}/></button>{activeMenu===row.id&&<div className="master-action-menu"><button onClick={()=>{openCreate(row);setActiveMenu(null)}}>Edit record</button><button onClick={()=>{navigator.clipboard?.writeText(row.id);setActiveMenu(null);onNotify(`${row.id} copied`)}}><Copy size={13}/> Copy code</button><button onClick={()=>{setData({...data,[catalog]:data[catalog].map(item=>item.id===row.id?{...item,status:item.status==='Inactive'?'Active':'Inactive'}:item)});setActiveMenu(null);onNotify(`${row.name} status updated`)}}>Toggle status</button></div>}</td></tr>)}</tbody></table>{filtered.length===0&&<div className="master-empty"><Search size={20}/><strong>No records found</strong><span>Adjust your search or status filter.</span></div>}</div>
    <footer className="master-table-footer"><span>Showing {filtered.length?1:0} to {filtered.length} of {activeRows.length} records</span><div><button aria-label="Previous page"><ChevronLeft size={15}/></button><button className="active">1</button><button>2</button><button>3</button><button aria-label="Next page"><ChevronRight size={15}/></button></div></footer>
    <div className="master-guidance"><div><Tags size={16}/><span><strong>Keep planning data complete</strong><small>Records marked for review may affect material availability, lead-time and production calculations.</small></span></div><button onClick={()=>{setStatus('Review');onNotify('Showing records that need review')}}>Review {reviewCount} records <ChevronRight size={14}/></button></div>
   </div>
  </div>
  {showForm&&<div className="master-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setShowForm(false)}}><form className="master-modal" onSubmit={saveRecord} role="dialog" aria-modal="true" aria-labelledby="master-form-title"><header><div><span className="master-eyebrow">{catalog.toUpperCase()}</span><h2 id="master-form-title">{editing?'Edit':'Add'} {catalog==='Products & BOMs'?'Product':catalog==='Planning Parameters'?'Planning Parameter':catalog==='Locations'?'Location':catalog.slice(0,-1)}</h2><p>Maintain a reusable record for your planning workflows.</p></div><button type="button" aria-label="Close form" onClick={()=>setShowForm(false)}><X size={18}/></button></header><div className="master-form-grid"><label>Code <b>*</b><input required value={recordCode} onChange={event=>setRecordCode(event.target.value)} placeholder={catalog==='Materials'?'e.g. RM-2201':'Enter record code'}/></label><label>Name <b>*</b><input required value={recordName} onChange={event=>setRecordName(event.target.value)} placeholder="Enter name"/></label><label>Category / Type<input value={categoryName} onChange={event=>setCategoryName(event.target.value)} placeholder="Category or record type"/></label><label>{catalog==='Suppliers'?'Lead Time / Value':catalog==='Locations'?'Location':catalog==='Planning Parameters'?'Parameter Value':'Unit of Measure'}<input value={unit} onChange={event=>setUnit(event.target.value)} placeholder="Enter value"/></label><label className="master-detail-field">Planning attributes / Notes<textarea value={detail} onChange={event=>setDetail(event.target.value)} placeholder="Lead time, safety stock, BOM components, or other planning details"/></label></div><footer><button type="button" className="button secondary" onClick={()=>setShowForm(false)}>Cancel</button><button type="submit" className="button primary"><Check size={14}/>{editing?'Save changes':'Add record'}</button></footer></form></div>}
 </section>
}
