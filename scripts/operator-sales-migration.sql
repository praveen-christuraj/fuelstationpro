-- Operator Sales Management Migration
-- Safe to re-run; uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS

-- 25. operator_sales_settlements
-- Tracks per-operator, per-shift, per-dispenser, per-date sales settlement records.
-- Initial data can be seeded from daily_sales_entries; then managed (deductions, close-out) here.
CREATE TABLE IF NOT EXISTS operator_sales_settlements (
  id bigint primary key generated always as identity,
  sale_date date not null,
  shift_name text not null,
  operator_name text not null,
  dispenser_name text not null,
  daily_sales_entry_id bigint references daily_sales_entries(id) on delete set null,
  total_sales_amount numeric(14,2) default 0,
  submitted_amount numeric(14,2) default 0,
  variance numeric(14,2) default 0,
  deduction_amount numeric(14,2) default 0,
  net_payable numeric(14,2) default 0,
  status text default 'open' check (status in ('open', 'settled')),
  remarks text,
  settled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_operator_settlements_date on operator_sales_settlements (sale_date desc);
create index if not exists idx_operator_settlements_operator on operator_sales_settlements (operator_name);
create index if not exists idx_operator_settlements_status on operator_sales_settlements (status);
create index if not exists idx_operator_settlements_shift on operator_sales_settlements (shift_name);

-- Unique constraint: one settlement per operator per shift per date per dispenser
create unique index if not exists uq_operator_settlement on operator_sales_settlements (sale_date, shift_name, operator_name, dispenser_name);

-- Seed from existing daily_sales_entries (only those with an operator assigned)
INSERT INTO operator_sales_settlements (sale_date, shift_name, operator_name, dispenser_name, daily_sales_entry_id, total_sales_amount, submitted_amount, variance)
SELECT
  d.sale_date,
  d.shift_name,
  d.operator_name,
  d.dispenser_name,
  d.id,
  d.total_sales_amount,
  (d.cash_amount + d.online_amount) as submitted_amount,
  d.variance
FROM daily_sales_entries d
WHERE d.operator_name IS NOT NULL AND d.operator_name != ''
ON CONFLICT (sale_date, shift_name, operator_name, dispenser_name) DO NOTHING;
