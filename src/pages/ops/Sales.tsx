import { useEffect, useState } from 'react';
import { Plus, Trash2, Calculator, Beaker } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import Modal, { ConfirmModal } from '../../components/ui/Modal';
import { Field, Input, Select } from '../../components/ui/Field';
import { Loading, ErrorState, EmptyState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { apiGet, apiPost, apiDelete, fmtMoney, fmtNum, fmtDate } from '../../lib/api';

export default function Sales() {
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [nozzles, setNozzles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [delTarget, setDelTarget] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [formErr, setFormErr] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, p, o, sh, n] = await Promise.all([apiGet('/api/sales'), apiGet('/api/products'), apiGet('/api/operators'), apiGet('/api/shifts'), apiGet('/api/nozzles')]);
      setSales(s); setProducts(p); setOperators(o); setShifts(sh); setNozzles(n);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const open = () => { setForm({ sale_date: new Date().toISOString().slice(0, 10), nozzle_name: '', product_name: '', operator_name: '', shift_name: '', opening_reading: '', closing_reading: '', testing_volume: '0', unit_price: '' }); setFormErr(''); setModal(true); };

  const product = products.find((p) => p.name === form.product_name);
  const grossVol = (Number(form.closing_reading) || 0) - (Number(form.opening_reading) || 0);
  const netVol = grossVol - (Number(form.testing_volume) || 0);
  const unitPrice = Number(form.unit_price) || Number(product?.current_price) || 0;
  const amount = netVol * unitPrice;

  const save = async () => {
    if (!form.product_name || !form.operator_name || !form.shift_name) { setFormErr('Product, Operator and Shift are required'); return; }
    if (grossVol < 0) { setFormErr('Closing reading must be greater than opening reading'); return; }
    try {
      await apiPost('/api/sales', {
        sale_date: form.sale_date, nozzle_name: form.nozzle_name, product_name: form.product_name, operator_name: form.operator_name, shift_name: form.shift_name,
        opening_reading: Number(form.opening_reading || 0), closing_reading: Number(form.closing_reading || 0), testing_volume: Number(form.testing_volume || 0),
        sale_volume: netVol, unit_price: unitPrice, total_amount: amount, loss_gain: 0,
      });
      setModal(false); await load();
    } catch (e: any) { setFormErr(e.message); }
  };
  const remove = async (s: any) => { await apiDelete('/api/sales', { id: s.id }); await load(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-800">Daily Sales Entry</h1><p className="text-sm text-slate-400 mt-0.5">Meter-based sales by operator & shift with testing buffer handling</p></div>
        <button onClick={open} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><Plus className="w-4 h-4" /> New Sale Entry</button>
      </div>
      <Card>
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : sales.length === 0 ? <EmptyState message="No sales recorded" hint="Create a sale entry to begin" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50"><th className="px-4 py-3">Date</th><th className="px-4 py-3">Nozzle</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Operator</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Closing</th><th className="px-4 py-3 text-right">Testing</th><th className="px-4 py-3 text-right">Net Vol</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(s.sale_date)}</td>
                    <td className="px-4 py-3 text-slate-600">{s.nozzle_name || '—'}</td>
                    <td className="px-4 py-3"><Badge color="blue">{s.product_name}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{s.operator_name}</td>
                    <td className="px-4 py-3 text-slate-600">{s.shift_name}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmtNum(s.opening_reading, 1)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{fmtNum(s.closing_reading, 1)}</td>
                    <td className="px-4 py-3 text-right text-amber-600">{fmtNum(s.testing_volume, 1)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">{fmtNum(s.sale_volume, 1)} L</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmtMoney(s.total_amount)}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setDelTarget(s)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Sale Entry" wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Sale Date" required><Input type="date" value={form.sale_date || ''} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} /></Field>
          <Field label="Nozzle"><Select value={form.nozzle_name || ''} onChange={(e) => { const nz = nozzles.find((n) => n.name === e.target.value); setForm({ ...form, nozzle_name: e.target.value, product_name: nz?.product_name || form.product_name }); }}><option value="">Select nozzle…</option>{nozzles.map((n) => <option key={n.id} value={n.name}>{n.name} ({n.product_name})</option>)}</Select></Field>
          <Field label="Product" required><Select value={form.product_name || ''} onChange={(e) => setForm({ ...form, product_name: e.target.value })}><option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}</Select></Field>
          <Field label="Operator" required><Select value={form.operator_name || ''} onChange={(e) => setForm({ ...form, operator_name: e.target.value })}><option value="">Select…</option>{operators.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}</Select></Field>
          <Field label="Shift" required><Select value={form.shift_name || ''} onChange={(e) => setForm({ ...form, shift_name: e.target.value })}><option value="">Select…</option>{shifts.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}</Select></Field>
          <Field label="Unit Price (auto)"><Input type="number" step="any" value={form.unit_price || (product?.current_price ?? '')} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} placeholder={product ? String(product.current_price) : ''} /></Field>
          <Field label="Opening Meter Reading" required><Input type="number" step="any" value={form.opening_reading || ''} onChange={(e) => setForm({ ...form, opening_reading: e.target.value })} /></Field>
          <Field label="Closing Meter Reading" required><Input type="number" step="any" value={form.closing_reading || ''} onChange={(e) => setForm({ ...form, closing_reading: e.target.value })} /></Field>
          <Field label="Testing Volume Buffer (L)"><Input type="number" step="any" value={form.testing_volume || ''} onChange={(e) => setForm({ ...form, testing_volume: e.target.value })} /></Field>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-400 flex items-center gap-1"><Calculator className="w-3 h-3" /> Gross Volume</div><div className="text-lg font-bold text-slate-700">{fmtNum(grossVol, 1)} L</div></div>
          <div className="rounded-lg bg-amber-50 p-3"><div className="text-xs text-amber-500 flex items-center gap-1"><Beaker className="w-3 h-3" /> Net (after testing)</div><div className="text-lg font-bold text-amber-700">{fmtNum(netVol, 1)} L</div></div>
          <div className="rounded-lg bg-blue-50 p-3"><div className="text-xs text-blue-500">Total Amount</div><div className="text-lg font-bold text-blue-700">{fmtMoney(amount)}</div></div>
        </div>
        {formErr && <p className="text-sm text-rose-600 mt-3">{formErr}</p>}
        <div className="flex justify-end gap-2 mt-5"><button onClick={() => setModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={save} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">Save Sale</button></div>
      </Modal>
      <ConfirmModal open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && remove(delTarget)} title="Delete Sale Entry" message="Delete this sale record permanently?" />
    </div>
  );
}
