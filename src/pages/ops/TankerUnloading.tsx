import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Truck, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Field, Input, Select } from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { Loading, ErrorState } from '../../components/ui/States';
import { apiGet, apiPost, fmtDate, fmtNum } from '../../lib/api';
import { interpolateVolume } from '../../lib/interp';

export default function TankerUnloading() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({
    unload_date: new Date().toISOString().slice(0, 10),
    tanker_number: '',
    supplier_name: '',
    waybill_no: '',
    invoice_no: '',
    temperature: '',
  });
  const [compartments, setCompartments] = useState<any[]>([
    { product_name: '', tank_name: '', tanker_qty: '', dip_before_mm: '', dip_after_mm: '' },
  ]);
  const [calCache, setCalCache] = useState<Record<string, any[]>>({});
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [b, t, p, s] = await Promise.all([
        apiGet('/api/tanker-unloading/batches'),
        apiGet('/api/tanks'),
        apiGet('/api/products'),
        apiGet('/api/suppliers'),
      ]);
      setBatches(b || []);
      setTanks(t || []);
      setProducts(p || []);
      setSuppliers(s || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load tanker unloadings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const getPoints = async (tankName: string) => {
    const tank = tanks.find((t) => t.name === tankName);
    if (!tank) return [];
    if (calCache[String(tank.id)]) return calCache[String(tank.id)];
    const resp = await apiGet(`/api/tanks/${tank.id}/calibration`);
    const points = resp?.points || [];
    setCalCache((prev) => ({ ...prev, [String(tank.id)]: points }));
    return points;
  };

  const computed = useMemo(() => {
    return compartments.map((c) => {
      const tankerQty = Number(c.tanker_qty || 0);
      const dipBefore = Number(c.dip_before_mm);
      const dipAfter = Number(c.dip_after_mm);
      const tank = tanks.find((t) => t.name === c.tank_name);
      const points = tank ? calCache[String(tank.id)] || [] : [];
      const vBefore = interpolateVolume(points, dipBefore);
      const vAfter = interpolateVolume(points, dipAfter);
      const received = vBefore == null || vAfter == null ? null : vAfter - vBefore;
      const variance = received == null ? null : received - tankerQty;
      return { vBefore, vAfter, received, variance };
    });
  }, [compartments, tanks, calCache]);

  const openCreate = () => {
    setForm({
      unload_date: new Date().toISOString().slice(0, 10),
      tanker_number: '',
      supplier_name: '',
      waybill_no: '',
      invoice_no: '',
      temperature: '',
    });
    setCompartments([{ product_name: '', tank_name: '', tanker_qty: '', dip_before_mm: '', dip_after_mm: '' }]);
    setFormErr('');
    setOpen(true);
  };

  const addCompartment = () => {
    setCompartments((prev) => [...prev, { product_name: '', tank_name: '', tanker_qty: '', dip_before_mm: '', dip_after_mm: '' }]);
  };

  const updateCompartment = async (idx: number, key: string, value: any) => {
    const next = [...compartments];
    next[idx] = { ...next[idx], [key]: value };
    if (key === 'product_name') next[idx].tank_name = '';
    setCompartments(next);
    if (key === 'tank_name' && value) {
      try {
        await getPoints(String(value));
      } catch {
        // ignore
      }
    }
  };

  const removeCompartment = (idx: number) => {
    if (compartments.length <= 1) return;
    setCompartments((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setFormErr('');
    if (!form.unload_date || !form.tanker_number) {
      setFormErr('Unload date and tanker number are required');
      return;
    }
    if (compartments.some((c) => !c.product_name || !c.tank_name || c.tanker_qty === '' || c.dip_before_mm === '' || c.dip_after_mm === '')) {
      setFormErr('Fill all required compartment fields (product, tank, tanker qty, dip before, dip after)');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/api/tanker-unloading', {
        unload_date: form.unload_date,
        tanker_number: form.tanker_number,
        supplier_name: form.supplier_name || null,
        waybill_no: form.waybill_no || null,
        invoice_no: form.invoice_no || null,
        temperature: form.temperature === '' ? null : Number(form.temperature),
        compartments: compartments.map((c) => ({
          product_name: c.product_name,
          tank_name: c.tank_name,
          tanker_qty: Number(c.tanker_qty || 0),
          dip_before_mm: Number(c.dip_before_mm || 0),
          dip_after_mm: Number(c.dip_after_mm || 0),
        })),
      });
      setOpen(false);
      await load();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to save unloading');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tanker Unloading</h1>
          <p className="text-sm text-slate-400 mt-0.5">Compartment-based receipts with tanker qty vs dip-received comparison</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> New Unloading
        </button>
      </div>

      <div className="space-y-3">
        {batches.map((b) => {
          const isExpanded = expandedId === b.id;
          const totals = b.totals || {};
          return (
            <Card key={b.id} className="overflow-hidden">
              <button onClick={() => setExpandedId(isExpanded ? null : b.id)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Truck className="w-5 h-5 text-blue-700" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{b.tanker_number} <span className="text-slate-400 font-normal">•</span> {fmtDate(b.unload_date)}</p>
                    <p className="text-xs text-slate-500">{b.supplier_name || '—'} • {Array.isArray(b.tanker_unloading_lines) ? b.tanker_unloading_lines.length : 0} compartment(s)</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-slate-500">Tanker: {fmtNum(totals.tanker_qty || 0, 0)} L</p>
                    <p className="text-xs text-slate-500">Received: <span className="font-semibold text-emerald-600">{fmtNum(totals.received_volume || 0, 0)} L</span></p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-5 pb-4 border-t border-slate-100">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-sm">
                    <div><span className="text-slate-500">Waybill:</span> <strong className="text-slate-700">{b.waybill_no || '—'}</strong></div>
                    <div><span className="text-slate-500">Invoice:</span> <strong className="text-slate-700">{b.invoice_no || '—'}</strong></div>
                    <div><span className="text-slate-500">Temp:</span> <strong className="text-slate-700">{b.temperature == null ? '—' : fmtNum(b.temperature, 1)}°C</strong></div>
                    <div>
                      <span className="text-slate-500">Variance:</span>{' '}
                      {(() => {
                        const v = Number(totals.variance || 0);
                        return <Badge color={v < 0 ? 'red' : v > 0 ? 'green' : 'slate'}>{v >= 0 ? '+' : ''}{fmtNum(v, 1)} L</Badge>;
                      })()}
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Product</th>
                          <th className="px-3 py-2 text-left">Tank</th>
                          <th className="px-3 py-2 text-right">Tanker Qty</th>
                          <th className="px-3 py-2 text-right">Dip Before</th>
                          <th className="px-3 py-2 text-right">Dip After</th>
                          <th className="px-3 py-2 text-right">Received</th>
                          <th className="px-3 py-2 text-right">Variance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {(b.tanker_unloading_lines || []).map((l: any, i: number) => (
                          <tr key={l.id}>
                            <td className="px-3 py-2">{i + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{l.product_name}</td>
                            <td className="px-3 py-2 text-slate-600">{l.tank_name}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmtNum(l.tanker_qty, 0)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmtNum(l.dip_before_mm, 0)} mm ({fmtNum(l.volume_before_liters, 0)} L)</td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmtNum(l.dip_after_mm, 0)} mm ({fmtNum(l.volume_after_liters, 0)} L)</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-600">{fmtNum(l.received_volume, 1)} L</td>
                            <td className="px-3 py-2 text-right">{(() => {
                              const v = Number(l.variance || 0);
                              return <span className={`font-semibold ${v >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{v >= 0 ? '+' : ''}{fmtNum(v, 1)} L</span>;
                            })()}</td>
                          </tr>
                        ))}
                        {(b.tanker_unloading_lines || []).length === 0 && (
                          <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No lines</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {batches.length === 0 && (
          <Card className="p-10 text-center text-slate-400">No tanker unloadings recorded yet.</Card>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Tanker Unloading" wide>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Date" required>
              <Input type="date" value={form.unload_date || ''} onChange={(e) => setForm({ ...form, unload_date: e.target.value })} />
            </Field>
            <Field label="Tanker Number" required>
              <Input value={form.tanker_number || ''} onChange={(e) => setForm({ ...form, tanker_number: e.target.value })} placeholder="KA-01-AB-1234" />
            </Field>
            <Field label="Supplier">
              <Select value={form.supplier_name || ''} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Waybill No">
              <Input value={form.waybill_no || ''} onChange={(e) => setForm({ ...form, waybill_no: e.target.value })} />
            </Field>
            <Field label="Invoice / DC No">
              <Input value={form.invoice_no || ''} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
            </Field>
            <Field label="Temp (°C)">
              <Input type="number" step="any" value={form.temperature ?? ''} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
            </Field>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-800">Compartments</div>
              <div className="text-xs text-slate-400">Dip before/after will be converted to volume using the selected tank’s calibration chart</div>
            </div>
            <button onClick={addCompartment} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Plus className="w-4 h-4" /> Add Compartment
            </button>
          </div>

          <div className="space-y-3">
            {compartments.map((c, idx) => {
              const product = products.find((p) => p.name === c.product_name);
              const tanksForProduct = tanks.filter((t) => !c.product_name || t.product_name === c.product_name);
              const calc = computed[idx];
              return (
                <Card key={idx} className="p-4 bg-slate-50 border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium text-slate-700">Compartment {idx + 1}</div>
                    {compartments.length > 1 && (
                      <button onClick={() => removeCompartment(idx)} className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700">
                        <X className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Product" required>
                      <Select value={c.product_name || ''} onChange={(e) => updateCompartment(idx, 'product_name', e.target.value)}>
                        <option value="">Select…</option>
                        {products.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Tank" required>
                      <Select value={c.tank_name || ''} onChange={(e) => updateCompartment(idx, 'tank_name', e.target.value)}>
                        <option value="">Select…</option>
                        {tanksForProduct.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Tanker Qty (L)" required>
                      <Input type="number" step="any" value={c.tanker_qty ?? ''} onChange={(e) => updateCompartment(idx, 'tanker_qty', e.target.value)} />
                    </Field>
                    <Field label="Dip Before (mm)" required>
                      <Input type="number" step="any" value={c.dip_before_mm ?? ''} onChange={(e) => updateCompartment(idx, 'dip_before_mm', e.target.value)} />
                      <div className="text-[11px] text-slate-400 mt-1">{calc?.vBefore == null ? '—' : `${fmtNum(calc.vBefore, 1)} L`}</div>
                    </Field>
                    <Field label="Dip After (mm)" required>
                      <Input type="number" step="any" value={c.dip_after_mm ?? ''} onChange={(e) => updateCompartment(idx, 'dip_after_mm', e.target.value)} />
                      <div className="text-[11px] text-slate-400 mt-1">{calc?.vAfter == null ? '—' : `${fmtNum(calc.vAfter, 1)} L`}</div>
                    </Field>
                    <div className="flex flex-col justify-end">
                      <div className="text-sm">
                        <span className="text-slate-500">Received: </span>
                        <span className="font-bold text-emerald-600">{calc?.received == null ? '—' : `${fmtNum(calc.received, 1)} L`}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-slate-500">Variance: </span>
                        <span className={`font-bold ${Number(calc?.variance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {calc?.variance == null ? '—' : `${calc.variance >= 0 ? '+' : ''}${fmtNum(calc.variance, 1)} L`}
                        </span>
                      </div>
                      {product && (
                        <div className="text-[11px] text-slate-400 mt-1">Tank product: {product.name}</div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {formErr && <p className="text-sm text-rose-600">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save Unloading'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
