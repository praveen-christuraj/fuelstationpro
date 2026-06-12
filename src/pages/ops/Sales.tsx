import { useEffect, useMemo, useState } from 'react';
import { Plus, X, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { Field, Input, Select } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { apiGet, apiPost, fmtMoney, fmtNum, fmtDate } from '../../lib/api';

export default function Sales() {
  const [entries, setEntries] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [nozzles, setNozzles] = useState<any[]>([]);
  const [meters, setMeters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<any>({
    sale_date: new Date().toISOString().slice(0, 10),
    shift_name: '',
    operator_name: '',
    cash_amount: '',
    online_amount: '',
    credit_amount: '',
  });
  const [nozzleReadings, setNozzleReadings] = useState<{ nozzle_name: string; closing_reading: string }[]>([]);
  const [testingVolumes, setTestingVolumes] = useState<{ nozzle_name: string; volume: string; remarks: string }[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [e, p, o, sh, n, m] = await Promise.all([
        apiGet('/api/daily-sales'),
        apiGet('/api/products'),
        apiGet('/api/operators'),
        apiGet('/api/shifts'),
        apiGet('/api/nozzles'),
        apiGet('/api/meters'),
      ]);
      setEntries(e || []);
      setProducts(p || []);
      setOperators(o || []);
      setShifts(sh || []);
      setNozzles(n || []);
      setMeters(m || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const meterMap = useMemo(() => new Map(meters.map((m) => [m.nozzle_name, m])), [meters]);
  const nozzleMap = useMemo(() => new Map(nozzles.map((n) => [n.name, n])), [nozzles]);
  const priceMap = useMemo(() => new Map(products.map((p) => [p.name, Number(p.current_price || 0)])), [products]);

  const initNozzleReadings = () => {
    const active = nozzles.filter((n) => n.status === 'Active' || n.status == null);
    setNozzleReadings(active.map((n) => ({ nozzle_name: n.name, closing_reading: '' })));
  };

  const addTesting = () => setTestingVolumes((prev) => [...prev, { nozzle_name: '', volume: '', remarks: '' }]);

  const calculations = useMemo(() => {
    const readings = nozzleReadings.map((nr) => {
      const nozzle = nozzleMap.get(nr.nozzle_name);
      const meter = meterMap.get(nr.nozzle_name);
      const opening = Number(meter?.current_reading || 0);
      const closing = nr.closing_reading === '' ? null : Number(nr.closing_reading);
      const volume = closing == null || !Number.isFinite(closing) ? 0 : Math.max(0, closing - opening);
      const productName = nozzle?.product_name || '';
      const unitPrice = Number(priceMap.get(productName) ?? 0);
      const amount = volume * unitPrice;
      return { nozzle_name: nr.nozzle_name, product_name: productName, tank_name: nozzle?.tank_name || null, dispenser_name: nozzle?.dispenser_name || null, opening, closing, volume, unit_price: unitPrice, amount };
    });

    const testing = testingVolumes
      .map((tv) => {
        const noz = nozzleMap.get(tv.nozzle_name);
        const productName = noz?.product_name || '';
        const unitPrice = Number(priceMap.get(productName) ?? 0);
        const volume = Number(tv.volume || 0);
        return { nozzle_name: tv.nozzle_name, product_name: productName, volume, unit_price: unitPrice, amount: volume * unitPrice, remarks: tv.remarks };
      })
      .filter((t) => t.volume > 0);

    const grossAmount = readings.reduce((s, r) => s + Number(r.amount || 0), 0);
    const testingDeduction = testing.reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalSalesAmount = grossAmount - testingDeduction;
    const cash = Number(form.cash_amount || 0);
    const online = Number(form.online_amount || 0);
    const credit = Number(form.credit_amount || 0);
    const totalSubmitted = cash + online + credit;
    const variance = totalSubmitted - totalSalesAmount;

    const byProduct: Record<string, { volume: number; testVol: number; price: number; amount: number }> = {};
    readings.forEach((r) => {
      if (!r.product_name) return;
      byProduct[r.product_name] = byProduct[r.product_name] || { volume: 0, testVol: 0, price: r.unit_price, amount: 0 };
      byProduct[r.product_name].volume += Number(r.volume || 0);
      byProduct[r.product_name].amount += Number(r.amount || 0);
    });
    testing.forEach((t) => {
      if (!t.product_name) return;
      byProduct[t.product_name] = byProduct[t.product_name] || { volume: 0, testVol: 0, price: t.unit_price, amount: 0 };
      byProduct[t.product_name].testVol += Number(t.volume || 0);
      byProduct[t.product_name].amount -= Number(t.amount || 0);
    });

    return { readings, testing, byProduct, grossAmount, testingDeduction, totalSalesAmount, totalSubmitted, variance };
  }, [nozzleReadings, testingVolumes, nozzleMap, meterMap, priceMap, form.cash_amount, form.online_amount, form.credit_amount]);

  const openCreate = () => {
    setForm({ sale_date: new Date().toISOString().slice(0, 10), shift_name: '', operator_name: '', cash_amount: '', online_amount: '', credit_amount: '' });
    setTestingVolumes([]);
    setFormErr('');
    initNozzleReadings();
    setShowAdd(true);
  };

  const save = async () => {
    setFormErr('');
    if (!form.sale_date || !form.shift_name || !form.operator_name) {
      setFormErr('Sale date, shift and operator are required');
      return;
    }
    if (nozzleReadings.some((nr) => nr.closing_reading === '' || !Number.isFinite(Number(nr.closing_reading)))) {
      setFormErr('Enter closing reading for all active nozzles');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/api/daily-sales', {
        sale_date: form.sale_date,
        shift_name: form.shift_name,
        operator_name: form.operator_name,
        cash_amount: form.cash_amount === '' ? 0 : Number(form.cash_amount),
        online_amount: form.online_amount === '' ? 0 : Number(form.online_amount),
        credit_amount: form.credit_amount === '' ? 0 : Number(form.credit_amount),
        nozzle_readings: nozzleReadings.map((nr) => ({ nozzle_name: nr.nozzle_name, closing_reading: Number(nr.closing_reading) })),
        testing_volumes: testingVolumes
          .filter((tv) => Number(tv.volume || 0) > 0)
          .map((tv) => ({ nozzle_name: tv.nozzle_name || null, volume: Number(tv.volume || 0), remarks: tv.remarks || null })),
      });
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to submit sales entry');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Daily Sales Entry</h1>
          <p className="text-sm text-slate-400 mt-0.5">Shift-wise nozzle readings with operator collection reconciliation (cash/online/credit)</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Sales Entry
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <Card key={entry.id} className="overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : entry.id)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50">
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{fmtDate(entry.sale_date)} • {entry.shift_name} • {entry.operator_name}</p>
                    <p className="text-xs text-slate-500">{(entry.daily_sales_nozzle_readings || []).length} nozzle(s) • {(entry.daily_sales_testing || []).length} test(s)</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-bold text-emerald-600">{fmtMoney(entry.total_sales_amount)}</p>
                      <p className={`text-xs ${Number(entry.variance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Var: {Number(entry.variance || 0) >= 0 ? '+' : ''}{fmtMoney(entry.variance)}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="px-5 pb-4 border-t border-slate-100">
                    <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500">Cash</p>
                        <p className="font-bold text-emerald-700">{fmtMoney(entry.cash_amount)}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500">Online</p>
                        <p className="font-bold text-blue-700">{fmtMoney(entry.online_amount)}</p>
                      </div>
                      <div className="bg-rose-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-slate-500">Credit</p>
                        <p className="font-bold text-rose-700">{fmtMoney(entry.credit_amount)}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200 mt-4">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs">
                          <tr>
                            <th className="px-3 py-2 text-left">Nozzle</th>
                            <th className="px-3 py-2 text-left">Product</th>
                            <th className="px-3 py-2 text-right">Opening</th>
                            <th className="px-3 py-2 text-right">Closing</th>
                            <th className="px-3 py-2 text-right">Volume</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(entry.daily_sales_nozzle_readings || []).map((r: any) => (
                            <tr key={r.id}>
                              <td className="px-3 py-2 text-slate-700">{r.nozzle_name}</td>
                              <td className="px-3 py-2"><Badge color="blue">{r.product_name}</Badge></td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmtNum(r.opening_reading, 2)}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmtNum(r.closing_reading, 2)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtNum(r.volume, 2)} L</td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmtMoney(r.unit_price)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmtMoney(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {(entry.daily_sales_testing || []).length > 0 && (
                      <div className="mt-4">
                        <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Testing Volumes (Deducted)</div>
                        <div className="space-y-1 text-sm text-slate-600">
                          {(entry.daily_sales_testing || []).map((t: any) => (
                            <div key={t.id}>{t.product_name}: -{fmtNum(t.volume, 2)} L {t.remarks ? `(${t.remarks})` : ''}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {entries.length === 0 && <Card className="p-10 text-center text-slate-400">No sales entries recorded yet.</Card>}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Record Daily Sales" wide>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Date" required>
              <Input type="date" value={form.sale_date || ''} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} />
            </Field>
            <Field label="Shift" required>
              <Select value={form.shift_name || ''} onChange={(e) => setForm({ ...form, shift_name: e.target.value })}>
                <option value="">Select…</option>
                {shifts.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Operator" required>
              <Select value={form.operator_name || ''} onChange={(e) => setForm({ ...form, operator_name: e.target.value })}>
                <option value="">Select…</option>
                {operators.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
              </Select>
            </Field>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Nozzle</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Opening</th>
                  <th className="px-3 py-2 text-right">Closing</th>
                  <th className="px-3 py-2 text-right">Volume</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {nozzleReadings.map((nr, idx) => {
                  const nozzle = nozzleMap.get(nr.nozzle_name);
                  const meter = meterMap.get(nr.nozzle_name);
                  const opening = Number(meter?.current_reading || 0);
                  const closing = nr.closing_reading === '' ? opening : Number(nr.closing_reading);
                  const volume = Math.max(0, closing - opening);
                  const price = Number(priceMap.get(nozzle?.product_name || '') ?? 0);
                  const amount = volume * price;
                  return (
                    <tr key={nr.nozzle_name}>
                      <td className="px-3 py-2 text-slate-700">{nr.nozzle_name}</td>
                      <td className="px-3 py-2"><Badge color="blue">{nozzle?.product_name || '—'}</Badge></td>
                      <td className="px-3 py-2 text-right text-slate-600">{fmtNum(opening, 2)}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={nr.closing_reading}
                          onChange={(e) => {
                            const next = [...nozzleReadings];
                            next[idx] = { ...next[idx], closing_reading: e.target.value };
                            setNozzleReadings(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtNum(volume, 2)} L</td>
                      <td className="px-3 py-2 text-right text-slate-600">{fmtMoney(price)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmtMoney(amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-800">Testing Volumes</div>
              <div className="text-xs text-slate-400">Deducted from sales amount, but still part of physical stock out</div>
            </div>
            <button onClick={addTesting} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus className="w-4 h-4" /> Add Testing
            </button>
          </div>

          {testingVolumes.map((tv, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <Field label="Nozzle">
                <Select value={tv.nozzle_name} onChange={(e) => { const next = [...testingVolumes]; next[idx] = { ...next[idx], nozzle_name: e.target.value }; setTestingVolumes(next); }}>
                  <option value="">Select…</option>
                  {nozzles.map((n) => <option key={n.id} value={n.name}>{n.name} ({n.product_name})</option>)}
                </Select>
              </Field>
              <Field label="Volume (L)">
                <Input type="number" step="0.01" value={tv.volume} onChange={(e) => { const next = [...testingVolumes]; next[idx] = { ...next[idx], volume: e.target.value }; setTestingVolumes(next); }} />
              </Field>
              <Field label="Remarks">
                <Input value={tv.remarks} onChange={(e) => { const next = [...testingVolumes]; next[idx] = { ...next[idx], remarks: e.target.value }; setTestingVolumes(next); }} />
              </Field>
              <button onClick={() => setTestingVolumes(testingVolumes.filter((_, i) => i !== idx))} className="h-10 inline-flex items-center justify-center gap-2 px-3 rounded-lg bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100">
                <X className="w-4 h-4" /> Remove
              </button>
            </div>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Cash Amount (₹)">
              <Input type="number" step="0.01" value={form.cash_amount} onChange={(e) => setForm({ ...form, cash_amount: e.target.value })} />
            </Field>
            <Field label="Online Amount (₹)">
              <Input type="number" step="0.01" value={form.online_amount} onChange={(e) => setForm({ ...form, online_amount: e.target.value })} />
            </Field>
            <Field label="Credit Amount (₹)">
              <Input type="number" step="0.01" value={form.credit_amount} onChange={(e) => setForm({ ...form, credit_amount: e.target.value })} />
            </Field>
          </div>

          <Card className="p-4 bg-slate-50 border-slate-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-slate-400">Total Sales (after testing)</div>
                <div className="text-lg font-bold text-slate-800">{fmtMoney(calculations.totalSalesAmount)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Total Submitted</div>
                <div className="text-lg font-bold text-slate-800">{fmtMoney(calculations.totalSubmitted)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 flex items-center gap-1">{Math.abs(calculations.variance) > 10 ? <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> : null} Variance</div>
                <div className={`text-lg font-bold ${calculations.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{calculations.variance >= 0 ? '+' : ''}{fmtMoney(calculations.variance)}</div>
              </div>
            </div>
          </Card>

          {formErr && <p className="text-sm text-rose-600">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Submitting…' : 'Submit Entry'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
