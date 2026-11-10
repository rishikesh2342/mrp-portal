-- Give each planning tenant its own PostgreSQL schema.
BEGIN;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_code VARCHAR(40);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS schema_name VARCHAR(63);

UPDATE public.tenants
SET tenant_code=coalesce(nullif(trim(both '-' FROM left(lower(regexp_replace(tenant_slug, '[^a-zA-Z0-9]+', '-', 'g')),40)),''),'tenant')
WHERE tenant_code IS NULL;
UPDATE public.tenants
SET schema_name='tenant_' || replace(tenant_code,'-','_')
WHERE schema_name IS NULL;

ALTER TABLE public.tenants ALTER COLUMN tenant_code SET NOT NULL;
ALTER TABLE public.tenants ALTER COLUMN schema_name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_code_uq ON public.tenants(tenant_code);
CREATE UNIQUE INDEX IF NOT EXISTS tenants_schema_name_uq ON public.tenants(schema_name);
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_tenant_code_format_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_tenant_code_format_check
  CHECK (tenant_code ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_schema_name_format_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_schema_name_format_check
  CHECK (schema_name ~ '^tenant_[a-z0-9_]+$');

INSERT INTO public.schema_migrations(version) VALUES ('010_tenant_schemas')
ON CONFLICT (version) DO NOTHING;

COMMIT;
