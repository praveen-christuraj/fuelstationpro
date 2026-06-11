-- FuelFlow optional direct-client RLS examples
-- Apply this only if you intentionally introduce selected browser reads against business tables.
-- This file assumes your authenticated users carry an app_role claim in JWT metadata.

begin;

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'app_role',
    auth.jwt() -> 'user_metadata' ->> 'app_role',
    ''
  );
$$;

comment on function public.current_app_role()
is 'Returns FuelFlow app_role from Supabase JWT metadata.';

-- Example: allow authenticated read access to low-risk setup tables for admins/operators.
drop policy if exists products_read_by_staff on public.products;
create policy products_read_by_staff
on public.products
for select
to authenticated
using (public.current_app_role() in ('admin', 'operator', 'finance'));

drop policy if exists shifts_read_by_staff on public.shifts;
create policy shifts_read_by_staff
on public.shifts
for select
to authenticated
using (public.current_app_role() in ('admin', 'operator', 'finance'));

drop policy if exists nozzles_read_by_staff on public.nozzles;
create policy nozzles_read_by_staff
on public.nozzles
for select
to authenticated
using (public.current_app_role() in ('admin', 'operator'));

drop policy if exists tanks_read_by_staff on public.tanks;
create policy tanks_read_by_staff
on public.tanks
for select
to authenticated
using (public.current_app_role() in ('admin', 'operator', 'finance'));

-- Example: keep finance data admin/finance only if direct browser reads are ever needed.
drop policy if exists finance_transactions_read_limited on public.finance_transactions;
create policy finance_transactions_read_limited
on public.finance_transactions
for select
to authenticated
using (public.current_app_role() in ('admin', 'finance'));

-- Example: keep sales read access limited to operational roles.
drop policy if exists sales_read_by_staff on public.sales;
create policy sales_read_by_staff
on public.sales
for select
to authenticated
using (public.current_app_role() in ('admin', 'operator', 'finance'));

commit;

-- Notes:
-- 1. Do not apply direct insert/update/delete policies casually. The current app expects
--    privileged writes to stay behind the serverless API where validation is enforced.
-- 2. If you add app_role claims, ensure they are minted consistently for all users.
-- 3. Review each policy against actual screens before enabling direct client table access.
