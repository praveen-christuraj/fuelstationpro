-- FUELFLOW COMPLETE SCHEMA
-- Run this entire script in Supabase SQL Editor.
-- Uses IF NOT EXISTS so it's safe to run multiple times.

-- 1. products
CREATE TABLE IF NOT EXISTS products (
  id bigint primary key generated always as identity,
  name text not null,
  code text,
  category text,
  unit text default 'Litre',
  current_price numeric(12,2),
  density numeric(8,4),
  active boolean default true,
  created_at timestamptz default now()
);

-- 2. price_history
CREATE TABLE IF NOT EXISTS price_history (
  id bigint primary key generated always as identity,
  product_name text not null,
  old_price numeric(12,2),
  new_price numeric(12,2) not null,
  effective_date date not null,
  changed_by text,
  created_at timestamptz default now()
);

-- 3. tanks
CREATE TABLE IF NOT EXISTS tanks (
  id bigint primary key generated always as identity,
  name text not null,
  code text,
  product_name text not null,
  capacity numeric(12,2) not null,
  current_volume numeric(12,2) default 0,
  dead_stock numeric(12,2) default 0,
  diameter numeric(8,2) default 0,
  created_at timestamptz default now()
);

-- 4. tank_calibration
CREATE TABLE IF NOT EXISTS tank_calibration (
  id bigint primary key generated always as identity,
  tank_id bigint not null references tanks(id) on delete cascade,
  dip_mm numeric(10,2) not null check (dip_mm >= 0),
  volume_liters numeric(12,2) not null check (volume_liters >= 0),
  created_at timestamptz default now(),
  unique (tank_id, dip_mm)
);
create index if not exists idx_tank_calibration_tank_dip on tank_calibration (tank_id, dip_mm);

-- 5. dispensers
CREATE TABLE IF NOT EXISTS dispensers (
  id bigint primary key generated always as identity,
  name text not null,
  code text,
  make text,
  num_nozzles integer,
  status text default 'Operational',
  created_at timestamptz default now()
);

-- 6. nozzles
CREATE TABLE IF NOT EXISTS nozzles (
  id bigint primary key generated always as identity,
  name text not null,
  code text,
  dispenser_name text not null,
  tank_name text not null,
  product_name text not null,
  status text default 'Active',
  created_at timestamptz default now()
);

-- 7. meters
CREATE TABLE IF NOT EXISTS meters (
  id bigint primary key generated always as identity,
  nozzle_name text not null,
  serial_no text,
  opening_reading numeric(12,2) default 0,
  current_reading numeric(12,2) default 0,
  unit text default 'Litre',
  created_at timestamptz default now()
);

-- 8. operators
CREATE TABLE IF NOT EXISTS operators (
  id bigint primary key generated always as identity,
  name text not null,
  emp_code text,
  phone text,
  role text,
  active boolean default true,
  created_at timestamptz default now()
);

-- 9. shifts
CREATE TABLE IF NOT EXISTS shifts (
  id bigint primary key generated always as identity,
  name text not null,
  start_time text,
  end_time text,
  description text,
  created_at timestamptz default now()
);

-- 10. bank_accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id bigint primary key generated always as identity,
  bank_name text not null,
  account_name text not null,
  account_no text not null,
  ifsc text,
  balance numeric(14,2) default 0,
  created_at timestamptz default now()
);

-- 11. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id bigint primary key generated always as identity,
  name text not null,
  contact_person text,
  phone text,
  email text,
  gst_no text,
  products text,
  created_at timestamptz default now()
);

-- 12. tanker_unloading
CREATE TABLE IF NOT EXISTS tanker_unloading (
  id bigint primary key generated always as identity,
  unload_date date not null,
  supplier_name text not null,
  tank_name text not null,
  product_name text not null,
  invoice_no text,
  declared_volume numeric(12,2) not null,
  received_volume numeric(12,2) not null,
  temperature numeric(6,2),
  created_at timestamptz default now()
);

-- 13. stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id bigint primary key generated always as identity,
  movement_date date not null,
  movement_type text not null,
  tank_name text not null,
  product_name text not null,
  volume numeric(12,2) not null,
  reason text,
  created_at timestamptz default now()
);

-- 14. sales
CREATE TABLE IF NOT EXISTS sales (
  id bigint primary key generated always as identity,
  sale_date date not null,
  nozzle_name text,
  product_name text not null,
  operator_name text not null,
  shift_name text not null,
  opening_reading numeric(12,2) default 0,
  closing_reading numeric(12,2) default 0,
  testing_volume numeric(12,2) default 0,
  sale_volume numeric(12,2),
  unit_price numeric(12,2),
  total_amount numeric(12,2),
  loss_gain numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- 15. credit_sales
CREATE TABLE IF NOT EXISTS credit_sales (
  id bigint primary key generated always as identity,
  sale_date date not null,
  customer_name text not null,
  product_name text not null,
  volume numeric(12,2),
  amount numeric(12,2) not null,
  vehicle_no text,
  status text default 'Pending',
  created_at timestamptz default now()
);

-- 16. finance_transactions
CREATE TABLE IF NOT EXISTS finance_transactions (
  id bigint primary key generated always as identity,
  txn_date date not null,
  txn_type text not null,
  category text,
  bank_account text,
  amount numeric(14,2) not null,
  reference text,
  created_at timestamptz default now()
);
