-- Finance Management & Credit Sales Enhancement Migration
-- Run this against your Supabase database to add new columns and indexes

-- Add new columns to credit_sales
ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS daily_sales_entry_id bigint references daily_sales_entries(id);
ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS settled_amount numeric(14,2) default 0;
ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS settled_date date;
ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS settlement_method text;
ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS remarks text;

-- Add new columns to finance_transactions
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS sub_category text;
ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS remarks text;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_sales_date ON credit_sales (sale_date desc);
CREATE INDEX IF NOT EXISTS idx_credit_sales_status ON credit_sales (status);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_date ON finance_transactions (txn_date desc);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions (txn_type);
