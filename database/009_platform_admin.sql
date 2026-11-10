-- Permit a separately provisioned platform administrator role.
BEGIN;

ALTER TABLE public.tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_role_check;
ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_role_check
  CHECK (role IN ('admin','planner','viewer','platform_admin'));

INSERT INTO public.schema_migrations(version) VALUES ('009_platform_admin')
ON CONFLICT (version) DO NOTHING;

COMMIT;
