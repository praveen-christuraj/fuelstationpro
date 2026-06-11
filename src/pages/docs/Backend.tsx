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
      <div><h1 className="text-xl font-bold text-slate-800">Backend Planning & Database Design</h1><p className="text-sm text-slate-400 mt-0.5">Current backend shape, canonical tables, and the specialized routes added during hardening</p></div>
      <Card className="p-5 bg-blue-50 border-blue-100"><p className="text-sm text-blue-800">The backend is no longer purely generic. Stable table-backed CRUD still flows through the shared API entrypoint, but higher-risk workflows now use specialized handlers inside the same serverless file for validation and safer writes.</p></Card>
      <Card><CardHeader title="Canonical Database Schema" subtitle="16 interconnected tables" /><div className="p-5 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100"><th className="py-2 pr-4">Table</th><th className="py-2">Columns</th></tr></thead><tbody className="divide-y divide-slate-50">{tables.map(([t, c]) => <tr key={t}><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap align-top">{t}</td><td className="py-2 text-slate-500 font-mono text-xs">{c}</td></tr>)}</tbody></table></div></Card>
      <Card><CardHeader title="Endpoint Notes" subtitle="Current route-to-table behavior" /><div className="p-5 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100"><th className="py-2 pr-4">Route</th><th className="py-2 pr-4">Backend Table</th><th className="py-2">Notes</th></tr></thead><tbody className="divide-y divide-slate-50"><tr><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap">/api/finance</td><td className="py-2 pr-4 font-mono text-slate-600 whitespace-nowrap">finance_transactions</td><td className="py-2 text-slate-500">Alias retained to avoid changing the existing finance screen contract.</td></tr><tr><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap">/api/tanks/:tankId/calibration</td><td className="py-2 pr-4 font-mono text-slate-600 whitespace-nowrap">tank_calibration</td><td className="py-2 text-slate-500">Dedicated handler with validation and safer replace logic.</td></tr><tr><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap">/api/sales</td><td className="py-2 pr-4 font-mono text-slate-600 whitespace-nowrap">sales</td><td className="py-2 text-slate-500">POST requests are normalized server-side for sales volume and totals.</td></tr><tr><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap">/api/stock-movements</td><td className="py-2 pr-4 font-mono text-slate-600 whitespace-nowrap">stock_movements</td><td className="py-2 text-slate-500">POST/PUT requests validate movement type, volume, and tank-product consistency.</td></tr><tr><td className="py-2 pr-4 font-mono text-blue-600 whitespace-nowrap">/api/tanker-unloading</td><td className="py-2 pr-4 font-mono text-slate-600 whitespace-nowrap">tanker_unloading</td><td className="py-2 text-slate-500">POST/PUT requests validate product/tank alignment and positive receipt volumes.</td></tr></tbody></table></div></Card>
      <Card><CardHeader title="Supabase Client" subtitle="Service-role client with auto-recovery" /><div className="p-5"><CodeBlock filename="api/db-client.js" code={`import { createClient } from '@supabase/supabase-js';\n\nconst supabase = createClient(\n  process.env.NEXT_PUBLIC_SUPABASE_URL,\n  process.env.SUPABASE_SERVICE_ROLE_KEY\n);\n\nexport default supabase;`} /></div></Card>
      <Card><CardHeader title="Serverless API Route Pattern" subtitle="Shared entrypoint plus specialized handlers" /><div className="p-5"><CodeBlock filename="api/index.js" code={`import supabase from './db-client.js';\nimport { resolveTable } from './table-resolve.js';\nimport { normalizeSalesRows } from './sales-validate.js';\n\nexport default async function handler(req, res) {\n  const parts = parsePath(req.url);\n\n  if (parts[0] === 'sales' && req.method === 'POST') {\n    return handleSalesCreate(req, res);\n  }\n\n  const dbTable = resolveTable(parts[0]);\n  if (req.method === 'GET') {\n    let query = supabase.from(dbTable).select('*');\n    for (const [key, value] of getFilters(req.url)) {\n      query = query.eq(key, value);\n    }\n    const { data } = await query.order('id', { ascending: false });\n    return res.status(200).json(data);\n  }\n}\n\nasync function handleSalesCreate(req, res) {\n  const rows = Array.isArray(req.body) ? req.body : [req.body];\n  const normalizedRows = await normalizeSalesRows(rows, supabase);\n  const { data } = await supabase.from('sales').insert(normalizedRows).select();\n  return res.status(201).json(data);\n}`} /></div></Card>
    </div>
  );
}
