import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const tankId = req.query.tank_id;
      let q = supabase.from('tank_calibration').select('*').order('dip_cm', { ascending: true });
      if (tankId) q = q.eq('tank_id', tankId);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      const rows = Array.isArray(req.body) ? req.body : [req.body];
      const { data, error } = await supabase.from('tank_calibration').insert(rows).select();
      if (error) throw error;
      return res.status(201).json(data);
    }
    if (req.method === 'DELETE') {
      const { tank_id } = req.body;
      if (tank_id) {
        const { error } = await supabase.from('tank_calibration').delete().eq('tank_id', tank_id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      const { id } = req.body;
      const { error } = await supabase.from('tank_calibration').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}
