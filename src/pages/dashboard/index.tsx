import { ArrowUpRight, Boxes, Building2, CircleAlert, ClipboardList, Package, Play, ShoppingCart, Truck } from 'lucide-react'
import type { PageProps } from '../types'

const stats = [
  { label: 'Total Materials', value: '1,248', change: '+12%', icon: Boxes, color: 'blue' },
  { label: 'Open Purchase Orders', value: '56', change: '+8%', icon: ShoppingCart, color: 'green' },
  { label: 'Materials at Risk', value: '18', change: '+50%', icon: Package, color: 'orange' },
  { label: 'Inventory Value', value: '₹ 2.4 Cr', change: '+6%', icon: Building2, color: 'purple' },
]
const demand = [
  { month: 'Oct', demand: 54, supply: 35, shortage: 9 }, { month: 'Nov', demand: 63, supply: 44, shortage: 11 },
  { month: 'Dec', demand: 69, supply: 57, shortage: 13 }, { month: 'Jan', demand: 59, supply: 53, shortage: 10 },
  { month: 'Feb', demand: 63, supply: 50, shortage: 15 }, { month: 'Mar', demand: 63, supply: 55, shortage: 10 },
]
const risks = [
  ['MT-0012', '500', '50', 'Critical'], ['RM-0045', '1,000', '200', 'Critical'], ['SP-7781', '800', '250', 'High'], ['RM-1120', '600', '300', 'High'], ['PK-3011', '400', '150', 'Medium'],
]
const actions = [
  { icon: CircleAlert, tone: 'red', title: 'Material MT-0012 below minimum level', detail: 'Reorder required', date: 'Today' },
  { icon: ShoppingCart, tone: 'red', title: 'PO #PO-5678 approval pending', detail: 'Supplier: ABC Suppliers', date: 'Today' },
  { icon: Package, tone: 'amber', title: 'Production order #PR-1123 due soon', detail: 'Material shortage risk', date: 'Tomorrow' },
  { icon: ClipboardList, tone: 'blue', title: 'Update demand forecast for Q1 2027', detail: 'Review and confirm', date: '25 Sep 2026' },
  { icon: Truck, tone: 'amber', title: 'Delivery delayed for PO #PO-4456', detail: 'Supplier: Global Traders', date: '26 Sep 2026' },
]
const recentPlans = [
  ['MRP-2026-09-01', '01 Sep 2026', '3 Months (Oct – Dec)', '1,248', '18', '12', 'Completed'],
  ['MRP-2026-08-01', '01 Aug 2026', '3 Months (Sep – Nov)', '1,210', '22', '15', 'Completed'],
  ['MRP-2026-07-01', '01 Jul 2026', '3 Months (Aug – Oct)', '1,180', '25', '18', 'Completed'],
]

export default function DashboardPage({ onNotify, onNavigate }: PageProps) {
  return <section className="mrp-dashboard">
    <div className="mrp-dashboard-heading"><div><h1>Dashboard</h1><p>Overview of material demand, inventory position and procurement status</p></div><button className="button primary run-mrp" onClick={() => onNotify('MRP run started')}><Play size={15} fill="currentColor"/> Run MRP</button></div>
    <div className="mrp-stat-grid">{stats.map(({label,value,change,icon:Icon,color})=><article className="mrp-stat-card" key={label}><div className={`mrp-stat-icon ${color}`}><Icon size={25}/></div><div className="mrp-stat-copy"><span>{label}</span><strong>{value}</strong><small className={color==='orange'?'negative':''}><ArrowUpRight size={13}/>{change}<i>vs last month</i></small></div></article>)}</div>
    <div className="mrp-board-row top-row">
      <article className="mrp-panel demand-panel"><PanelHeading title="Material Demand vs Supply"/><div className="chart-key"><span><i className="key-demand"/>Demand</span><span><i className="key-supply"/>Supply</span><span><i className="key-shortage"/>Shortage</span></div><div className="demand-chart"><div className="chart-y-labels"><span>800</span><span>600</span><span>400</span><span>200</span><span>0</span></div><div className="demand-plot"><div className="demand-grid">{[0,1,2,3,4].map(i=><i key={i}/>)}</div><div className="demand-bars">{demand.map(row=><div className="demand-group" key={row.month}><div className="bar-set"><i className="demand-bar" style={{height:`${row.demand}%`}}/><i className="supply-bar" style={{height:`${row.supply}%`}}/><i className="shortage-bar" style={{height:`${row.shortage}%`}}/></div><span>{row.month}</span></div>)}</div></div></div></article>
      <article className="mrp-panel health-panel"><PanelHeading title="Inventory Health"/><div className="donut-content"><div className="donut inventory-donut"><div><strong>1,248</strong><span>Materials</span></div></div><div className="donut-legend">{[['In Stock','62%','(775)','green'],['Low Stock','18%','(224)','amber'],['Out of Stock','8%','(100)','red'],['Excess Stock','12%','(149)','blue']].map(([label,percent,count,tone])=><div className="legend-row" key={label}><i className={tone}/><span>{label}</span><strong>{percent}<small>{count}</small></strong></div>)}</div></div></article>
      <article className="mrp-panel shortage-panel"><PanelHeading title="Top 5 Materials by Shortage Risk" action="View All" onAction={()=>onNavigate('Material Requirement')}/><div className="mrp-table"><div className="mrp-table-row table-labels"><span>Material</span><span>Required Qty</span><span>Available Qty</span><span>Status</span></div>{risks.map(([material,required,available,status])=><div className="mrp-table-row" key={material}><span>{material}</span><span>{required}</span><span>{available}</span><span><i className={`risk-pill ${status.toLowerCase()}`}>{status}</i></span></div>)}</div></article>
    </div>
    <div className="mrp-board-row bottom-row">
      <article className="mrp-panel po-panel"><PanelHeading title="Purchase Order Status" action="View All" onAction={()=>onNavigate('Purchase Orders')}/><div className="donut-content"><div className="donut po-donut"><div><strong>56</strong><span>Open POs</span></div></div><div className="donut-legend">{[['Draft','8','14%','slate'],['Sent','12','21%','blue'],['Confirmed','20','36%','green'],['Partially Received','10','18%','amber'],['Overdue','6','11%','red']].map(([label,value,percent,tone])=><div className="legend-row" key={label}><i className={tone}/><span>{label}</span><strong>{value}<small>({percent})</small></strong></div>)}</div></div></article>
      <article className="mrp-panel category-panel"><PanelHeading title="Inventory Value by Category" action="View All" onAction={()=>onNavigate('Inventory')}/><div className="category-list">{[['Raw Materials','98.2','100%'],['Components','62.5','63%'],['Packaging','28.4','29%'],['Consumables','18.6','19%'],['Others','12.3','13%']].map(([label,value,width])=><div className="category-row" key={label}><span>{label}</span><div><i style={{width}}/></div><strong>₹ {value} L</strong></div>)}</div></article>
      <article className="mrp-panel actions-panel"><PanelHeading title="Upcoming Actions" action="View All" onAction={()=>onNotify('All upcoming actions opened')}/><div className="action-list">{actions.map(({icon:Icon,tone,title,detail,date})=><button className="action-row" key={title} onClick={()=>onNotify(title)}><span className={`action-icon ${tone}`}><Icon size={17}/></span><span className="action-copy"><strong>{title}</strong><small>{detail}</small></span><time>{date}</time></button>)}</div></article>
    </div>
    <article className="mrp-panel recent-panel"><PanelHeading title="Recent MRP Plans" action="View All" onAction={()=>onNotify('All MRP plans opened')}/><div className="mrp-table recent-table"><div className="recent-table-row recent-labels"><span>Plan ID</span><span>Plan Date</span><span>Planning Horizon</span><span>Materials Planned</span><span>Shortage Items</span><span>Suggested POs</span><span>Status</span><span>Actions</span></div>{recentPlans.map(row=><div className="recent-table-row" key={row[0]}>{row.map((value,index)=><span className={index===4?'shortage-count':''} key={index}>{index===6?<i className="completed-pill">{value}</i>:value}</span>)}<span className="recent-actions"><button onClick={()=>onNotify(`Opening ${row[0]}`)}>View</button><button aria-label={`More actions for ${row[0]}`} onClick={()=>onNotify(`More actions for ${row[0]}`)}>•••</button></span></div>)}</div></article>
  </section>
}

function PanelHeading({title,action,onAction}:{title:string;action?:string;onAction?:()=>void}){return <div className="mrp-panel-heading"><h2>{title}</h2>{action&&<button onClick={onAction}>{action}</button>}</div>}
