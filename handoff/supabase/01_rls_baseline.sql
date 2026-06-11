-- FuelFlow recommended RLS baseline
-- Use this for the current architecture where browser clients use Supabase only for auth,
-- and business data access flows through the serverless API with the service-role key.

begin;

-- Enable RLS on all business tables.
alter table if exists public.products enable row level security;
alter table if exists public.price_history enable row level security;
alter table if exists public.tanks enable row level security;
alter table if exists public.tank_calibration enable row level security;
alter table if exists public.dispensers enable row level security;
alter table if exists public.nozzles enable row level security;
alter table if exists public.meters enable row level security;
alter table if exists public.operators enable row level security;
alter table if exists public.shifts enable row level security;
alter table if exists public.bank_accounts enable row level security;
alter table if exists public.suppliers enable row level security;
alter table if exists public.tanker_unloading enable row level security;
alter table if exists public.stock_movements enable row level security;
alter table if exists public.sales enable row level security;
alter table if exists public.credit_sales enable row level security;
alter table if exists public.finance_transactions enable row level security;

-- Revoke direct table access from browser roles.
-- With RLS enabled and no policies, these roles are denied anyway; the revokes make the
-- intended production posture more explicit and reduce accidental privilege drift.
revoke all on table public.products from anon, authenticated;
revoke all on table public.price_history from anon, authenticated;
revoke all on table public.tanks from anon, authenticated;
revoke all on table public.tank_calibration from anon, authenticated;
revoke all on table public.dispensers from anon, authenticated;
revoke all on table public.nozzles from anon, authenticated;
revoke all on table public.meters from anon, authenticated;
revoke all on table public.operators from anon, authenticated;
revoke all on table public.shifts from anon, authenticated;
revoke all on table public.bank_accounts from anon, authenticated;
revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.tanker_unloading from anon, authenticated;
revoke all on table public.stock_movements from anon, authenticated;
revoke all on table public.sales from anon, authenticated;
revoke all on table public.credit_sales from anon, authenticated;
revoke all on table public.finance_transactions from anon, authenticated;

commit;

-- Verification query:
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
--   and tablename in (
--     'products', 'price_history', 'tanks', 'tank_calibration', 'dispensers',
--     'nozzles', 'meters', 'operators', 'shifts', 'bank_accounts', 'suppliers',
--     'tanker_unloading', 'stock_movements', 'sales', 'credit_sales', 'finance_transactions'
--   )
-- order by tablename;
