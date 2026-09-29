import type { ComponentType } from 'react'
import Dashboard from './dashboard'
import DemandPlanning from './demand-planning'
import Inventory from './inventory'
import MaterialRequirement from './material-requirement'
import MasterData from './master-data'
import ProductionPlan from './production-plan'
import PurchaseOrders from './purchase-orders'
import Reports from './reports'
import Settings from './settings'
import Suppliers from './suppliers'
import type { PageName, PageProps } from './types'

export const pageComponents: Record<PageName, ComponentType<PageProps>> = {
  Dashboard, 'Material Requirement': MaterialRequirement, 'Demand Planning': DemandPlanning,
  Inventory, 'Purchase Orders': PurchaseOrders, Suppliers, 'Production Plan': ProductionPlan,
  Reports, 'Master Data': MasterData, Settings,
}
