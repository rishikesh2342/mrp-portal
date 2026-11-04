# Deploy the MRP demo free on Render and Supabase

This setup uses one Render web service for the Vite website and Express API, and Supabase for PostgreSQL. The app and API share one URL, so the browser can keep using `/api/...` without separate CORS settings.

```text
Browser → Render web service (React UI + Express API) → Supabase PostgreSQL
```

## What you need

- A GitHub account with this project pushed to a repository.
- A free Supabase account and project.
- A free Render account.

The deployment manifest is [`render.yaml`](../render.yaml). Render will ask for `DATABASE_URL` as a secret during setup; do not add the database password to GitHub or a source file.

## 1. Create the Supabase database

1. In Supabase, create a project in a region close to where the Render service will run. Save the database password securely.
2. Open the project's **SQL Editor**.
3. Run the files below in this order. In each case, open the corresponding file from this repository, copy its full contents into a new SQL Editor query, and run it:

   1. [`database/schema.sql`](../database/schema.sql)
   2. [`database/002_forward_mrp.sql`](../database/002_forward_mrp.sql)
   3. [`database/005_training_template_data.sql`](../database/005_training_template_data.sql)

   The first two create the database structure. The third loads Morocco training data based on the MRP template. It also contains an explicitly marked validation example. Use training data for the demo; confirm all data with the business before using it for real planning.

4. In Supabase, open **Connect** and choose the **Session pooler** connection string. Use that full Postgres URI for Render's `DATABASE_URL`. It includes the host, port, database name, user, and password; keep it private. Render's persistent Node service is not a serverless function, so use the connection method recommended by Supabase for a persistent backend and the network compatibility shown in its Connect panel.

The API applies [`database/006_operational_mrp_job.sql`](../database/006_operational_mrp_job.sql) automatically at startup after it finds the base MRP tables. You do not need to run that file manually for this deployment.

## 2. Deploy the app on Render

1. Push the project, including `render.yaml`, to GitHub.
2. In Render, choose **New → Blueprint** and connect the GitHub repository containing this project.
3. Review the service named `mrp-portal-demo`. Render reads its build command, start command, health check, and free plan from `render.yaml`.
4. When prompted, enter the Supabase connection string as `DATABASE_URL`. Keep it as a secret environment value.
5. Create the service and wait for the first deploy to finish. The build runs `npm ci` and `npm run build`; the service starts with `npm run api`.
6. Open the Render service URL. The site and `/api` endpoints are served by the same Render service.

After the database is prepared and the app deploy completes, `https://<your-render-service>.onrender.com/api/health` should return a healthy status with a connected database. If it reports that the database is unavailable, check the Render `DATABASE_URL` value and Supabase project state, then review the Render logs.

## 3. Check the demo

1. Open the deployed Render site and go to **Dashboard**.
2. Confirm the country and plants load from Supabase. If options do not load, check `/api/health` and the service logs first.
3. Run MRP for **Morocco**, choose the training forecast's start date and bucket type, then confirm the dashboard shows result rows and a completion message.
4. Open **Material Requirement** and check that periods and material codes appear.
5. Sanity-check a row against the planning inputs: gross need comes from forecast × BOM usage × (1 + scrap); net need accounts for safety stock, opening stock, and receipts; suggested quantities respect MOQ and lead time.

## Free-plan behavior to expect

- Render free web services sleep after 15 minutes without incoming traffic and may take about a minute to wake up on the next visit.
- Supabase Free projects can pause after a week of low activity. Open the project and resume it if the app cannot connect after inactivity.
- Supabase Free includes 500 MB database storage and does not include automatic backups. Keep a copy of any demo data you need to restore.
- Free hosting is for a demonstration, not a production service with uptime or recovery guarantees. Check the providers' current limits before a longer demo period.

## Troubleshooting

| Symptom | First check |
|---|---|
| Render deploy fails during build | Open the Render deploy log. Confirm `package-lock.json`, `render.yaml`, and the source files are committed. |
| Site opens but Dashboard has an API error | Open `/api/health`; verify `DATABASE_URL`, that the Supabase project is active, and that SQL files 1 and 2 ran successfully. |
| API reports missing MRP table | Run `schema.sql` and `002_forward_mrp.sql` in Supabase SQL Editor, then redeploy or restart the Render service. |
| Dashboard has no master data | Run `005_training_template_data.sql` after the schema migrations, then reload the site. |
| First visit is slow | The Render free service may be waking from idle. Wait for it to start and reload. |

## Provider documentation

- [Render Blueprint configuration](https://render.com/docs/blueprint-spec)
- [Render free instance limits](https://render.com/docs/free)
- [Supabase database connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
