import { Card, CardHeader } from '../../components/ui/Card';
import CodeBlock from '../../components/CodeBlock';

const tables = [
  ['products', 'id, name, code, category, unit, current_price, density, active'],
  ['price_history', 'id, product_name, old_price, new_price, effective_date, changed_by'],
  ['tanks', 'id, name, code, product_name, capacity, current_volume, dead_stock, diameter'],
  ['tank_calibration', 'id, tank_id, dip_cm, volume_liters'],
  ['dispensers', 'id, name, code, make, num_nozzles, status'],
  ['nozzles', 'id, name, dispenser_name, tank_name, product_name, status'],
  ['meters', 'id, nozzle_name, serial_no, opening_reading, current_reading, unit'],
  ['operators', 'id, name, emp_code, phone, role, active'],
  ['shifts', 'id, name, start_time, end_time, description'],
  ['bank_accounts', 'id, bank_name, account_name, account_no, ifsc, balance'],
  ['suppliers', 'id, name, contact_person, phone, email, gst_no, products'],
  ['tanker_unloading', 'id, unload_date, supplier_name, tank_name, product_name, invoice_no, declared_volume, received_volume, temperature'],
  ['stock_movements', 'id, movement_date, movement_type, tank_name, product_name, volume, reason'],
  ['sales', 'id, sale_date, nozzle_name, product_name, operator_name, shift_name, opening_reading, closing_reading, testing_volume, sale_volume, unit_price, total_amount, loss_gain'],
  ['credit_sales', 'id, sale_date, customer_name, product_name, volume, amount, vehicle_no, status'],
  ['finance_transactions', 'id, txn_date, txn_type, category, bank_account, amount, reference'],
];

export default function Backend() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-slate-800">Backend Planning & Database Design</h1><p className="text-sm text-slate-400 mt-0.5">Supabase (Postgres) schema, API layer and resilience design</p></div>
      <Card><CardHeader title="Database Schema" subtitle="16 interconnected tables" /><div className="p-5 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100"><th className="py-2 pr-4">Table</th><th className="py-2">Columns</th></tr></thead><tbody className="divide-y divide-slate-50">{tables.map(([t, c]) => <tr key={t}><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap align-top">{t}</td><td className="py-2 text-slate-500 font-mono text-xs">{c}</td></tr>)}</tbody></table></div></Card>
      <Card><CardHeader title="Supabase Client" subtitle="Service-role client with auto-recovery" /><div className="p-5"><CodeBlock filename="api/db-client.js" code={`import { createClient } from '@supabase/supabase-js';\n\nconst supabase = createClient(\n  process.env.NEXT_PUBLIC_SUPABASE_URL,\n  process.env.SUPABASE_SERVICE_ROLE_KEY\n);\n\nexport default supabase;`} /></div></Card>
      <Card><CardHeader title="Serverless API Route Pattern" subtitle="One file per resource in /api" /><div className="p-5"><CodeBlock filename="api/sales.js" code={`import supabase from './db-client.js';\n\nexport default async function handler(req, res) {\n  res.setHeader('Access-Control-Allow-Origin', '*');\n  if (req.method === 'OPTIONS') return res.status(204).end();\n\n  if (req.method === 'GET') {\n    const { data, error } = await supabase\n      .from('sales').select('*')\n      .order('sale_date', { ascending: false });\n    if (error) throw error;\n    return res.status(200).json(data);\n  }\n  if (req.method === 'POST') {\n    const rows = Array.isArray(req.body) ? req.body : [req.body];\n    const { data, error } = await supabase\n      .from('sales').insert(rows).select();\n    if (error) throw error;\n    return res.status(201).json(data);\n  }\n}`} /></div></Card>
    </div>
  );
}
