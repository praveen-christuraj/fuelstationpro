import supabase from './db-client.js';

function getTable(url) {
  const parts = new URL(url, 'http://localhost').pathname.replace('/api/', '').split('/');
  return parts[0].replace(/-/g, '_');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const dbTable = getTable(req.url);
  if (!dbTable) return res.status(404).json({ error: 'Not found' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from(dbTable).select('*').order('id', { ascending: false });
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
