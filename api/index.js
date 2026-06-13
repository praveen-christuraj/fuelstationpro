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
  nozzles: [
    { field: 'dispenser_name', refTable: 'dispensers', refField: 'name', label: 'Dispenser' },
    { field: 'tank_name', refTable: 'tanks', refField: 'name', label: 'Tank' },
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
    if (parts[0] === 'daily-sales' && parts[1] === 'import' && req.method === 'POST') {
      return await handleDailySalesImport(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'GET') {
      return await handleDailySalesList(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'POST') {
      return await handleDailySalesCreate(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'POST') {
      return await handleDipReadingCreate(req, res);
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
    if (parts[0] === 'tanker-unloading' && req.method === 'POST') {
      return await handleTankerUnloadingCreateV2(req, res);
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
      const rows = Array.isArray(req.body) ? req.body : [req.body];
      validateFields(dbTable, req.body, rows);
      await checkCrossReferences(dbTable, req.body, rows, supabase);
      for (const row of rows) {
        await checkDuplicateFields(dbTable, row, supabase);
      }
      const { data, error } = await supabase.from(dbTable).insert(rows).select();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID is required' });
      const { id: _id, ...rest } = req.body;
      validateFields(dbTable, rest);
      await checkCrossReferences(dbTable, rest, null, supabase);
      await checkDuplicateFields(dbTable, rest, supabase, id);
      const { data, error } = await supabase.from(dbTable).update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID is required' });
      await beforeDeleteCheck(dbTable, id, supabase);
      const { error } = await supabase.from(dbTable).delete().eq('id', id);
      if (error) throw error;
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
  return res.status(201).json(data);
}

async function handleStockMovementUpdate(req, res) {
  const { id, ...rest } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const [normalized] = await normalizeStockMovementRows([rest], supabase);
  const { data, error } = await supabase.from('stock_movements').update(normalized).eq('id', id).select().single();
  if (error) throw error;
  return res.status(200).json(data);
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

async function handleTankerUnloadingCreateV2(req, res) {
  const body = req.body || {};
  const unloadDate = requireText(body.unload_date, 'Unload date');
  const tankerNumber = requireText(body.tanker_number, 'Tanker number');
  const supplierName = optionalText(body.supplier_name);
  const waybillNo = optionalText(body.waybill_no);
  const invoiceNo = optionalText(body.invoice_no);
  const temperature = optionalNumber(body.temperature, 'Temperature');
  const compartments = Array.isArray(body.compartments) ? body.compartments : [];
  if (compartments.length === 0) return res.status(400).json({ error: 'At least one compartment is required' });

  const normalizedLines = [];
  for (let i = 0; i < compartments.length; i++) {
    const c = compartments[i] || {};
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

async function createDailySalesEntry(payload) {
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
  const missingNozzles = activeNozzleNames.filter((name) => !nozzleNames.includes(name));
  if (missingNozzles.length > 0) {
    throw new Error(`Enter closing reading for all active nozzles of ${dispenserName}: ${missingNozzles.join(', ')}`);
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
  const { data: productRows, error: pErr } = await supabase
    .from('products')
    .select('name, current_price')
    .in('name', productNames);
  if (pErr) throw pErr;
  const priceMap = new Map((productRows || []).map((p) => [p.name, Number(p.current_price || 0)]));

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
      groups.set(key, { sale_date: saleDate, shift_name: shiftName, operator_name: operatorName, dispenser_name: dispenserName, cash_amount: 0, online_amount: 0, credit_amount: 0, nozzle_readings: [], testing_volumes: [] });
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
    if (row.cash_amount != null && row.cash_amount !== '' && !g.cash_amount) g.cash_amount = Number(row.cash_amount) || 0;
    if (row.online_amount != null && row.online_amount !== '' && !g.online_amount) g.online_amount = Number(row.online_amount) || 0;
    if (row.credit_amount != null && row.credit_amount !== '' && !g.credit_amount) g.credit_amount = Number(row.credit_amount) || 0;
  }
  let ok = 0;
  let fail = 0;
  const results = [];
  for (const g of groups.values()) {
    try {
      const entryId = await createDailySalesEntry(g);
      ok++;
      results.push({ entry_id: entryId, sale_date: g.sale_date, shift_name: g.shift_name, operator_name: g.operator_name, dispenser_name: g.dispenser_name });
    } catch (e) {
      fail++;
      results.push({ error: String(e?.message || e), sale_date: g.sale_date, shift_name: g.shift_name, operator_name: g.operator_name, dispenser_name: g.dispenser_name });
    }
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
  return res.status(201).json({ ok, fail, results });
}

async function createDipReading(payload) {
  const body = payload || {};
  const readingDate = requireText(body.reading_date, 'Reading date');
  const tankName = requireText(body.tank_name, 'Tank');
  const dipMM = requireNonNegativeNumber(body.dip_mm, 'Dip (mm)');
  const readingType = requireText(body.reading_type, 'Reading type');

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
      validateChart(points);
      const { data: tank, error: tErr } = await supabase.from('tanks').select('id, name').eq('name', tankName).single();
      if (tErr) throw tErr;
      await supabase.from('tank_calibration').delete().eq('tank_id', tank.id);
      const toInsert = points.map((p) => ({ tank_id: tank.id, dip_mm: p.dip_mm, volume_liters: p.volume_liters }));
      const { error: insErr } = await supabase.from('tank_calibration').insert(toInsert);
      if (insErr) throw insErr;
      ok++;
      results.push({ tank_name: tank.name, points: points.length });
    } catch (e) {
      fail++;
      results.push({ tank_name: tankName, error: String(e?.message || e) });
    }
  }

  return res.status(200).json({ tanks: byTank.size, ok, fail, results });
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
