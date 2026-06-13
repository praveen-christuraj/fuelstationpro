-- FUELFLOW COMPLETE SCHEMA — SAFE TO RE-RUN
-- Uses CREATE TABLE IF NOT EXISTS for new tables
-- Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS for columns on existing tables

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
ALTER TABLE products ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS density numeric(8,4);
ALTER TABLE products ADD COLUMN IF NOT EXISTS active boolean default true;
ALTER TABLE products DROP COLUMN IF EXISTS is_active;

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
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS old_price numeric(12,2);
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS new_price numeric(12,2);
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS changed_by text;
ALTER TABLE price_history DROP COLUMN IF EXISTS price;

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
ALTER TABLE tanks ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE tanks ADD COLUMN IF NOT EXISTS dead_stock numeric(12,2) default 0;
ALTER TABLE tanks ADD COLUMN IF NOT EXISTS diameter numeric(8,2) default 0;

-- 4. tank_calibration
CREATE TABLE IF NOT EXISTS tank_calibration (
  id bigint primary key generated always as identity,
  tank_id bigint not null references tanks(id) on delete cascade,
  dip_mm numeric(10,2) not null check (dip_mm >= 0),
  volume_liters numeric(12,2) not null check (volume_liters >= 0),
  created_at timestamptz default now(),
  unique (tank_id, dip_mm)
);
ALTER TABLE tank_calibration ADD COLUMN IF NOT EXISTS dip_mm numeric(10,2);
DO $$BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tank_calibration' AND column_name = 'dip_cm') THEN UPDATE tank_calibration SET dip_mm = dip_cm * 10 WHERE dip_mm IS NULL AND dip_cm IS NOT NULL; END IF; END$$;
ALTER TABLE tank_calibration DROP CONSTRAINT IF EXISTS tank_calibration_tank_id_dip_cm_key;
CREATE INDEX IF NOT EXISTS idx_tank_calibration_tank_dip on tank_calibration (tank_id, dip_mm);
ALTER TABLE tank_calibration DROP COLUMN IF EXISTS dip_cm;

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
ALTER TABLE dispensers ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE dispensers ADD COLUMN IF NOT EXISTS make text;
ALTER TABLE dispensers ADD COLUMN IF NOT EXISTS num_nozzles integer;
ALTER TABLE dispensers ADD COLUMN IF NOT EXISTS status text default 'Operational';
ALTER TABLE dispensers DROP COLUMN IF EXISTS model;
ALTER TABLE dispensers DROP COLUMN IF EXISTS is_active;

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
ALTER TABLE nozzles ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE nozzles ADD COLUMN IF NOT EXISTS tank_name text;
ALTER TABLE nozzles ADD COLUMN IF NOT EXISTS status text default 'Active';
ALTER TABLE nozzles DROP COLUMN IF EXISTS is_active;

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
ALTER TABLE meters ADD COLUMN IF NOT EXISTS nozzle_name text;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS serial_no text;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS opening_reading numeric(12,2) default 0;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS current_reading numeric(12,2) default 0;
ALTER TABLE meters ADD COLUMN IF NOT EXISTS unit text default 'Litre';
ALTER TABLE meters DROP COLUMN IF EXISTS name;
ALTER TABLE meters DROP COLUMN IF EXISTS product_name;

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
ALTER TABLE operators ADD COLUMN IF NOT EXISTS emp_code text;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE operators ADD COLUMN IF NOT EXISTS active boolean default true;
ALTER TABLE operators DROP COLUMN IF EXISTS is_active;

-- 9. shifts
CREATE TABLE IF NOT EXISTS shifts (
  id bigint primary key generated always as identity,
  name text not null,
  start_time text,
  end_time text,
  description text,
  created_at timestamptz default now()
);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS description text;

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
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_no text;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS ifsc text;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS balance numeric(14,2) default 0;
ALTER TABLE bank_accounts DROP COLUMN IF EXISTS account_number;
ALTER TABLE bank_accounts DROP COLUMN IF EXISTS ifsc_code;
ALTER TABLE bank_accounts DROP COLUMN IF EXISTS branch;
ALTER TABLE bank_accounts DROP COLUMN IF EXISTS is_active;

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
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS gst_no text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS products text;
ALTER TABLE suppliers DROP COLUMN IF EXISTS is_active;

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

-- 17. tanker_unloading_headers
CREATE TABLE IF NOT EXISTS tanker_unloading_headers (
  id bigint primary key generated always as identity,
  unload_date date not null,
  tanker_number text not null,
  supplier_name text,
  waybill_no text,
  invoice_no text,
  temperature numeric(6,2),
  created_at timestamptz default now()
);
create index if not exists idx_tanker_unloading_headers_date on tanker_unloading_headers (unload_date desc);

-- 18. tanker_unloading_lines
CREATE TABLE IF NOT EXISTS tanker_unloading_lines (
  id bigint primary key generated always as identity,
  header_id bigint not null references tanker_unloading_headers(id) on delete cascade,
  product_name text not null,
  tank_name text not null,
  tanker_qty numeric(12,2) not null check (tanker_qty >= 0),
  dip_before_mm numeric(10,2) check (dip_before_mm >= 0),
  dip_after_mm numeric(10,2) check (dip_after_mm >= 0),
  volume_before_liters numeric(12,2) check (volume_before_liters >= 0),
  volume_after_liters numeric(12,2) check (volume_after_liters >= 0),
  received_volume numeric(12,2),
  variance numeric(12,2),
  created_at timestamptz default now()
);
create index if not exists idx_tanker_unloading_lines_header on tanker_unloading_lines (header_id);
create index if not exists idx_tanker_unloading_lines_tank on tanker_unloading_lines (tank_name);
create index if not exists idx_tanker_unloading_lines_product on tanker_unloading_lines (product_name);

-- 19. daily_sales_entries
CREATE TABLE IF NOT EXISTS daily_sales_entries (
  id bigint primary key generated always as identity,
  sale_date date not null,
  shift_name text not null,
  operator_name text not null,
  dispenser_name text,
  cash_amount numeric(14,2) default 0,
  online_amount numeric(14,2) default 0,
  credit_amount numeric(14,2) default 0,
  total_submitted numeric(14,2) default 0,
  total_sales_amount numeric(14,2) default 0,
  variance numeric(14,2) default 0,
  status text default 'submitted',
  created_at timestamptz default now()
);
ALTER TABLE daily_sales_entries ADD COLUMN IF NOT EXISTS dispenser_name text;
create index if not exists idx_daily_sales_entries_date on daily_sales_entries (sale_date desc);
create index if not exists idx_daily_sales_entries_dispenser on daily_sales_entries (dispenser_name);
create unique index if not exists uq_daily_sales_entry_shift_dispenser on daily_sales_entries (sale_date, shift_name, dispenser_name) where dispenser_name is not null;
create unique index if not exists uq_daily_sales_entry_shift_operator on daily_sales_entries (sale_date, shift_name, operator_name);

-- 20. daily_sales_nozzle_readings
CREATE TABLE IF NOT EXISTS daily_sales_nozzle_readings (
  id bigint primary key generated always as identity,
  sales_entry_id bigint not null references daily_sales_entries(id) on delete cascade,
  nozzle_name text not null,
  dispenser_name text,
  tank_name text,
  product_name text not null,
  opening_reading numeric(12,2) default 0,
  closing_reading numeric(12,2) default 0,
  volume numeric(12,2) default 0,
  unit_price numeric(12,2) default 0,
  amount numeric(14,2) default 0,
  created_at timestamptz default now()
);
create index if not exists idx_daily_sales_nozzle_readings_entry on daily_sales_nozzle_readings (sales_entry_id);
create index if not exists idx_daily_sales_nozzle_readings_date on daily_sales_nozzle_readings (created_at desc);

-- 21. daily_sales_testing
CREATE TABLE IF NOT EXISTS daily_sales_testing (
  id bigint primary key generated always as identity,
  sales_entry_id bigint not null references daily_sales_entries(id) on delete cascade,
  nozzle_name text,
  tank_name text,
  product_name text not null,
  volume numeric(12,2) default 0,
  unit_price numeric(12,2) default 0,
  amount numeric(14,2) default 0,
  remarks text,
  created_at timestamptz default now()
);
ALTER TABLE daily_sales_testing ADD COLUMN IF NOT EXISTS unit_price numeric(12,2) default 0;
ALTER TABLE daily_sales_testing ADD COLUMN IF NOT EXISTS amount numeric(14,2) default 0;
create index if not exists idx_daily_sales_testing_entry on daily_sales_testing (sales_entry_id);

-- 22. buffer_tanks
CREATE TABLE IF NOT EXISTS buffer_tanks (
  id bigint primary key generated always as identity,
  product_name text not null unique,
  volume numeric(12,2) default 0,
  updated_at timestamptz default now()
);

-- 23. dip_readings
CREATE TABLE IF NOT EXISTS dip_readings (
  id bigint primary key generated always as identity,
  reading_date date not null,
  tank_name text not null,
  dip_mm numeric(10,2) not null check (dip_mm >= 0),
  volume_liters numeric(12,2) not null check (volume_liters >= 0),
  reading_type text not null,
  created_at timestamptz default now()
);
create index if not exists idx_dip_readings_date on dip_readings (reading_date desc);
create index if not exists idx_dip_readings_tank on dip_readings (tank_name);
create unique index if not exists uq_dip_readings_day_tank_type on dip_readings (reading_date, tank_name, reading_type);

-- 24. cash_deposits
CREATE TABLE IF NOT EXISTS cash_deposits (
  id bigint primary key generated always as identity,
  deposit_date date not null,
  bank_account_id bigint references bank_accounts(id),
  amount numeric(14,2) not null check (amount >= 0),
  reference text,
  created_at timestamptz default now()
);
create index if not exists idx_cash_deposits_date on cash_deposits (deposit_date desc);

-- ===== UNIQUE CONSTRAINTS (DO block for idempotent add) =====
DO $$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_name_key') THEN ALTER TABLE products ADD CONSTRAINT products_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_code_key') THEN ALTER TABLE products ADD CONSTRAINT products_code_key UNIQUE (code); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tanks_name_key') THEN ALTER TABLE tanks ADD CONSTRAINT tanks_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tanks_code_key') THEN ALTER TABLE tanks ADD CONSTRAINT tanks_code_key UNIQUE (code); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispensers_name_key') THEN ALTER TABLE dispensers ADD CONSTRAINT dispensers_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dispensers_code_key') THEN ALTER TABLE dispensers ADD CONSTRAINT dispensers_code_key UNIQUE (code); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nozzles_name_key') THEN ALTER TABLE nozzles ADD CONSTRAINT nozzles_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nozzles_code_key') THEN ALTER TABLE nozzles ADD CONSTRAINT nozzles_code_key UNIQUE (code); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operators_name_key') THEN ALTER TABLE operators ADD CONSTRAINT operators_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operators_emp_code_key') THEN ALTER TABLE operators ADD CONSTRAINT operators_emp_code_key UNIQUE (emp_code); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shifts_name_key') THEN ALTER TABLE shifts ADD CONSTRAINT shifts_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_name_key') THEN ALTER TABLE suppliers ADD CONSTRAINT suppliers_name_key UNIQUE (name); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meters_serial_no_key') THEN ALTER TABLE meters ADD CONSTRAINT meters_serial_no_key UNIQUE (serial_no); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_account_no_key') THEN ALTER TABLE bank_accounts ADD CONSTRAINT bank_accounts_account_no_key UNIQUE (account_no); END IF;
END$$;
