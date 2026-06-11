import supabase from './db-client.js';
import { validateChart } from './calibration-validate.js';

const TXN_TABLES = [
  'tanker_unloading', 'stock_movements', 'sales', 'credit_sales', 'finance',
  'calibration', 'price_history',
];

function parsePath(url) {
  const parts = new URL(url, 'http://localhost').pathname.replace('/api/', '').split('/').filter(Boolean);
  return parts;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const parts = parsePath(req.url);

  try {
    if (parts[0] === 'tanks' && parts[2] === 'calibration' && parts[1]) {
      return await handleCalibration(req, res, parts[1]);
    }

    const dbTable = parts[0]?.replace(/-/g, '_');
    if (!dbTable) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      const orderCol = TXN_TABLES.includes(dbTable) ? 'id' : 'id';
      const orderDir = TXN_TABLES.includes(dbTable) ? { ascending: false } : { ascending: true };
      const { data, error } = await supabase.from(dbTable).select('*').order(orderCol, orderDir);
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
      .select('id, dip_cm, volume_liters')
      .eq('tank_id', tid)
      .order('dip_cm', { ascending: true });
    if (error) throw error;
    return res.status(200).json({ tank_id: tid, points: data || [], count: data?.length || 0 });
  }

  if (req.method === 'PUT') {
    const { points } = req.body || {};
    const validation = validateChart(points, tank.capacity);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join('; ') });

    const { error: delErr } = await supabase.from('tank_calibration').delete().eq('tank_id', tid);
    if (delErr) throw delErr;

    const rows = points.map((p) => ({ tank_id: tid, dip_cm: Number(p.dip_cm), volume_liters: Number(p.volume_liters) }));
    const { data, error: insErr } = await supabase.from('tank_calibration').insert(rows).select();
    if (insErr) {
      await supabase.from('tank_calibration').delete().eq('tank_id', tid);
      throw insErr;
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
