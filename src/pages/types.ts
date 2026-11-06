export type PageName = 'Dashboard' | 'Material Requirement' | 'Demand Planning' | 'Inventory' | 'Purchase Orders' | 'Suppliers' | 'Production Plan' | 'Reports' | 'Master Data' | 'Project Guides' | 'Settings'
export type PageProps = { onNotify: (message: string) => void; onNavigate: (page: PageName) => void }
