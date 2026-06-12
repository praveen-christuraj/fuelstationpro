import supabase from './db-client.js';
import { validateChart } from './calibration-validate.js';
import { normalizeSalesRows } from './sales-validate.js';
import { normalizeStockMovementRows, normalizeTankerUnloadingRows } from './stock-validate.js';
import { resolveTable } from './table-resolve.js';
import { applyCorsHeaders, isAllowedResource, isOriginAllowed } from './runtime-config.js';
import { authenticateRequest } from './auth.js';

const TXN_TABLES = [
  'tanker_unloading', 'stock_movements', 'sales', 'credit_sales', 'finance_transactions',
  'price_history',
];

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
      return await handleTankerUnloadingCreate(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'PUT') {
      return await handleTankerUnloadingUpdate(req, res);
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
      const { data, error } = await supabase.from(dbTable).insert(rows).select();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      const { id, ...rest } = req.body;
      const { data, error } = await supabase.from(dbTable).update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body;
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

async function handleTankerUnloadingCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const normalizedRows = await normalizeTankerUnloadingRows(rows, supabase);
  const { data, error } = await supabase.from('tanker_unloading').insert(normalizedRows).select();
  if (error) throw error;
  return res.status(201).json(data);
}

async function handleTankerUnloadingUpdate(req, res) {
  const { id, ...rest } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const [normalized] = await normalizeTankerUnloadingRows([rest], supabase);
  const { data, error } = await supabase.from('tanker_unloading').update(normalized).eq('id', id).select().single();
  if (error) throw error;
  return res.status(200).json(data);
}
