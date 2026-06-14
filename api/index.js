import supabase from './db-client.js';
import { validateChart } from './calibration-validate.js';
import { normalizeSalesRows } from './sales-validate.js';
import { normalizeStockMovementRows } from './stock-validate.js';
import { resolveTable } from './table-resolve.js';
import { applyCorsHeaders, isAllowedResource, isOriginAllowed } from './runtime-config.js';
import { authenticateRequest } from './auth.js';

const TXN_TABLES = [
  'tanker_unloading', 'tanker_unloading_headers', 'tanker_unloading_lines',
  'daily_sales_entries', 'daily_sales_nozzle_readings', 'daily_sales_testing',
  'dip_readings', 'cash_deposits',
  'stock_movements', 'sales', 'credit_sales', 'finance_transactions',
  'price_history',
];

const REFERENCE_MAP = {
  products: [
    { table: 'tanks', column: 'product_name', label: 'tanks' },
    { table: 'nozzles', column: 'product_name', label: 'nozzles' },
    { table: 'price_history', column: 'product_name', label: 'price history records' },
    { table: 'tanker_unloading', column: 'product_name', label: 'tanker unloading records' },
    { table: 'stock_movements', column: 'product_name', label: 'stock movements' },
    { table: 'sales', column: 'product_name', label: 'sales records' },
    { table: 'credit_sales', column: 'product_name', label: 'credit sales' },
    { table: 'buffer_tanks', column: 'product_name', label: 'buffer tank records' },
    { table: 'tanker_unloading_lines', column: 'product_name', label: 'tanker unloading lines' },
    { table: 'daily_sales_nozzle_readings', column: 'product_name', label: 'daily sales nozzle readings' },
    { table: 'daily_sales_testing', column: 'product_name', label: 'daily sales testing records' },
  ],
  tanks: [
    { table: 'nozzles', column: 'tank_name', label: 'nozzles' },
    { table: 'tank_calibration', column: 'tank_id', isId: true, label: 'calibration charts' },
    { table: 'tanker_unloading', column: 'tank_name', label: 'tanker unloading records' },
    { table: 'tanker_unloading_lines', column: 'tank_name', label: 'tanker unloading lines' },
    { table: 'stock_movements', column: 'tank_name', label: 'stock movements' },
    { table: 'daily_sales_nozzle_readings', column: 'tank_name', label: 'daily sales nozzle readings' },
    { table: 'dip_readings', column: 'tank_name', label: 'dip readings' },
    { table: 'daily_sales_testing', column: 'tank_name', label: 'daily sales testing records' },
  ],
  dispensers: [
    { table: 'nozzles', column: 'dispenser_name', label: 'nozzles' },
    { table: 'daily_sales_entries', column: 'dispenser_name', label: 'daily sales entries' },
    { table: 'daily_sales_nozzle_readings', column: 'dispenser_name', label: 'daily sales nozzle readings' },
  ],
  nozzles: [
    { table: 'meters', column: 'nozzle_name', label: 'meters' },
    { table: 'sales', column: 'nozzle_name', label: 'sales records' },
    { table: 'daily_sales_nozzle_readings', column: 'nozzle_name', label: 'daily sales nozzle readings' },
    { table: 'daily_sales_testing', column: 'nozzle_name', label: 'daily sales testing records' },
  ],
  operators: [
    { table: 'sales', column: 'operator_name', label: 'sales records' },
    { table: 'daily_sales_entries', column: 'operator_name', label: 'daily sales entries' },
  ],
  shifts: [
    { table: 'sales', column: 'shift_name', label: 'sales records' },
    { table: 'daily_sales_entries', column: 'shift_name', label: 'daily sales entries' },
  ],
  suppliers: [
    { table: 'tanker_unloading', column: 'supplier_name', label: 'tanker unloading records' },
    { table: 'tanker_unloading_headers', column: 'supplier_name', label: 'tanker unloading headers' },
  ],
  bank_accounts: [
    { table: 'finance_transactions', column: 'bank_account', label: 'finance transactions' },
  ],
};

async function beforeDeleteCheck(dbTable, id, supabase) {
  const { data: record, error: fetchErr } = await supabase.from(dbTable).select('*').eq('id', id).single();
  if (fetchErr) throw fetchErr;
  if (!record) throw new Error('Record not found');

  if (record.active === true || record.active === 1) {
    throw new Error('Cannot delete an active record. Set it to inactive first.');
  }
  if (record.status && ['Active', 'Operational'].includes(record.status)) {
    throw new Error(`Cannot delete a record with status "${record.status}". Change status first.`);
  }

  const refs = REFERENCE_MAP[dbTable];
  if (refs) {
    for (const ref of refs) {
      const refValue = ref.isId ? id : record[ref.column];
      if (refValue == null || refValue === '') continue;
      const { count, error: countErr } = await supabase
        .from(ref.table)
        .select('*', { count: 'exact', head: true })
        .eq(ref.column, refValue);
      if (countErr) throw countErr;
      if (count > 0) {
        throw new Error(`Cannot delete this ${dbTable.slice(0, -1)} because it is referenced by ${count} ${ref.label}. Remove those references first.`);
      }
    }
  }
}

const UNIQUE_FIELDS = {
  products: ['name', 'code'],
  tanks: ['name', 'code'],
  dispensers: ['name', 'code'],
  nozzles: ['name', 'code'],
  operators: ['name', 'emp_code'],
  shifts: ['name'],
  suppliers: ['name'],
  meters: ['serial_no'],
  bank_accounts: ['account_no'],
};

async function checkDuplicateFields(dbTable, body, supabase, excludeId) {
  const fields = UNIQUE_FIELDS[dbTable];
  if (!fields) return;
  for (const field of fields) {
    const value = body[field];
    if (value == null || String(value).trim() === '') continue;
    let query = supabase.from(dbTable).select('id').eq(field, String(value).trim());
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    if (data) throw new Error(`${dbTable.slice(0, -1)} with ${field} "${value}" already exists`);
  }
}

const FIELD_VALIDATIONS = {
  products: {
    current_price: (v) => v == null || v === '' || Number(v) >= 0 || 'Price must be 0 or greater',
  },
  tanks: {
    capacity: (v) => v != null && v !== '' && Number(v) > 0 || 'Capacity must be greater than 0',
    dead_stock: (v, body) => v == null || v === '' || Number(v) < Number(body.capacity || 0) || 'Dead stock must be less than capacity',
    current_volume: (v, body) => v == null || v === '' || Number(v) <= Number(body.capacity || Infinity) || 'Current volume must not exceed capacity',
  },
  operators: {
    phone: (v) => !v || /^\+?[\d\s-]{7,15}$/.test(String(v)) || 'Invalid phone number format (7-15 digits with optional +)',
  },
  suppliers: {
    phone: (v) => !v || /^\+?[\d\s-]{7,15}$/.test(String(v)) || 'Invalid phone number format',
    gst_no: (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d[A-Z\d]$/.test(String(v).toUpperCase()) || 'Invalid GST number format (e.g., 22AAAAA0000A1Z5)',
  },
  bank_accounts: {
    account_no: (v) => v == null || v === '' || String(v).length >= 6 || 'Account number must be at least 6 characters',
    ifsc: (v) => !v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(v)) || 'Invalid IFSC code format (e.g., SBIN0001234)',
  },
  meters: {
    opening_reading: (v) => v == null || v === '' || Number(v) >= 0 || 'Opening reading must be 0 or greater',
    current_reading: (v, body) => v == null || v === '' || body.opening_reading == null || body.opening_reading === '' || Number(v) >= Number(body.opening_reading) || 'Current reading must be >= opening reading',
  },
};

function validateFields(dbTable, body, rows) {
  const validations = FIELD_VALIDATIONS[dbTable];
  if (!validations) return;
  const items = rows || [body];
  for (const item of items) {
    for (const [field, validator] of Object.entries(validations)) {
      const result = validator(item[field], item);
      if (result !== true && typeof result === 'string') {
        throw new Error(result);
      }
    }
  }
}

const CROSS_REFERENCE_TABLES = {
  tanks: [
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
  nozzles: [
    { field: 'dispenser_name', refTable: 'dispensers', refField: 'name', label: 'Dispenser' },
    { field: 'tank_name', refTable: 'tanks', refField: 'name', label: 'Tank' },
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
  credit_sales: [
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
};

async function checkCrossReferences(dbTable, body, rows, supabase) {
  const refs = CROSS_REFERENCE_TABLES[dbTable];
  if (!refs) return;
  const items = rows || [body];
  for (const ref of refs) {
    const values = [...new Set(items.map((item) => String(item[ref.field] ?? '').trim()).filter(Boolean))];
    if (values.length === 0) continue;
    const { data, error } = await supabase.from(ref.refTable).select(ref.refField).in(ref.refField, values);
    if (error) throw error;
    const found = new Set((data || []).map((r) => r[ref.refField]));
    for (const val of values) {
      if (!found.has(val)) throw new Error(`${ref.label} not found: ${val}`);
    }
  }
}

function parsePath(url) {
  const parts = new URL(url, 'http://localhost').pathname.replace('/api/', '').split('/').filter(Boolean);
  return parts;
}

function getFilters(url) {
  const params = new URL(url, 'http://localhost').searchParams;
  return Array.from(params.entries()).filter(([key, value]) => key && value !== '');
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);
  if (!isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parts = parsePath(req.url);
  const resource = parts[0];

  try {
    if (resource && !isAllowedResource(resource)) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (parts[0] === 'tanks' && parts[2] === 'calibration' && parts[1]) {
      return await handleCalibration(req, res, parts[1]);
    }
    if (parts[0] === 'calibration' && parts[1] === 'import' && req.method === 'POST') {
      return await handleCalibrationImport(req, res);
    }
    if (parts[0] === 'tanker-unloading' && parts[1] === 'batches') {
      return await handleTankerUnloadingBatches(req, res);
    }
    if (parts[0] === 'tanker-unloading' && parts[1] === 'import' && req.method === 'POST') {
      return await handleTankerUnloadingImport(req, res);
    }
    if (parts[0] === 'daily-sales' && parts[1] === 'import' && req.method === 'POST') {
      return await handleDailySalesImport(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'GET') {
      return await handleDailySalesList(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'POST') {
      return await handleDailySalesCreate(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'PUT') {
      return await handleDailySalesUpdate(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'DELETE') {
      return await handleDailySalesDelete(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'POST') {
      return await handleDipReadingCreate(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'PUT') {
      return await handleDipReadingUpdate(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'DELETE') {
      return await handleDipReadingDelete(req, res);
    }
    if (parts[0] === 'buffer-transfer' && req.method === 'POST') {
      return await handleBufferTransfer(req, res);
    }
    if (parts[0] === 'sales' && req.method === 'POST') {
      return await handleSalesCreate(req, res);
    }
    if (parts[0] === 'sales' && req.method === 'PUT') {
      return await handleSalesUpdate(req, res);
    }
    if (parts[0] === 'stock-movements' && req.method === 'POST') {
      return await handleStockMovementCreate(req, res);
    }
    if (parts[0] === 'stock-movements' && req.method === 'PUT') {
      return await handleStockMovementUpdate(req, res);
    }
    if (parts[0] === 'stock-movements' && req.method === 'DELETE') {
      return await handleStockMovementDelete(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'POST') {
      return await handleTankerUnloadingCreateV2(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'PUT') {
      return await handleTankerUnloadingUpdateV2(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'DELETE') {
      return await handleTankerUnloadingDeleteV2(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'GET') {
      return await handleTankerUnloadingListV2(req, res);
    }

    const dbTable = resolveTable(parts[0]);
    if (!dbTable) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      const filters = getFilters(req.url);
      const orderCol = TXN_TABLES.includes(dbTable) ? 'id' : 'id';
      const orderDir = TXN_TABLES.includes(dbTable) ? { ascending: false } : { ascending: true };
      let query = supabase.from(dbTable).select('*');
      for (const [key, value] of filters) {
        query = query.eq(key, value);
      }
      const { data, error } = await query.order(orderCol, orderDir);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      let rows = Array.isArray(req.body) ? req.body : [req.body];
      validateFields(dbTable, req.body, rows);
      await checkCrossReferences(dbTable, req.body, rows, supabase);
      if (dbTable === 'price_history') {
        rows = await Promise.all(rows.map((row) => normalizePriceHistoryRow(row)));
      }
      for (const row of rows) {
        await checkDuplicateFields(dbTable, row, supabase);
      }
      const { data, error } = await supabase.from(dbTable).insert(rows).select();
      if (error) throw error;
      if (dbTable === 'price_history') {
        for (const row of (Array.isArray(data) ? data : [data])) {
          await syncProductCurrentPrice(row?.product_name);
        }
      }
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID is required' });
      let { id: _id, ...rest } = req.body;
      validateFields(dbTable, rest);
      await checkCrossReferences(dbTable, rest, null, supabase);
      if (dbTable === 'price_history') {
        rest = await normalizePriceHistoryRow(rest, id);
      }
      await checkDuplicateFields(dbTable, rest, supabase, id);
      const { data: beforeUpdate } = dbTable === 'price_history'
        ? await supabase.from(dbTable).select('product_name').eq('id', id).maybeSingle()
        : { data: null };
      const { data, error } = await supabase.from(dbTable).update(rest).eq('id', id).select().single();
      if (error) throw error;
      if (dbTable === 'price_history') {
        await syncProductCurrentPrice(beforeUpdate?.product_name);
        await syncProductCurrentPrice(data?.product_name);
      }
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID is required' });
      const { data: beforeDelete } = dbTable === 'price_history'
        ? await supabase.from(dbTable).select('product_name').eq('id', id).maybeSingle()
        : { data: null };
      await beforeDeleteCheck(dbTable, id, supabase);
      const { error } = await supabase.from(dbTable).delete().eq('id', id);
      if (error) throw error;
      if (dbTable === 'price_history') {
        await syncProductCurrentPrice(beforeDelete?.product_name);
      }
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function handleCalibration(req, res, tankId) {
  const tid = Number(tankId);
  if (isNaN(tid)) return res.status(400).json({ error: 'Invalid tank ID' });

  const { data: tank } = await supabase.from('tanks').select('id, capacity').eq('id', tid).single();
  if (!tank) return res.status(404).json({ error: 'Tank not found' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tank_calibration')
      .select('id, dip_mm, volume_liters')
      .eq('tank_id', tid)
      .order('dip_mm', { ascending: true });
    if (error) throw error;
    return res.status(200).json({ tank_id: tid, points: data || [], count: data?.length || 0 });
  }

  if (req.method === 'PUT') {
    const { points } = req.body || {};
    const validation = validateChart(points, tank.capacity);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join('; ') });

    const { data: existingRows, error: existingErr } = await supabase
      .from('tank_calibration')
      .select('tank_id, dip_mm, volume_liters')
      .eq('tank_id', tid)
      .order('dip_mm', { ascending: true });
    if (existingErr) throw existingErr;

    const { error: delErr } = await supabase.from('tank_calibration').delete().eq('tank_id', tid);
    if (delErr) throw delErr;

    const rows = points.map((p) => ({ tank_id: tid, dip_mm: Number(p.dip_mm), volume_liters: Number(p.volume_liters) }));
    const { data, error: insErr } = await supabase.from('tank_calibration').insert(rows).select();
    if (insErr) {
      const restoreRows = (existingRows || []).map((row) => ({
        tank_id: row.tank_id,
        dip_mm: Number(row.dip_mm),
        volume_liters: Number(row.volume_liters),
      }));
      const restoreResult = restoreRows.length
        ? await supabase.from('tank_calibration').insert(restoreRows)
        : { error: null };
      if (restoreResult.error) {
        throw new Error(`Calibration replace failed and restore also failed: ${insErr.message}; restore: ${restoreResult.error.message}`);
      }
      throw new Error(`Calibration replace failed. Previous chart was restored. ${insErr.message}`);
    }
    return res.status(200).json({ tank_id: tid, points: data, count: data.length, updated_at: new Date().toISOString() });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('tank_calibration').delete().eq('tank_id', tid);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function handleSalesCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const normalizedRows = await normalizeSalesRows(rows, supabase);
  const { data, error } = await supabase.from('sales').insert(normalizedRows).select();
  if (error) throw error;
  return res.status(201).json(data);
}

async function handleSalesUpdate(req, res) {
  const { id, ...rest } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const [normalized] = await normalizeSalesRows([rest], supabase);
  const { data, error } = await supabase.from('sales').update(normalized).eq('id', id).select().single();
  if (error) throw error;
  return res.status(200).json(data);
}

async function handleStockMovementCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const normalizedRows = await normalizeStockMovementRows(rows, supabase);
  const { data, error } = await supabase.from('stock_movements').insert(normalizedRows).select();
  if (error) throw error;
  for (const row of data || []) {
    const signedVolume = String(row.movement_type || '').toUpperCase() === 'IN' ? Number(row.volume || 0) : -Number(row.volume || 0);
    await adjustTankCurrentVolumeForSalesDelta(row.tank_name, row.movement_date, signedVolume);
  }
  return res.status(201).json(data);
}

async function handleStockMovementUpdate(req, res) {
  const { id, ...rest } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const { data: existing, error: existingErr } = await supabase.from('stock_movements').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;
  const [normalized] = await normalizeStockMovementRows([rest], supabase);
  const { data, error } = await supabase.from('stock_movements').update(normalized).eq('id', id).select().single();
  if (error) throw error;
  const oldSignedVolume = String(existing.movement_type || '').toUpperCase() === 'IN' ? Number(existing.volume || 0) : -Number(existing.volume || 0);
  const newSignedVolume = String(data.movement_type || '').toUpperCase() === 'IN' ? Number(data.volume || 0) : -Number(data.volume || 0);
  if (existing.tank_name === data.tank_name && String(existing.movement_date || '') === String(data.movement_date || '')) {
    await adjustTankCurrentVolumeForSalesDelta(data.tank_name, data.movement_date, newSignedVolume - oldSignedVolume);
  } else {
    await adjustTankCurrentVolumeForSalesDelta(existing.tank_name, existing.movement_date, -oldSignedVolume);
    await adjustTankCurrentVolumeForSalesDelta(data.tank_name, data.movement_date, newSignedVolume);
  }
  return res.status(200).json(data);
}

async function handleStockMovementDelete(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const { data: existing, error: existingErr } = await supabase.from('stock_movements').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;
  const { error } = await supabase.from('stock_movements').delete().eq('id', id);
  if (error) throw error;
  const signedVolume = String(existing.movement_type || '').toUpperCase() === 'IN' ? Number(existing.volume || 0) : -Number(existing.volume || 0);
  await adjustTankCurrentVolumeForSalesDelta(existing.tank_name, existing.movement_date, -signedVolume);
  return res.status(200).json({ ok: true });
}

async function handleTankerUnloadingListV2(req, res) {
  const { data, error } = await supabase
    .from('tanker_unloading_headers')
    .select('id, unload_date, tanker_number, supplier_name, waybill_no, invoice_no, temperature, created_at, tanker_unloading_lines ( id, product_name, tank_name, tanker_qty, dip_before_mm, dip_after_mm, volume_before_liters, volume_after_liters, received_volume, variance, created_at )')
    .order('id', { ascending: false });
  if (error) throw error;
  const lines = [];
  for (const h of data || []) {
    const hLines = Array.isArray(h.tanker_unloading_lines) ? h.tanker_unloading_lines : [];
    for (const l of hLines) {
      lines.push({
        id: l.id,
        header_id: h.id,
        unload_date: h.unload_date,
        tanker_number: h.tanker_number,
        supplier_name: h.supplier_name,
        waybill_no: h.waybill_no,
        invoice_no: h.invoice_no,
        temperature: h.temperature,
        product_name: l.product_name,
        tank_name: l.tank_name,
        declared_volume: l.tanker_qty,
        tanker_qty: l.tanker_qty,
        dip_before_mm: l.dip_before_mm,
        dip_after_mm: l.dip_after_mm,
        volume_before_liters: l.volume_before_liters,
        volume_after_liters: l.volume_after_liters,
        received_volume: l.received_volume,
        variance: l.variance,
        created_at: l.created_at,
      });
    }
  }
  return res.status(200).json(lines);
}

async function handleTankerUnloadingBatches(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { data, error } = await supabase
    .from('tanker_unloading_headers')
    .select('id, unload_date, tanker_number, supplier_name, waybill_no, invoice_no, temperature, created_at, tanker_unloading_lines ( id, product_name, tank_name, tanker_qty, dip_before_mm, dip_after_mm, volume_before_liters, volume_after_liters, received_volume, variance, created_at )')
    .order('id', { ascending: false });
  if (error) throw error;
  const batches = (data || []).map((h) => {
    const lines = Array.isArray(h.tanker_unloading_lines) ? h.tanker_unloading_lines : [];
    const totalTankerQty = lines.reduce((s, l) => s + Number(l.tanker_qty || 0), 0);
    const totalReceived = lines.reduce((s, l) => s + Number(l.received_volume || 0), 0);
    return { ...h, totals: { tanker_qty: totalTankerQty, received_volume: totalReceived, variance: totalReceived - totalTankerQty } };
  });
  return res.status(200).json(batches);
}

function requireText(value, label) {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${label} is required`);
  return v;
}

function optionalText(value) {
  const v = String(value ?? '').trim();
  return v || null;
}

function requireNonNegativeNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be 0 or greater`);
  return n;
}

function optionalNumber(value, label) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number`);
  return n;
}

async function resolvePriceBeforeOrOnDate(productName, effectiveDate, excludeId = null) {
  let query = supabase
    .from('price_history')
    .select('id, new_price')
    .eq('product_name', productName)
    .lte('effective_date', effectiveDate)
    .order('effective_date', { ascending: false })
    .order('id', { ascending: false });
  if (excludeId) query = query.neq('id', excludeId);
  const { data: priceRow, error: priceErr } = await query.limit(1).maybeSingle();
  if (priceErr) throw priceErr;
  if (priceRow) return Number(priceRow.new_price || 0);

  const { data: productRow, error: productErr } = await supabase
    .from('products')
    .select('current_price')
    .eq('name', productName)
    .maybeSingle();
  if (productErr) throw productErr;
  return Number(productRow?.current_price || 0);
}

async function normalizePriceHistoryRow(row, excludeId = null) {
  const productName = requireText(row?.product_name, 'Product');
  const effectiveDate = requireText(row?.effective_date, 'Effective date');
  const newPrice = requireNonNegativeNumber(row?.new_price, 'New price');
  const oldPrice = await resolvePriceBeforeOrOnDate(productName, effectiveDate, excludeId);
  return {
    product_name: productName,
    old_price: oldPrice,
    new_price: newPrice,
    effective_date: effectiveDate,
    changed_by: optionalText(row?.changed_by),
    remarks: optionalText(row?.remarks),
  };
}

async function syncProductCurrentPrice(productName) {
  if (!productName) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data: latestActivePrice, error: latestErr } = await supabase
    .from('price_history')
    .select('new_price')
    .eq('product_name', productName)
    .lte('effective_date', today)
    .order('effective_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw latestErr;
  if (latestActivePrice) {
    const { error: updErr } = await supabase.from('products').update({ current_price: Number(latestActivePrice.new_price || 0) }).eq('name', productName);
    if (updErr) throw updErr;
  }
}

async function loadEffectivePriceMap(productNames, targetDate) {
  const uniqueNames = [...new Set((productNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
  const priceMap = new Map();
  if (uniqueNames.length === 0) return priceMap;

  const { data: productRows, error: productErr } = await supabase
    .from('products')
    .select('name, current_price')
    .in('name', uniqueNames);
  if (productErr) throw productErr;

  const fallbackPriceByProduct = new Map((productRows || []).map((row) => [String(row.name || '').trim(), Number(row.current_price || 0)]));
  const { data: historyRows, error: historyErr } = await supabase
    .from('price_history')
    .select('id, product_name, old_price, new_price, effective_date')
    .in('product_name', uniqueNames)
    .order('product_name', { ascending: true })
    .order('effective_date', { ascending: true })
    .order('id', { ascending: true });
  if (historyErr) throw historyErr;

  const historyByProduct = new Map();
  for (const row of historyRows || []) {
    const productName = String(row.product_name || '').trim();
    if (!productName) continue;
    if (!historyByProduct.has(productName)) historyByProduct.set(productName, []);
    historyByProduct.get(productName).push(row);
  }

  for (const productName of uniqueNames) {
    const history = historyByProduct.get(productName) || [];
    const fallbackPrice = Number(fallbackPriceByProduct.get(productName) || 0);
    if (history.length === 0) {
      priceMap.set(productName, fallbackPrice);
      continue;
    }

    const firstRow = history[0];
    let resolvedPrice = Number(firstRow.old_price ?? fallbackPrice);
    if (!Number.isFinite(resolvedPrice)) resolvedPrice = fallbackPrice;

    for (const row of history) {
      if (String(row.effective_date || '') > targetDate) break;
      resolvedPrice = Number(row.new_price || 0);
    }

    priceMap.set(productName, resolvedPrice);
  }

  return priceMap;
}

function interpolateVolume(points, dipMM) {
  const d = Number(dipMM);
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(d)) return null;
  const sorted = [...points]
    .map((p) => ({ dip_mm: Number(p.dip_mm), volume_liters: Number(p.volume_liters) }))
    .filter((p) => Number.isFinite(p.dip_mm) && Number.isFinite(p.volume_liters))
    .sort((a, b) => a.dip_mm - b.dip_mm);
  if (sorted.length < 2) return null;
  if (d <= sorted[0].dip_mm) return sorted[0].volume_liters;
  if (d >= sorted[sorted.length - 1].dip_mm) return sorted[sorted.length - 1].volume_liters;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (d >= a.dip_mm && d <= b.dip_mm) {
      const frac = (d - a.dip_mm) / (b.dip_mm - a.dip_mm || 1);
      return a.volume_liters + frac * (b.volume_liters - a.volume_liters);
    }
  }
  return null;
}

async function loadCalibrationPointsByTankName(tankName) {
  const { data: tank, error: tankErr } = await supabase.from('tanks').select('id, name, product_name').eq('name', tankName).single();
  if (tankErr) throw tankErr;
  if (!tank) throw new Error(`Tank not found: ${tankName}`);
  const { data: points, error } = await supabase.from('tank_calibration').select('dip_mm, volume_liters').eq('tank_id', tank.id).order('dip_mm', { ascending: true });
  if (error) throw error;
  return { tank, points: points || [] };
}

async function normalizeTankerUnloadingCompartments(compartments) {
  const list = Array.isArray(compartments) ? compartments : [];
  if (list.length === 0) throw new Error('At least one compartment is required');
  const normalizedLines = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    const label = `Compartment ${i + 1}: `;
    const productName = requireText(c.product_name, `${label}Product`);
    const tankName = requireText(c.tank_name, `${label}Tank`);
    const tankerQty = requireNonNegativeNumber(c.tanker_qty, `${label}Tanker qty`);
    const dipBefore = requireNonNegativeNumber(c.dip_before_mm, `${label}Dip before (mm)`);
    const dipAfter = requireNonNegativeNumber(c.dip_after_mm, `${label}Dip after (mm)`);
    const { tank, points } = await loadCalibrationPointsByTankName(tankName);
    if (tank.product_name && tank.product_name !== productName) {
      throw new Error(`${label}Selected tank does not match the chosen product`);
    }
    const volBefore = interpolateVolume(points, dipBefore);
    const volAfter = interpolateVolume(points, dipAfter);
    if (volBefore == null || volAfter == null) {
      throw new Error(`${label}No calibration data available to compute volume for the selected tank`);
    }
    const received = Number(volAfter) - Number(volBefore);
    const variance = received - tankerQty;
    normalizedLines.push({
      product_name: productName,
      tank_name: tankName,
      tanker_qty: tankerQty,
      dip_before_mm: dipBefore,
      dip_after_mm: dipAfter,
      volume_before_liters: volBefore,
      volume_after_liters: volAfter,
      received_volume: received,
      variance,
    });
  }
  return normalizedLines;
}

async function handleTankerUnloadingCreateV2(req, res) {
  const body = req.body || {};
  const unloadDate = requireText(body.unload_date, 'Unload date');
  const tankerNumber = requireText(body.tanker_number, 'Tanker number');
  const supplierName = optionalText(body.supplier_name);
  const waybillNo = optionalText(body.waybill_no);
  const invoiceNo = optionalText(body.invoice_no);
  const temperature = optionalNumber(body.temperature, 'Temperature');
  const normalizedLines = await normalizeTankerUnloadingCompartments(body.compartments);

  const { data: header, error: headerErr } = await supabase
    .from('tanker_unloading_headers')
    .insert([{ unload_date: unloadDate, tanker_number: tankerNumber, supplier_name: supplierName, waybill_no: waybillNo, invoice_no: invoiceNo, temperature }])
    .select()
    .single();
  if (headerErr) throw headerErr;

  const linesToInsert = normalizedLines.map((l) => ({ header_id: header.id, ...l }));
  const { data: insertedLines, error: linesErr } = await supabase.from('tanker_unloading_lines').insert(linesToInsert).select();
  if (linesErr) {
    await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);
    throw linesErr;
  }

  try {
    for (const line of normalizedLines) {
      const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', line.tank_name).single();
      if (tErr) throw tErr;
      const nextVol = Number(tankRow.current_volume || 0) + Number(line.received_volume || 0);
      const { error: updErr } = await supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tankRow.id);
      if (updErr) throw updErr;
    }
  } catch (volErr) {
    await supabase.from('tanker_unloading_lines').delete().eq('header_id', header.id);
    await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);
    throw new Error(`Tank volume update failed, unloading entry rolled back: ${volErr.message}`);
  }

  return res.status(201).json({ header, lines: insertedLines || [] });
}

async function handleTankerUnloadingUpdateV2(req, res) {
  const body = req.body || {};
  const headerId = Number(body.id);
  if (!headerId) return res.status(400).json({ error: 'Unloading ID is required' });

  const { data: existingHeader, error: existingHeaderErr } = await supabase
    .from('tanker_unloading_headers')
    .select('id, unload_date, tanker_number, supplier_name, waybill_no, invoice_no, temperature, tanker_unloading_lines ( id, product_name, tank_name, tanker_qty, dip_before_mm, dip_after_mm, volume_before_liters, volume_after_liters, received_volume, variance )')
    .eq('id', headerId)
    .single();
  if (existingHeaderErr) throw existingHeaderErr;

  const unloadDate = requireText(body.unload_date, 'Unload date');
  const tankerNumber = requireText(body.tanker_number, 'Tanker number');
  const supplierName = optionalText(body.supplier_name);
  const waybillNo = optionalText(body.waybill_no);
  const invoiceNo = optionalText(body.invoice_no);
  const temperature = optionalNumber(body.temperature, 'Temperature');
  const normalizedLines = await normalizeTankerUnloadingCompartments(body.compartments);

  const oldTankVolumes = sumByKey(existingHeader.tanker_unloading_lines || [], 'tank_name', 'received_volume');
  const newTankVolumes = sumByKey(normalizedLines, 'tank_name', 'received_volume');

  const { error: headerErr } = await supabase
    .from('tanker_unloading_headers')
    .update({ unload_date: unloadDate, tanker_number: tankerNumber, supplier_name: supplierName, waybill_no: waybillNo, invoice_no: invoiceNo, temperature })
    .eq('id', headerId);
  if (headerErr) throw headerErr;

  const { error: delErr } = await supabase.from('tanker_unloading_lines').delete().eq('header_id', headerId);
  if (delErr) throw delErr;
  const { data: insertedLines, error: insErr } = await supabase
    .from('tanker_unloading_lines')
    .insert(normalizedLines.map((line) => ({ header_id: headerId, ...line })))
    .select();
  if (insErr) throw insErr;

  for (const tankName of oldTankVolumes.keys()) {
    await adjustTankCurrentVolumeForSalesDelta(tankName, existingHeader.unload_date, -Number(oldTankVolumes.get(tankName) || 0));
  }
  for (const tankName of newTankVolumes.keys()) {
    await adjustTankCurrentVolumeForSalesDelta(tankName, unloadDate, Number(newTankVolumes.get(tankName) || 0));
  }

  return res.status(200).json({ id: headerId, lines: insertedLines || [] });
}

async function handleTankerUnloadingDeleteV2(req, res) {
  const body = req.body || {};
  const headerId = Number(body.id);
  if (!headerId) return res.status(400).json({ error: 'Unloading ID is required' });

  const { data: existingHeader, error: existingHeaderErr } = await supabase
    .from('tanker_unloading_headers')
    .select('id, unload_date, tanker_unloading_lines ( id, tank_name, received_volume )')
    .eq('id', headerId)
    .single();
  if (existingHeaderErr) throw existingHeaderErr;

  const oldTankVolumes = sumByKey(existingHeader.tanker_unloading_lines || [], 'tank_name', 'received_volume');
  const { error: delLinesErr } = await supabase.from('tanker_unloading_lines').delete().eq('header_id', headerId);
  if (delLinesErr) throw delLinesErr;
  const { error: delHeaderErr } = await supabase.from('tanker_unloading_headers').delete().eq('id', headerId);
  if (delHeaderErr) throw delHeaderErr;

  for (const [tankName, volume] of oldTankVolumes.entries()) {
    await adjustTankCurrentVolumeForSalesDelta(tankName, existingHeader.unload_date, -Number(volume || 0));
  }

  return res.status(200).json({ ok: true });
}

async function handleDailySalesList(req, res) {
  const { data, error } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, shift_name, operator_name, dispenser_name, cash_amount, online_amount, credit_amount, total_submitted, total_sales_amount, variance, status, created_at, daily_sales_nozzle_readings ( id, nozzle_name, dispenser_name, tank_name, product_name, opening_reading, closing_reading, volume, unit_price, amount ), daily_sales_testing ( id, nozzle_name, tank_name, product_name, volume, unit_price, amount, remarks )')
    .order('id', { ascending: false });
  if (error) throw error;
  return res.status(200).json(data || []);
}

async function handleDailySalesCreate(req, res) {
  const entryId = await createDailySalesEntry(req.body || {});
  return res.status(201).json({ entry_id: entryId });
}

async function handleDailySalesUpdate(req, res) {
  const body = req.body || {};
  const entryId = Number(body.id);
  if (!entryId) return res.status(400).json({ error: 'Sales entry ID is required' });
  const updatedId = await updateDailySalesEntry(entryId, body);
  return res.status(200).json({ entry_id: updatedId });
}

async function handleDailySalesDelete(req, res) {
  const body = req.body || {};
  const entryId = Number(body.id);
  if (!entryId) return res.status(400).json({ error: 'Sales entry ID is required' });
  await deleteDailySalesEntry(entryId);
  return res.status(200).json({ ok: true });
}

async function loadDailySalesEntryById(entryId) {
  const { data, error } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, shift_name, operator_name, dispenser_name, cash_amount, online_amount, credit_amount, total_submitted, total_sales_amount, variance, status, daily_sales_nozzle_readings ( id, nozzle_name, dispenser_name, tank_name, product_name, opening_reading, closing_reading, volume, unit_price, amount ), daily_sales_testing ( id, nozzle_name, tank_name, product_name, volume, unit_price, amount, remarks )')
    .eq('id', entryId)
    .single();
  if (error) throw error;
  return data;
}

function isLaterSalesEntry(a, b) {
  if (String(a.sale_date || '') > String(b.sale_date || '')) return true;
  if (String(a.sale_date || '') < String(b.sale_date || '')) return false;
  return Number(a.id || 0) > Number(b.id || 0);
}

async function ensureDailySalesEntryMutable(entry) {
  const { data: dispenserEntries, error } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, dispenser_name')
    .eq('dispenser_name', entry.dispenser_name);
  if (error) throw error;
  const later = (dispenserEntries || []).find((row) => Number(row.id || 0) !== Number(entry.id || 0) && isLaterSalesEntry(row, entry));
  if (later) {
    throw new Error(`This sales entry cannot be changed because a later sales entry already exists for dispenser ${entry.dispenser_name}. Only the latest entry for each dispenser can be edited or deleted.`);
  }
}

async function syncMetersForNozzles(nozzleNames) {
  const uniqueNozzles = [...new Set((nozzleNames || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (uniqueNozzles.length === 0) return;
  const { data: meterRows, error: meterErr } = await supabase
    .from('meters')
    .select('id, nozzle_name, opening_reading, current_reading')
    .in('nozzle_name', uniqueNozzles);
  if (meterErr) throw meterErr;
  const meterMap = new Map((meterRows || []).map((m) => [m.nozzle_name, m]));
  const { data: entries, error: entryErr } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, daily_sales_nozzle_readings ( nozzle_name, closing_reading )')
    .order('sale_date', { ascending: false })
    .order('id', { ascending: false });
  if (entryErr) throw entryErr;

  for (const nozzleName of uniqueNozzles) {
    const meter = meterMap.get(nozzleName);
    if (!meter) continue;
    let resolvedReading = Number(meter.opening_reading || 0);
    for (const entry of entries || []) {
      const match = (entry.daily_sales_nozzle_readings || []).find((row) => row.nozzle_name === nozzleName);
      if (match) {
        resolvedReading = Number(match.closing_reading || 0);
        break;
      }
    }
    const { error: updErr } = await supabase.from('meters').update({ current_reading: resolvedReading }).eq('id', meter.id);
    if (updErr) throw updErr;
  }
}

async function hasClosingDipOnOrAfter(tankName, saleDate) {
  if (!tankName || !saleDate) return false;
  const { data, error } = await supabase
    .from('dip_readings')
    .select('id')
    .eq('tank_name', tankName)
    .eq('reading_type', 'closing')
    .gte('reading_date', saleDate)
    .order('reading_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function adjustTankCurrentVolumeForSalesDelta(tankName, saleDate, deltaVolume) {
  const delta = Number(deltaVolume || 0);
  if (!tankName || Math.abs(delta) < 0.000001) return;
  if (await hasClosingDipOnOrAfter(tankName, saleDate)) return;
  const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', tankName).single();
  if (tErr) throw tErr;
  const nextVol = Number(tankRow.current_volume || 0) + delta;
  if (nextVol < -0.000001) {
    throw new Error(`Tank volume cannot go negative while correcting sales for tank ${tankName}`);
  }
  const { error: updErr } = await supabase.from('tanks').update({ current_volume: Math.max(0, nextVol) }).eq('id', tankRow.id);
  if (updErr) throw updErr;
}

async function adjustBufferVolumeByProduct(productName, deltaVolume) {
  const delta = Number(deltaVolume || 0);
  if (!productName || Math.abs(delta) < 0.000001) return;
  const { data: existing, error: bErr } = await supabase
    .from('buffer_tanks')
    .select('id, volume')
    .eq('product_name', productName)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!existing) {
    if (delta < 0) {
      throw new Error(`Buffer stock is not available to reverse testing volume for product ${productName}`);
    }
    const { error: insErr } = await supabase.from('buffer_tanks').insert([{ product_name: productName, volume: delta }]);
    if (insErr) throw insErr;
    return;
  }
  const next = Number(existing.volume || 0) + delta;
  if (next < -0.000001) {
    throw new Error(`Buffer stock is not sufficient to reduce testing volume for product ${productName}`);
  }
  const { error: updErr } = await supabase
    .from('buffer_tanks')
    .update({ volume: Math.max(0, next), updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  if (updErr) throw updErr;
}

function sumByKey(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row?.[keyField] || '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + Number(row?.[valueField] || 0));
  }
  return map;
}

async function createDailySalesEntry(payload, opts = {}) {
  const body = payload || {};
  const saleDate = requireText(body.sale_date, 'Sale date');
  const shiftName = requireText(body.shift_name, 'Shift');
  const operatorName = requireText(body.operator_name, 'Operator');
  const dispenserName = requireText(body.dispenser_name, 'Dispenser');
  const cashAmount = optionalNumber(body.cash_amount, 'Cash amount') ?? 0;
  const onlineAmount = optionalNumber(body.online_amount, 'Online amount') ?? 0;
  const creditAmount = optionalNumber(body.credit_amount, 'Credit amount') ?? 0;
  const nozzleReadings = Array.isArray(body.nozzle_readings) ? body.nozzle_readings : [];
  const testingVolumes = Array.isArray(body.testing_volumes) ? body.testing_volumes : [];
  if (nozzleReadings.length === 0) throw new Error('At least one nozzle reading is required');

  const { data: dispenserRow, error: dispenserErr } = await supabase
    .from('dispensers')
    .select('name, status')
    .eq('name', dispenserName)
    .maybeSingle();
  if (dispenserErr) throw dispenserErr;
  if (!dispenserRow) throw new Error(`Dispenser not found: ${dispenserName}`);
  if (dispenserRow.status && !['Operational', 'Active'].includes(String(dispenserRow.status))) {
    throw new Error(`Dispenser is not available for sales entry: ${dispenserName}`);
  }

  const { data: operatorRow, error: operatorErr } = await supabase
    .from('operators')
    .select('name, active')
    .eq('name', operatorName)
    .maybeSingle();
  if (operatorErr) throw operatorErr;
  if (!operatorRow) throw new Error(`Operator not found: ${operatorName}`);
  if (operatorRow.active === false) throw new Error(`Operator is inactive: ${operatorName}`);

  const { data: shiftRow, error: shiftErr } = await supabase
    .from('shifts')
    .select('name')
    .eq('name', shiftName)
    .maybeSingle();
  if (shiftErr) throw shiftErr;
  if (!shiftRow) throw new Error(`Shift not found: ${shiftName}`);

  const { data: existingDispenserEntry, error: existingDispenserErr } = await supabase
    .from('daily_sales_entries')
    .select('id, operator_name')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('dispenser_name', dispenserName)
    .maybeSingle();
  if (existingDispenserErr) throw existingDispenserErr;
  if (existingDispenserEntry) {
    throw new Error(`Sales entry already exists for ${saleDate}, ${shiftName}, dispenser ${dispenserName}`);
  }

  const { data: existingOperatorEntry, error: existingOperatorErr } = await supabase
    .from('daily_sales_entries')
    .select('id, dispenser_name')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('operator_name', operatorName)
    .maybeSingle();
  if (existingOperatorErr) throw existingOperatorErr;
  if (existingOperatorEntry) {
    throw new Error(`Operator ${operatorName} is already assigned to dispenser ${existingOperatorEntry.dispenser_name || 'another dispenser'} for ${shiftName} on ${saleDate}`);
  }

  const nozzleNames = nozzleReadings.map((r) => String(r?.nozzle_name ?? '').trim()).filter(Boolean);
  if (new Set(nozzleNames).size !== nozzleNames.length) {
    throw new Error('Each nozzle can be entered only once in a sales entry');
  }

  const { data: nozzleRows, error: nozErr } = await supabase
    .from('nozzles')
    .select('name, dispenser_name, tank_name, product_name, status')
    .eq('dispenser_name', dispenserName);
  if (nozErr) throw nozErr;
  const nozzleMap = new Map((nozzleRows || []).map((n) => [n.name, n]));
  const activeNozzles = (nozzleRows || []).filter((n) => n.status === 'Active' || n.status == null);
  if (activeNozzles.length === 0) {
    throw new Error(`No active nozzles found for dispenser ${dispenserName}`);
  }

  const activeNozzleNames = activeNozzles.map((n) => n.name);
  if (!opts.skipCoverageCheck) {
    const missingNozzles = activeNozzleNames.filter((name) => !nozzleNames.includes(name));
    if (missingNozzles.length > 0) {
      throw new Error(`Enter closing reading for all active nozzles of ${dispenserName}: ${missingNozzles.join(', ')}`);
    }
  }
  const invalidNozzles = nozzleNames.filter((name) => !activeNozzleNames.includes(name));
  if (invalidNozzles.length > 0) {
    throw new Error(`Only active nozzles of dispenser ${dispenserName} can be entered: ${invalidNozzles.join(', ')}`);
  }

  const { data: meterRows, error: mErr } = await supabase
    .from('meters')
    .select('id, nozzle_name, current_reading')
    .in('nozzle_name', activeNozzleNames);
  if (mErr) throw mErr;
  const meterMap = new Map((meterRows || []).map((m) => [m.nozzle_name, m]));

  const productNames = [...new Set((nozzleRows || []).map((n) => String(n.product_name || '').trim()).filter(Boolean))];
  const priceMap = await loadEffectivePriceMap(productNames, saleDate);

  const normalizedReadings = [];
  let grossSalesAmount = 0;
  for (let i = 0; i < nozzleReadings.length; i++) {
    const r = nozzleReadings[i] || {};
    const label = `Nozzle row ${i + 1}: `;
    const nozzleName = requireText(r.nozzle_name, `${label}Nozzle`);
    const closing = requireNonNegativeNumber(r.closing_reading, `${label}Closing reading`);
    const nozzle = nozzleMap.get(nozzleName);
    if (!nozzle) throw new Error(`${label}Nozzle not found: ${nozzleName}`);
    const meter = meterMap.get(nozzleName);
    if (!meter) throw new Error(`${label}Meter not found for nozzle: ${nozzleName}`);
    const opening = Number(meter.current_reading || 0);
    if (closing < opening) throw new Error(`${label}Closing reading must be >= opening reading`);
    const volume = closing - opening;
    const unitPrice = Number(priceMap.get(nozzle.product_name) ?? 0);
    const amount = volume * unitPrice;
    grossSalesAmount += amount;
    normalizedReadings.push({
      nozzle_name: nozzleName,
      dispenser_name: dispenserName,
      tank_name: nozzle.tank_name || null,
      product_name: nozzle.product_name,
      opening_reading: opening,
      closing_reading: closing,
      volume,
      unit_price: unitPrice,
      amount,
    });
  }

  const normalizedTesting = [];
  let testingDeduction = 0;
  for (let i = 0; i < testingVolumes.length; i++) {
    const t = testingVolumes[i] || {};
    const label = `Testing row ${i + 1}: `;
    const nozzleName = requireText(t.nozzle_name, `${label}Nozzle`);
    const volume = requireNonNegativeNumber(t.volume, `${label}Volume`);
    const remarks = optionalText(t.remarks);
    const noz = nozzleMap.get(nozzleName);
    if (!noz || noz.dispenser_name !== dispenserName) {
      throw new Error(`${label}Nozzle does not belong to dispenser ${dispenserName}: ${nozzleName}`);
    }
    const resolvedProduct = noz.product_name;
    const resolvedTank = noz.tank_name || null;
    const price = Number(priceMap.get(resolvedProduct) ?? 0);
    const amount = volume * price;
    testingDeduction += amount;
    normalizedTesting.push({
      nozzle_name: nozzleName,
      tank_name: resolvedTank,
      product_name: resolvedProduct,
      volume,
      unit_price: price,
      amount,
      remarks,
    });
  }

  const totalSalesAmount = grossSalesAmount - testingDeduction;
  const totalSubmitted = Number(cashAmount) + Number(onlineAmount) + Number(creditAmount);
  const variance = totalSubmitted - totalSalesAmount;

  const { data: entry, error: eErr } = await supabase
    .from('daily_sales_entries')
    .insert([{
      sale_date: saleDate,
      shift_name: shiftName,
      operator_name: operatorName,
      dispenser_name: dispenserName,
      cash_amount: cashAmount,
      online_amount: onlineAmount,
      credit_amount: creditAmount,
      total_submitted: totalSubmitted,
      total_sales_amount: totalSalesAmount,
      variance,
      status: 'submitted',
    }])
    .select()
    .single();
  if (eErr) throw eErr;

  const { error: rInsErr } = await supabase
    .from('daily_sales_nozzle_readings')
    .insert(normalizedReadings.map((r) => ({ sales_entry_id: entry.id, ...r })));
  if (rInsErr) {
    await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
    throw rInsErr;
  }

  if (normalizedTesting.length > 0) {
    const { error: tInsErr } = await supabase
      .from('daily_sales_testing')
      .insert(normalizedTesting.map((t) => ({ sales_entry_id: entry.id, ...t })));
    if (tInsErr) {
      await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
      throw tInsErr;
    }
  }

  try {
    for (const r of normalizedReadings) {
      const meter = meterMap.get(r.nozzle_name);
      const { error: updMeterErr } = await supabase.from('meters').update({ current_reading: r.closing_reading }).eq('id', meter.id);
      if (updMeterErr) throw updMeterErr;
      if (r.tank_name) {
        const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', r.tank_name).single();
        if (tErr) throw tErr;
        const nextVol = Math.max(0, Number(tankRow.current_volume || 0) - Number(r.volume || 0));
        const { error: updTankErr } = await supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tankRow.id);
        if (updTankErr) throw updTankErr;
      }
    }

    for (const t of normalizedTesting) {
      const { data: existing, error: bErr } = await supabase.from('buffer_tanks').select('id, volume').eq('product_name', t.product_name).maybeSingle();
      if (bErr) throw bErr;
      if (!existing) {
        const { error: insErr } = await supabase.from('buffer_tanks').insert([{ product_name: t.product_name, volume: Number(t.volume || 0) }]);
        if (insErr) throw insErr;
      } else {
        const next = Number(existing.volume || 0) + Number(t.volume || 0);
        const { error: updErr } = await supabase.from('buffer_tanks').update({ volume: next, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (updErr) throw updErr;
      }
    }
  } catch (updateErr) {
    await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', entry.id);
    await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entry.id);
    await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
    throw new Error(`Meter/tank/buffer update failed, sales entry rolled back: ${updateErr.message}`);
  }

  return entry.id;
}

async function updateDailySalesEntry(entryId, payload) {
  const existing = await loadDailySalesEntryById(entryId);
  await ensureDailySalesEntryMutable(existing);

  const body = payload || {};
  const saleDate = existing.sale_date;
  const dispenserName = existing.dispenser_name;
  const shiftName = requireText(body.shift_name ?? existing.shift_name, 'Shift');
  const operatorName = requireText(body.operator_name ?? existing.operator_name, 'Operator');
  const cashAmount = optionalNumber(body.cash_amount, 'Cash amount') ?? 0;
  const onlineAmount = optionalNumber(body.online_amount, 'Online amount') ?? 0;
  const creditAmount = optionalNumber(body.credit_amount, 'Credit amount') ?? 0;
  const nozzleReadings = Array.isArray(body.nozzle_readings) ? body.nozzle_readings : [];
  const testingVolumes = Array.isArray(body.testing_volumes) ? body.testing_volumes : [];
  if (nozzleReadings.length === 0) throw new Error('At least one nozzle reading is required');

  if ((body.sale_date && String(body.sale_date) !== String(existing.sale_date)) || (body.dispenser_name && String(body.dispenser_name) !== String(existing.dispenser_name))) {
    throw new Error('For safety, date and dispenser cannot be changed after a sales entry is created. Delete and recreate the entry if those values were entered incorrectly.');
  }

  const { data: operatorRow, error: operatorErr } = await supabase
    .from('operators')
    .select('name, active')
    .eq('name', operatorName)
    .maybeSingle();
  if (operatorErr) throw operatorErr;
  if (!operatorRow) throw new Error(`Operator not found: ${operatorName}`);
  if (operatorRow.active === false) throw new Error(`Operator is inactive: ${operatorName}`);

  const { data: shiftRow, error: shiftErr } = await supabase
    .from('shifts')
    .select('name')
    .eq('name', shiftName)
    .maybeSingle();
  if (shiftErr) throw shiftErr;
  if (!shiftRow) throw new Error(`Shift not found: ${shiftName}`);

  const { data: existingDispenserEntry, error: existingDispenserErr } = await supabase
    .from('daily_sales_entries')
    .select('id')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('dispenser_name', dispenserName)
    .neq('id', entryId)
    .maybeSingle();
  if (existingDispenserErr) throw existingDispenserErr;
  if (existingDispenserEntry) {
    throw new Error(`Sales entry already exists for ${saleDate}, ${shiftName}, dispenser ${dispenserName}`);
  }

  const { data: existingOperatorEntry, error: existingOperatorErr } = await supabase
    .from('daily_sales_entries')
    .select('id, dispenser_name')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('operator_name', operatorName)
    .neq('id', entryId)
    .maybeSingle();
  if (existingOperatorErr) throw existingOperatorErr;
  if (existingOperatorEntry) {
    throw new Error(`Operator ${operatorName} is already assigned to dispenser ${existingOperatorEntry.dispenser_name || 'another dispenser'} for ${shiftName} on ${saleDate}`);
  }

  const openingByNozzle = new Map((existing.daily_sales_nozzle_readings || []).map((row) => [row.nozzle_name, Number(row.opening_reading || 0)]));
  const oldReadingsByNozzle = new Map((existing.daily_sales_nozzle_readings || []).map((row) => [row.nozzle_name, row]));
  const nozzleNames = nozzleReadings.map((r) => String(r?.nozzle_name ?? '').trim()).filter(Boolean);
  const expectedNozzleNames = [...openingByNozzle.keys()];
  if (new Set(nozzleNames).size !== nozzleNames.length) {
    throw new Error('Each nozzle can be entered only once in a sales entry');
  }
  const missingNozzles = expectedNozzleNames.filter((name) => !nozzleNames.includes(name));
  if (missingNozzles.length > 0) {
    throw new Error(`Enter closing reading for all existing nozzles of ${dispenserName}: ${missingNozzles.join(', ')}`);
  }
  const invalidNozzles = nozzleNames.filter((name) => !openingByNozzle.has(name));
  if (invalidNozzles.length > 0) {
    throw new Error(`Only the original dispenser nozzles can be corrected for this entry: ${invalidNozzles.join(', ')}`);
  }

  const { data: nozzleRows, error: nozErr } = await supabase
    .from('nozzles')
    .select('name, dispenser_name, tank_name, product_name, status')
    .eq('dispenser_name', dispenserName);
  if (nozErr) throw nozErr;
  const nozzleMap = new Map((nozzleRows || []).map((n) => [n.name, n]));

  const productNames = [...new Set((nozzleRows || []).map((n) => String(n.product_name || '').trim()).filter(Boolean))];
  const priceMap = await loadEffectivePriceMap(productNames, saleDate);

  const normalizedReadings = [];
  let grossSalesAmount = 0;
  for (let i = 0; i < nozzleReadings.length; i++) {
    const r = nozzleReadings[i] || {};
    const label = `Nozzle row ${i + 1}: `;
    const nozzleName = requireText(r.nozzle_name, `${label}Nozzle`);
    const closing = requireNonNegativeNumber(r.closing_reading, `${label}Closing reading`);
    const nozzle = nozzleMap.get(nozzleName);
    if (!nozzle) throw new Error(`${label}Nozzle not found: ${nozzleName}`);
    const opening = Number(openingByNozzle.get(nozzleName) || 0);
    if (closing < opening) throw new Error(`${label}Closing reading must be >= opening reading`);
    const volume = closing - opening;
    const unitPrice = Number(priceMap.get(nozzle.product_name) ?? 0);
    const amount = volume * unitPrice;
    grossSalesAmount += amount;
    normalizedReadings.push({
      nozzle_name: nozzleName,
      dispenser_name: dispenserName,
      tank_name: nozzle.tank_name || null,
      product_name: nozzle.product_name,
      opening_reading: opening,
      closing_reading: closing,
      volume,
      unit_price: unitPrice,
      amount,
    });
  }

  const normalizedTesting = [];
  let testingDeduction = 0;
  for (let i = 0; i < testingVolumes.length; i++) {
    const t = testingVolumes[i] || {};
    const label = `Testing row ${i + 1}: `;
    const nozzleName = requireText(t.nozzle_name, `${label}Nozzle`);
    const volume = requireNonNegativeNumber(t.volume, `${label}Volume`);
    const remarks = optionalText(t.remarks);
    if (!openingByNozzle.has(nozzleName)) {
      throw new Error(`${label}Only the original entry nozzles can be corrected: ${nozzleName}`);
    }
    const noz = nozzleMap.get(nozzleName);
    if (!noz || noz.dispenser_name !== dispenserName) {
      throw new Error(`${label}Nozzle does not belong to dispenser ${dispenserName}: ${nozzleName}`);
    }
    const relatedReading = normalizedReadings.find((row) => row.nozzle_name === nozzleName);
    if (!relatedReading) throw new Error(`${label}Matching nozzle reading is required`);
    if (volume > Number(relatedReading.volume || 0)) {
      throw new Error(`${label}Testing quantity cannot be greater than dispensed quantity`);
    }
    const resolvedProduct = noz.product_name;
    const resolvedTank = noz.tank_name || null;
    const price = Number(priceMap.get(resolvedProduct) ?? 0);
    const amount = volume * price;
    testingDeduction += amount;
    normalizedTesting.push({
      nozzle_name: nozzleName,
      tank_name: resolvedTank,
      product_name: resolvedProduct,
      volume,
      unit_price: price,
      amount,
      remarks,
    });
  }

  const totalSalesAmount = grossSalesAmount - testingDeduction;
  const totalSubmitted = Number(cashAmount) + Number(onlineAmount) + Number(creditAmount);
  const variance = totalSubmitted - totalSalesAmount;

  const oldTankVolumes = sumByKey(existing.daily_sales_nozzle_readings || [], 'tank_name', 'volume');
  const newTankVolumes = sumByKey(normalizedReadings, 'tank_name', 'volume');
  const oldTestingByProduct = sumByKey(existing.daily_sales_testing || [], 'product_name', 'volume');
  const newTestingByProduct = sumByKey(normalizedTesting, 'product_name', 'volume');
  for (const productName of new Set([...oldTestingByProduct.keys(), ...newTestingByProduct.keys()])) {
    const delta = Number(newTestingByProduct.get(productName) || 0) - Number(oldTestingByProduct.get(productName) || 0);
    if (delta < 0) {
      await adjustBufferVolumeByProduct(productName, 0);
      const { data: bufferRow, error: bufferErr } = await supabase.from('buffer_tanks').select('volume').eq('product_name', productName).maybeSingle();
      if (bufferErr) throw bufferErr;
      if (Number(bufferRow?.volume || 0) + delta < -0.000001) {
        throw new Error(`Buffer stock is not sufficient to reduce testing volume for product ${productName}`);
      }
    }
  }

  const { error: headerErr } = await supabase
    .from('daily_sales_entries')
    .update({
      shift_name: shiftName,
      operator_name: operatorName,
      cash_amount: cashAmount,
      online_amount: onlineAmount,
      credit_amount: creditAmount,
      total_submitted: totalSubmitted,
      total_sales_amount: totalSalesAmount,
      variance,
    })
    .eq('id', entryId);
  if (headerErr) throw headerErr;

  const { error: delTestingErr } = await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', entryId);
  if (delTestingErr) throw delTestingErr;
  const { error: delReadErr } = await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entryId);
  if (delReadErr) throw delReadErr;
  const { error: insReadErr } = await supabase
    .from('daily_sales_nozzle_readings')
    .insert(normalizedReadings.map((row) => ({ sales_entry_id: entryId, ...row })));
  if (insReadErr) throw insReadErr;
  if (normalizedTesting.length > 0) {
    const { error: insTestErr } = await supabase
      .from('daily_sales_testing')
      .insert(normalizedTesting.map((row) => ({ sales_entry_id: entryId, ...row })));
    if (insTestErr) throw insTestErr;
  }

  for (const tankName of new Set([...oldTankVolumes.keys(), ...newTankVolumes.keys()])) {
    const delta = Number(oldTankVolumes.get(tankName) || 0) - Number(newTankVolumes.get(tankName) || 0);
    await adjustTankCurrentVolumeForSalesDelta(tankName, saleDate, delta);
  }
  for (const productName of new Set([...oldTestingByProduct.keys(), ...newTestingByProduct.keys()])) {
    const delta = Number(newTestingByProduct.get(productName) || 0) - Number(oldTestingByProduct.get(productName) || 0);
    await adjustBufferVolumeByProduct(productName, delta);
  }
  await syncMetersForNozzles((existing.daily_sales_nozzle_readings || []).map((row) => row.nozzle_name));

  return entryId;
}

async function deleteDailySalesEntry(entryId) {
  const existing = await loadDailySalesEntryById(entryId);
  await ensureDailySalesEntryMutable(existing);

  const oldTankVolumes = sumByKey(existing.daily_sales_nozzle_readings || [], 'tank_name', 'volume');
  const oldTestingByProduct = sumByKey(existing.daily_sales_testing || [], 'product_name', 'volume');
  for (const [productName, volume] of oldTestingByProduct.entries()) {
    const { data: bufferRow, error: bufferErr } = await supabase.from('buffer_tanks').select('volume').eq('product_name', productName).maybeSingle();
    if (bufferErr) throw bufferErr;
    if (Number(bufferRow?.volume || 0) - Number(volume || 0) < -0.000001) {
      throw new Error(`Buffer stock is not sufficient to delete this entry because testing volume has already been used for product ${productName}`);
    }
  }

  const { error: delTestingErr } = await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', entryId);
  if (delTestingErr) throw delTestingErr;
  const { error: delReadErr } = await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entryId);
  if (delReadErr) throw delReadErr;
  const { error: delEntryErr } = await supabase.from('daily_sales_entries').delete().eq('id', entryId);
  if (delEntryErr) throw delEntryErr;

  for (const [tankName, volume] of oldTankVolumes.entries()) {
    await adjustTankCurrentVolumeForSalesDelta(tankName, existing.sale_date, Number(volume || 0));
  }
  for (const [productName, volume] of oldTestingByProduct.entries()) {
    await adjustBufferVolumeByProduct(productName, -Number(volume || 0));
  }
  await syncMetersForNozzles((existing.daily_sales_nozzle_readings || []).map((row) => row.nozzle_name));
}

async function handleDailySalesImport(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });
  const groups = new Map();
  for (const row of rows) {
    const saleDate = requireText(row.sale_date ?? row.date, 'Sale date');
    const shiftName = requireText(row.shift_name, 'Shift');
    const operatorName = requireText(row.operator_name, 'Operator');
    const dispenserName = requireText(row.dispenser_name, 'Dispenser');
    const key = `${saleDate}||${shiftName}||${operatorName}||${dispenserName}`;
    if (!groups.has(key)) {
      groups.set(key, { sale_date: saleDate, shift_name: shiftName, operator_name: operatorName, dispenser_name: dispenserName, cash_amount: null, online_amount: null, credit_amount: null, nozzle_readings: [], testing_volumes: [] });
    }
    const g = groups.get(key);
    const nozzleName = requireText(row.nozzle_name, 'Nozzle');
    const closing = requireNonNegativeNumber(row.closing_reading, 'Closing reading');
    g.nozzle_readings.push({ nozzle_name: nozzleName, closing_reading: closing });
    if (row.testing_volume != null && row.testing_volume !== '') {
      const tv = Number(row.testing_volume);
      if (Number.isFinite(tv) && tv > 0) {
        g.testing_volumes.push({ nozzle_name: nozzleName, volume: tv, remarks: optionalText(row.testing_remarks) });
      }
    }
    if (row.cash_amount != null && row.cash_amount !== '' && g.cash_amount == null) g.cash_amount = Number(row.cash_amount) || 0;
    if (row.online_amount != null && row.online_amount !== '' && g.online_amount == null) g.online_amount = Number(row.online_amount) || 0;
    if (row.credit_amount != null && row.credit_amount !== '' && g.credit_amount == null) g.credit_amount = Number(row.credit_amount) || 0;
  }
  let ok = 0;
  let fail = 0;
  const results = [];
  for (const g of groups.values()) {
    try {
      if (g.cash_amount == null) g.cash_amount = 0;
      if (g.online_amount == null) g.online_amount = 0;
      if (g.credit_amount == null) g.credit_amount = 0;
      const entryId = await createDailySalesEntry(g, { skipCoverageCheck: true });
      ok++;
      results.push({ entry_id: entryId, sale_date: g.sale_date, shift_name: g.shift_name, operator_name: g.operator_name, dispenser_name: g.dispenser_name });
    } catch (e) {
      fail++;
      results.push({ error: String(e?.message || e), sale_date: g.sale_date, shift_name: g.shift_name, operator_name: g.operator_name, dispenser_name: g.dispenser_name });
    }
  }
  if (ok === 0 && groups.size > 0) {
    return res.status(400).json({ groups: groups.size, ok, fail, results, message: 'All groups failed. No data was saved.' });
  }
  return res.status(200).json({ groups: groups.size, ok, fail, results });
}

async function handleDipReadingCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  let ok = 0;
  let fail = 0;
  const results = [];
  for (const row of rows) {
    try {
      const data = await createDipReading(row || {});
      ok++;
      results.push({ id: data.id });
    } catch (e) {
      fail++;
      results.push({ error: String(e?.message || e) });
    }
  }
  const status = ok === 0 && rows.length > 0 ? 400 : 201;
  return res.status(status).json({ ok, fail, results });
}

async function syncTankCurrentVolumeToLatestClosing(tankName) {
  if (!tankName) return;
  const { data: latestClosing, error: closeErr } = await supabase
    .from('dip_readings')
    .select('volume_liters')
    .eq('tank_name', tankName)
    .eq('reading_type', 'closing')
    .order('reading_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (closeErr) throw closeErr;
  if (!latestClosing) return;
  const { error: updErr } = await supabase.from('tanks').update({ current_volume: Number(latestClosing.volume_liters || 0) }).eq('name', tankName);
  if (updErr) throw updErr;
}

async function handleDipReadingUpdate(req, res) {
  const body = req.body || {};
  const id = Number(body.id);
  if (!id) return res.status(400).json({ error: 'Dip reading ID is required' });

  const { data: existing, error: existingErr } = await supabase.from('dip_readings').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;

  const readingDate = requireText(body.reading_date ?? existing.reading_date, 'Reading date');
  const tankName = requireText(body.tank_name ?? existing.tank_name, 'Tank');
  const dipMM = requireNonNegativeNumber(body.dip_mm, 'Dip (mm)');
  const readingType = requireText(body.reading_type ?? existing.reading_type, 'Reading type');
  if (!['opening', 'closing', 'intermediate'].includes(readingType)) {
    throw new Error(`Reading type must be one of: opening, closing, intermediate`);
  }
  const { tank, points } = await loadCalibrationPointsByTankName(tankName);
  const vol = interpolateVolume(points, dipMM);
  if (vol == null) throw new Error('No calibration data available for this tank');

  const { data: conflict, error: conflictErr } = await supabase
    .from('dip_readings')
    .select('id')
    .eq('reading_date', readingDate)
    .eq('tank_name', tank.name)
    .eq('reading_type', readingType)
    .neq('id', id)
    .maybeSingle();
  if (conflictErr) throw conflictErr;
  if (conflict) {
    throw new Error(`A ${readingType} dip already exists for ${tank.name} on ${readingDate}`);
  }

  if (existing.reading_type === 'closing' && existing.tank_name !== tank.name) {
    const { data: oldAlternate, error: altErr } = await supabase
      .from('dip_readings')
      .select('id')
      .eq('tank_name', existing.tank_name)
      .eq('reading_type', 'closing')
      .neq('id', id)
      .limit(1)
      .maybeSingle();
    if (altErr) throw altErr;
    if (!oldAlternate) {
      throw new Error(`This closing dip cannot be moved to another tank because ${existing.tank_name} would be left without any closing reference. Delete is allowed only after another closing dip exists for that tank.`);
    }
  }

  const { data, error } = await supabase
    .from('dip_readings')
    .update({ reading_date: readingDate, tank_name: tank.name, dip_mm: dipMM, volume_liters: vol, reading_type: readingType })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  if (existing.reading_type === 'closing') await syncTankCurrentVolumeToLatestClosing(existing.tank_name);
  if (readingType === 'closing') await syncTankCurrentVolumeToLatestClosing(tank.name);

  return res.status(200).json(data);
}

async function handleDipReadingDelete(req, res) {
  const body = req.body || {};
  const id = Number(body.id);
  if (!id) return res.status(400).json({ error: 'Dip reading ID is required' });

  const { data: existing, error: existingErr } = await supabase.from('dip_readings').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;

  if (existing.reading_type === 'closing') {
    const { data: alternate, error: altErr } = await supabase
      .from('dip_readings')
      .select('id')
      .eq('tank_name', existing.tank_name)
      .eq('reading_type', 'closing')
      .neq('id', id)
      .limit(1)
      .maybeSingle();
    if (altErr) throw altErr;
    if (!alternate) {
      throw new Error(`This closing dip cannot be deleted because it is the only closing reference for tank ${existing.tank_name}. Edit the dip value instead, or create another closing dip first.`);
    }
  }

  const { error } = await supabase.from('dip_readings').delete().eq('id', id);
  if (error) throw error;
  if (existing.reading_type === 'closing') await syncTankCurrentVolumeToLatestClosing(existing.tank_name);

  return res.status(200).json({ ok: true });
}

async function createDipReading(payload) {
  const body = payload || {};
  const readingDate = requireText(body.reading_date, 'Reading date');
  const tankName = requireText(body.tank_name, 'Tank');
  const dipMM = requireNonNegativeNumber(body.dip_mm, 'Dip (mm)');
  const readingType = requireText(body.reading_type, 'Reading type');
  if (!['opening', 'closing', 'intermediate'].includes(readingType)) {
    throw new Error(`Reading type must be one of: opening, closing, intermediate`);
  }

  const { tank, points } = await loadCalibrationPointsByTankName(tankName);
  const vol = interpolateVolume(points, dipMM);
  if (vol == null) throw new Error('No calibration data available for this tank');

  const { data: existing, error: existingErr } = await supabase
    .from('dip_readings')
    .select('id')
    .eq('reading_date', readingDate)
    .eq('tank_name', tank.name)
    .eq('reading_type', readingType)
    .maybeSingle();
  if (existingErr) throw existingErr;

  let data;
  if (existing?.id) {
    const result = await supabase
      .from('dip_readings')
      .update({ dip_mm: dipMM, volume_liters: vol })
      .eq('id', existing.id)
      .select()
      .single();
    if (result.error) throw result.error;
    data = result.data;
  } else {
    const result = await supabase
      .from('dip_readings')
      .insert([{ reading_date: readingDate, tank_name: tank.name, dip_mm: dipMM, volume_liters: vol, reading_type: readingType }])
      .select()
      .single();
    if (result.error) throw result.error;
    data = result.data;
  }

  // Physical stock is finalized only from day closing dip.
  if (readingType === 'closing') {
    const { error: updErr } = await supabase.from('tanks').update({ current_volume: vol }).eq('id', tank.id);
    if (updErr) throw updErr;
  }

  return data;
}

async function handleCalibrationImport(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

  const byTank = new Map();
  for (const row of rows) {
    const tankName = requireText(row.tank_name, 'Tank');
    const dipMM = requireNonNegativeNumber(row.dip_mm, 'Dip (mm)');
    const volume = requireNonNegativeNumber(row.volume_liters, 'Volume (L)');
    if (!byTank.has(tankName)) byTank.set(tankName, []);
    byTank.get(tankName).push({ dip_mm: dipMM, volume_liters: volume });
  }

  let ok = 0;
  let fail = 0;
  const results = [];
  for (const [tankName, points] of byTank.entries()) {
    try {
      const { data: tank, error: tErr } = await supabase.from('tanks').select('id, name, capacity').eq('name', tankName).single();
      if (tErr) throw tErr;
      validateChart(points, Number(tank.capacity));
      const { data: oldPoints, error: oldErr } = await supabase
        .from('tank_calibration')
        .select('dip_mm, volume_liters')
        .eq('tank_id', tank.id);
      if (oldErr) throw oldErr;
      await supabase.from('tank_calibration').delete().eq('tank_id', tank.id);
      const toInsert = points.map((p) => ({ tank_id: tank.id, dip_mm: p.dip_mm, volume_liters: p.volume_liters }));
      const { error: insErr } = await supabase.from('tank_calibration').insert(toInsert);
      if (insErr) {
        if (oldPoints && oldPoints.length > 0) {
          await supabase.from('tank_calibration').insert(oldPoints.map((p) => ({ tank_id: tank.id, dip_mm: p.dip_mm, volume_liters: p.volume_liters })));
        }
        throw insErr;
      }
      ok++;
      results.push({ tank_name: tank.name, points: points.length });
    } catch (e) {
      fail++;
      results.push({ tank_name: tankName, error: String(e?.message || e) });
    }
  }

  const calStatus = ok === 0 && byTank.size > 0 ? 400 : 200;
  return res.status(calStatus).json({ tanks: byTank.size, ok, fail, results });
}

async function handleBufferTransfer(req, res) {
  const body = req.body || {};
  const productName = requireText(body.product_name, 'Product');
  const tankName = requireText(body.tank_name, 'Tank');
  const volume = requireNonNegativeNumber(body.volume, 'Volume');

  const { data: buffer, error: bErr } = await supabase.from('buffer_tanks').select('id, volume').eq('product_name', productName).single();
  if (bErr) throw bErr;
  if (!buffer) return res.status(404).json({ error: 'Buffer not found for this product' });
  if (Number(buffer.volume || 0) < volume) return res.status(400).json({ error: 'Insufficient buffer volume' });

  const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume, product_name').eq('name', tankName).single();
  if (tErr) throw tErr;
  if (tankRow.product_name && tankRow.product_name !== productName) {
    return res.status(400).json({ error: 'Selected tank does not match the chosen product' });
  }

  const nextBuffer = Number(buffer.volume || 0) - volume;
  const { error: updBufErr } = await supabase.from('buffer_tanks').update({ volume: nextBuffer, updated_at: new Date().toISOString() }).eq('id', buffer.id);
  if (updBufErr) throw updBufErr;

  const nextTank = Number(tankRow.current_volume || 0) + volume;
  const { error: updTankErr } = await supabase.from('tanks').update({ current_volume: nextTank }).eq('id', tankRow.id);
  if (updTankErr) throw updTankErr;

  const { error: moveErr } = await supabase.from('stock_movements').insert([{
    movement_date: new Date().toISOString().slice(0, 10),
    movement_type: 'IN',
    tank_name: tankName,
    product_name: productName,
    volume,
    reason: 'Testing Transfer',
  }]);
  if (moveErr) throw moveErr;

  return res.status(200).json({ ok: true, buffer_volume: nextBuffer, tank_volume: nextTank });
}

async function handleTankerUnloadingImport(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

  const groups = new Map();
  for (const row of rows) {
    const unloadDate = requireText(row.unload_date, 'Unload date');
    const tankerNumber = requireText(row.tanker_number, 'Tanker number');
    const key = `${unloadDate}||${tankerNumber}`;
    if (!groups.has(key)) {
      groups.set(key, {
        unload_date: unloadDate,
        tanker_number: tankerNumber,
        supplier_name: null,
        waybill_no: null,
        invoice_no: null,
        temperature: null,
        compartments: [],
      });
    }
    const g = groups.get(key);
    if (g.supplier_name == null && row.supplier_name) g.supplier_name = String(row.supplier_name).trim();
    if (g.waybill_no == null && row.waybill_no) g.waybill_no = String(row.waybill_no).trim();
    if (g.invoice_no == null && row.invoice_no) g.invoice_no = String(row.invoice_no).trim();
    if (g.temperature == null && row.temperature != null && row.temperature !== '') {
      const t = Number(row.temperature);
      if (Number.isFinite(t)) g.temperature = t;
    }
    g.compartments.push({
      product_name: requireText(row.product_name, 'Product'),
      tank_name: requireText(row.tank_name, 'Tank'),
      tanker_qty: requireNonNegativeNumber(row.tanker_qty, 'Tanker qty'),
      dip_before_mm: requireNonNegativeNumber(row.dip_before_mm, 'Dip before (mm)'),
      dip_after_mm: requireNonNegativeNumber(row.dip_after_mm, 'Dip after (mm)'),
    });
  }

  let ok = 0;
  let fail = 0;
  const results = [];

  for (const g of groups.values()) {
    try {
      const normalizedLines = await normalizeTankerUnloadingCompartments(g.compartments);

      const { data: header, error: headerErr } = await supabase
        .from('tanker_unloading_headers')
        .insert([{
          unload_date: g.unload_date,
          tanker_number: g.tanker_number,
          supplier_name: g.supplier_name,
          waybill_no: g.waybill_no,
          invoice_no: g.invoice_no,
          temperature: g.temperature,
        }])
        .select()
        .single();
      if (headerErr) throw headerErr;

      const linesToInsert = normalizedLines.map((l) => ({ header_id: header.id, ...l }));
      const { error: linesErr } = await supabase.from('tanker_unloading_lines').insert(linesToInsert);
      if (linesErr) {
        await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);
        throw linesErr;
      }

      for (const line of normalizedLines) {
        const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', line.tank_name).single();
        if (tErr) throw tErr;
        const nextVol = Number(tankRow.current_volume || 0) + Number(line.received_volume || 0);
        const { error: updErr } = await supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tankRow.id);
        if (updErr) throw updErr;
      }

      ok++;
      results.push({ tanker_number: g.tanker_number, unload_date: g.unload_date, compartments: normalizedLines.length });
    } catch (e) {
      fail++;
      results.push({ tanker_number: g.tanker_number, unload_date: g.unload_date, error: String(e?.message || e) });
    }
  }

  const tuStatus = ok === 0 && groups.size > 0 ? 400 : 200;
  return res.status(tuStatus).json({ groups: groups.size, ok, fail, results });
}
