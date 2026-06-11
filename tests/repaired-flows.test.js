import test from 'node:test';
import assert from 'node:assert/strict';

import { validateChart } from '../api/calibration-validate.js';
import { extractBearerToken } from '../api/auth-token.js';
import { normalizeSalesRows } from '../api/sales-validate.js';
import { normalizeStockMovementRows, normalizeTankerUnloadingRows } from '../api/stock-validate.js';
import { resolveTable } from '../api/table-resolve.js';
import { isAllowedResource, isOriginAllowed, parseAllowedOrigins } from '../api/runtime-config.js';
import { buildLossGainRows } from '../src/lib/loss-gain.js';

function createSupabaseMock({ products = [], nozzles = [], tanks = [] } = {}) {
  const tables = { products, nozzles, tanks };

  return {
    from(tableName) {
      return {
        select() {
          return {
            in(column, values) {
              const rows = (tables[tableName] || []).filter((row) => values.includes(row[column]));
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

test('resolveTable maps finance to finance_transactions and normalizes hyphens', () => {
  assert.equal(resolveTable('finance'), 'finance_transactions');
  assert.equal(resolveTable('stock-movements'), 'stock_movements');
});

test('runtime config restricts exposed resources to the known API surface', () => {
  assert.equal(isAllowedResource('sales'), true);
  assert.equal(isAllowedResource('finance'), true);
  assert.equal(isAllowedResource('admin-only-table'), false);
});

test('auth helper extracts bearer tokens safely', () => {
  assert.equal(extractBearerToken('Bearer abc.def'), 'abc.def');
  assert.equal(extractBearerToken('bearer xyz'), 'xyz');
  assert.equal(extractBearerToken('Token xyz'), null);
  assert.equal(extractBearerToken(undefined), null);
});

test('runtime config parses and enforces optional origin allowlists', () => {
  assert.deepEqual(parseAllowedOrigins('https://a.example, https://b.example'), [
    'https://a.example',
    'https://b.example',
  ]);
  assert.equal(isOriginAllowed('https://a.example', 'https://a.example,https://b.example'), true);
  assert.equal(isOriginAllowed('https://x.example', 'https://a.example,https://b.example'), false);
  assert.equal(isOriginAllowed(undefined, 'https://a.example'), true);
});

test('validateChart accepts ascending calibration points', () => {
  const result = validateChart([
    { dip_cm: 10, volume_liters: 500 },
    { dip_cm: 20, volume_liters: 1200 },
  ], 2000);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateChart rejects duplicate or decreasing calibration points', () => {
  const result = validateChart([
    { dip_cm: 10, volume_liters: 500 },
    { dip_cm: 10, volume_liters: 400 },
  ], 2000);

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' | '), /Duplicate dip_cm values|must be strictly greater|must not decrease/);
});

test('normalizeSalesRows recomputes sale volume and total amount from readings', async () => {
  const supabase = createSupabaseMock({
    products: [{ name: 'Petrol', current_price: 102.5 }],
    nozzles: [{ name: 'Nozzle 1', product_name: 'Petrol' }],
  });

  const [row] = await normalizeSalesRows([{
    sale_date: '2026-06-11',
    nozzle_name: 'Nozzle 1',
    product_name: 'Petrol',
    operator_name: 'Op A',
    shift_name: 'Morning',
    opening_reading: 1000,
    closing_reading: 1100,
    testing_volume: 5,
  }], supabase);

  assert.equal(row.sale_volume, 95);
  assert.equal(row.unit_price, 102.5);
  assert.equal(row.total_amount, 9737.5);
});

test('normalizeSalesRows rejects nozzle and product mismatch', async () => {
  const supabase = createSupabaseMock({
    products: [{ name: 'Diesel', current_price: 90 }],
    nozzles: [{ name: 'Nozzle 1', product_name: 'Petrol' }],
  });

  await assert.rejects(
    normalizeSalesRows([{
      sale_date: '2026-06-11',
      nozzle_name: 'Nozzle 1',
      product_name: 'Diesel',
      operator_name: 'Op A',
      shift_name: 'Morning',
      sale_volume: 50,
      unit_price: 90,
    }], supabase),
    /Selected nozzle does not match the chosen product/,
  );
});

test('normalizeStockMovementRows validates movement type, volume, and tank-product match', async () => {
  const supabase = createSupabaseMock({
    tanks: [{ name: 'Tank 1', product_name: 'Petrol' }],
  });

  const [row] = await normalizeStockMovementRows([{
    movement_date: '2026-06-11',
    movement_type: 'in',
    tank_name: 'Tank 1',
    product_name: 'Petrol',
    volume: 500,
    reason: 'Adjustment',
  }], supabase);

  assert.equal(row.movement_type, 'IN');
  assert.equal(row.volume, 500);

  await assert.rejects(
    normalizeStockMovementRows([{
      movement_date: '2026-06-11',
      movement_type: 'OUT',
      tank_name: 'Tank 1',
      product_name: 'Diesel',
      volume: 100,
    }], supabase),
    /Selected tank does not match the chosen product/,
  );
});

test('normalizeTankerUnloadingRows validates tank-product match and positive volumes', async () => {
  const supabase = createSupabaseMock({
    tanks: [{ name: 'Tank 1', product_name: 'Diesel' }],
  });

  const [row] = await normalizeTankerUnloadingRows([{
    unload_date: '2026-06-11',
    supplier_name: 'Supplier A',
    tank_name: 'Tank 1',
    product_name: 'Diesel',
    declared_volume: 12000,
    received_volume: 11950,
  }], supabase);

  assert.equal(row.received_volume, 11950);

  await assert.rejects(
    normalizeTankerUnloadingRows([{
      unload_date: '2026-06-11',
      supplier_name: 'Supplier A',
      tank_name: 'Tank 1',
      product_name: 'Petrol',
      declared_volume: 12000,
      received_volume: 11950,
    }], supabase),
    /Selected tank does not match the chosen product/,
  );
});

test('buildLossGainRows uses tanker receipts and avoids double-counting receipt stock moves', () => {
  const rows = buildLossGainRows({
    unloads: [{ product_name: 'Petrol', received_volume: 1000 }],
    moves: [
      { product_name: 'Petrol', movement_type: 'IN', volume: 1000, reason: 'Tanker Receipt' },
      { product_name: 'Petrol', movement_type: 'IN', volume: 50, reason: 'Adjustment' },
      { product_name: 'Petrol', movement_type: 'OUT', volume: 20, reason: 'Transfer' },
    ],
    sales: [{ product_name: 'Petrol', sale_volume: 300, testing_volume: 10 }],
    tanks: [{ product_name: 'Petrol', current_volume: 700 }],
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    product: 'Petrol',
    receipts: 1000,
    adjIn: 50,
    adjOut: 20,
    sold: 300,
    testing: 10,
    tankVol: 700,
    bookStock: 720,
    variance: -20,
  });
});
