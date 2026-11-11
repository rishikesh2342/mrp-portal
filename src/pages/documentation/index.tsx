import { BookOpen, Download, ExternalLink, FileArchive, FileText } from 'lucide-react'
import type { PageProps } from '../types'
import './documentation.css'

type Guide = {
  title: string
  description: string
  href: string
  format: string
}

const guides: { section: string; items: Guide[] }[] = [
  {
    section: 'Start here',
    items: [
      {
        title: 'Manager handbook',
        description: 'Project purpose, MRP basics, portal pages, data fields, calculation rules, limitations, and management review checklist.',
        href: '/project-docs/docs/mrp_portal_manager_handbook.pdf',
        format: 'PDF',
      },
      {
        title: 'Product owner operating guide',
        description: 'Which CSV files to upload, upload order, how to run MRP, and how to check the output.',
        href: '/project-docs/docs/mrp_product_owner_guide.pdf',
        format: 'PDF',
      },
      {
        title: 'Time-phased plan guide',
        description: 'Explains each material-plan column, weekly bucket, projected stock, order quantity, and expedite label.',
        href: '/project-docs/docs/time_phased_material_plan_guide.pdf',
        format: 'PDF',
      },
      {
        title: 'Demand workbook import guide',
        description: 'Import changing Excel forecast workbooks, map plant and product codes, select one scenario, and filter customer dimensions.',
        href: '/project-docs/docs/demand_workbook_integration.md',
        format: 'Markdown',
      },
      {
        title: 'New tenant validation guide',
        description: 'Create an isolated tenant, upload the matching sample masters and stock, import three 12-month scenarios, and validate Dashboard output.',
        href: '/project-docs/docs/tenant_validation_guide.md',
        format: 'Markdown',
      },
      {
        title: 'Master Data guide',
        description: 'Explains the Master Data tabs, fields, tenant CSV imports, demo-only page values, and how master records feed MRP.',
        href: '/project-docs/docs/master_data_guide.pdf',
        format: 'PDF',
      },
      {
        title: 'Inventory guide',
        description: 'Explains Inventory page fields, CSV columns, tenant data behavior, detail tabs, and how stock and receipts affect MRP.',
        href: '/project-docs/docs/inventory_guide.pdf',
        format: 'PDF',
      },
      {
        title: 'Forward MRP Plan dashboard guide',
        description: 'A plain-language guide to every Dashboard filter, scenario input, KPI, chart, table field, and the current MRP calculation rules.',
        href: '/project-docs/docs/forward_mrp_dashboard_guide.pdf',
        format: 'PDF',
      },
    ],
  },
  {
    section: 'Operations and setup',
    items: [
      {
        title: 'Free demo deployment guide',
        description: 'Setup instructions for the Render service and Supabase PostgreSQL database.',
        href: '/project-docs/docs/free_demo_deployment.md',
        format: 'Markdown',
      },
      {
        title: 'Operational MRP workflow',
        description: "Technical and operational notes about the project's MRP flow.",
        href: '/project-docs/docs/mrp_operational_workflow.md',
        format: 'Markdown',
      },
      {
        title: 'Project README',
        description: 'Developer setup, database configuration, and project notes.',
        href: '/project-docs/README.md',
        format: 'Markdown',
      },
    ],
  },
  {
    section: 'Editable and visual versions',
    items: [
      {
        title: 'Manager handbook · editable',
        description: 'Editable source version of the manager handbook.',
        href: '/project-docs/docs/mrp_portal_manager_handbook.md',
        format: 'Markdown',
      },
      {
        title: 'Product owner guide · editable',
        description: 'Editable source version with upload instructions and workflow illustrations.',
        href: '/project-docs/docs/mrp_product_owner_guide.md',
        format: 'Markdown',
      },
      {
        title: 'Time-phased plan guide · editable',
        description: 'Editable source version of the material-plan explanation.',
        href: '/project-docs/docs/time_phased_material_plan_guide.md',
        format: 'Markdown',
      },
      {
        title: 'Inventory guide · editable',
        description: 'Editable field reference for the Inventory page and its CSV workflow.',
        href: '/project-docs/docs/inventory_guide.md',
        format: 'Markdown',
      },
      {
        title: 'Forward MRP Plan guide · editable',
        description: 'Editable field-by-field explanation of Dashboard planning inputs and results.',
        href: '/project-docs/docs/forward_mrp_dashboard_guide.md',
        format: 'Markdown',
      },
      {
        title: 'Project flow diagram',
        description: 'Visual overview of uploads, planning, calculation, and review.',
        href: '/project-docs/docs/images/mrp-product-owner-flow.svg',
        format: 'SVG',
      },
      {
        title: 'Portal screen map',
        description: 'Illustration showing the main screens and where key actions live.',
        href: '/project-docs/docs/images/mrp-screen-map.svg',
        format: 'SVG',
      },
    ],
  },
]

export default function ProjectGuidesPage({ onNotify }: PageProps) {
  return (
    <section className="project-guides-page">
      <header className="guides-hero">
        <div className="guides-hero-icon"><BookOpen size={24} /></div>
        <div className="guides-hero-copy">
          <span className="guides-eyebrow">LEARN THE MRP PORTAL</span>
          <h1>Project Guides</h1>
          <p>Download the guides for understanding, operating, and deploying this project.</p>
        </div>
        <a
          className="button primary guides-download-all"
          href="/project-docs/mrp-portal-all-docs.zip"
          download
          onClick={() => onNotify('Downloading the complete project documentation bundle')}
        >
          <FileArchive size={17} /> Download all documents
        </a>
      </header>

      <div className="guides-bundle-note">
        <FileText size={16} />
        <span>The complete bundle includes the handbooks, operating and deployment guides, diagrams, README, and editable source files.</span>
      </div>

      {guides.map((group) => (
        <section className="guides-section" key={group.section}>
          <h2>{group.section}</h2>
          <div className="guides-grid">
            {group.items.map((guide) => (
              <article className="guide-card" key={guide.href}>
                <div className="guide-card-top">
                  <span className="guide-file-icon"><FileText size={18} /></span>
                  <span className="guide-format">{guide.format}</span>
                </div>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
                <a href={guide.href} download className="guide-download-link" onClick={() => onNotify(`Downloading ${guide.title}`)}>
                  <Download size={15} /> Download file <ExternalLink size={13} />
                </a>
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="guides-footer-note">Use the manager handbook for a full project overview. Use the product owner guide to operate the current workflow. The guides describe the current project build and identify screens that are still demonstrations.</p>
    </section>
  )
}
