-- Run this in Supabase SQL Editor before using calibration features

CREATE TABLE IF NOT EXISTS tank_calibration (
  id bigint primary key generated always as identity,
  tank_id bigint NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
  dip_cm numeric(10,2) NOT NULL CHECK (dip_cm >= 0),
  volume_liters numeric(12,2) NOT NULL CHECK (volume_liters >= 0),
  created_at timestamptz default now(),
  UNIQUE (tank_id, dip_cm)
);

CREATE INDEX IF NOT EXISTS idx_tank_calibration_tank_dip
  ON tank_calibration (tank_id, dip_cm);
