import { useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronUp, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import Modal, { ConfirmModal } from '../../components/ui/Modal';
import { Field, Input, Select } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { apiDelete, apiGet, apiPost, apiPut, fmtMoney, fmtNum, fmtDate } from '../../lib/api';

type EntryRow = {
  nozzle_name: string;
  opening_reading?: string;
  closing_reading: string;
  testing_volume: string;
  remarks: string;
};

export default function Sales() {
  const [entries, setEntries] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [dispensers, setDispensers] = useState<any[]>([]);
  const [nozzles, setNozzles] = useState<any[]>([]);
  const [meters, setMeters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const [form, setForm] = useState<any>({
    sale_date: new Date().toISOString().slice(0, 10),
    shift_name: '',
    operator_name: '',
    dispenser_name: '',
    cash_amount: '',
    online_amount: '',
    credit_amount: '',
  });
  const [entryRows, setEntryRows] = useState<EntryRow[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [e, p, ph, o, sh, d, n, m] = await Promise.all([
        apiGet('/api/daily-sales'),
        apiGet('/api/products'),
        apiGet('/api/price-history'),
        apiGet('/api/operators'),
        apiGet('/api/shifts'),
        apiGet('/api/dispensers'),
        apiGet('/api/nozzles'),
        apiGet('/api/meters'),
      ]);
      setEntries(e || []);
      setProducts(p || []);
      setPriceHistory(ph || []);
      setOperators(o || []);
      setShifts(sh || []);
      setDispensers(d || []);
      setNozzles(n || []);
      setMeters(m || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const meterMap = useMemo(() => new Map(meters.map((m) => [m.nozzle_name, m])), [meters]);
  const nozzleMap = useMemo(() => new Map(nozzles.map((n) => [n.name, n])), [nozzles]);
  const priceMap = useMemo(() => {
    const targetDate = form.sale_date || new Date().toISOString().slice(0, 10);
    const map = new Map<string, number>();
    const fallbackByProduct = new Map(products.map((p) => [String(p.name || '').trim(), Number(p.current_price || 0)]));
    const historyByProduct = new Map<string, any[]>();

    [...priceHistory]
      .sort((a, b) => {
        const byDate = String(a.effective_date || '').localeCompare(String(b.effective_date || ''));
        if (byDate !== 0) return byDate;
        return Number(a.id || 0) - Number(b.id || 0);
      })
      .forEach((row) => {
        const productName = String(row.product_name || '').trim();
        if (!productName) return;
        if (!historyByProduct.has(productName)) historyByProduct.set(productName, []);
        historyByProduct.get(productName)!.push(row);
      });

    const productNames = new Set([...fallbackByProduct.keys(), ...historyByProduct.keys()]);
    productNames.forEach((productName) => {
      const history = historyByProduct.get(productName) || [];
      const fallbackPrice = Number(fallbackByProduct.get(productName) || 0);
      if (history.length === 0) {
        map.set(productName, fallbackPrice);
        return;
      }

      let resolvedPrice = Number(history[0]?.old_price ?? fallbackPrice);
      if (!Number.isFinite(resolvedPrice)) resolvedPrice = fallbackPrice;

      history.forEach((row) => {
        if (String(row.effective_date || '') <= targetDate) {
          resolvedPrice = Number(row.new_price || 0);
        }
      });

      map.set(productName, resolvedPrice);
    });

    return map;
  }, [products, priceHistory, form.sale_date]);
  const activeDispensers = useMemo(
    () => dispensers.filter((d) => d.status === 'Operational' || d.status === 'Active' || d.status == null),
    [dispensers],
  );
  const activeOperators = useMemo(
    () => operators.filter((o) => o.active !== false),
    [operators],
  );
  const selectedNozzles = useMemo(
    () => nozzles.filter((n) => n.dispenser_name === form.dispenser_name && (n.status === 'Active' || n.status == null)),
    [nozzles, form.dispenser_name],
  );

  const assignedEntriesForShift = useMemo(
    () => entries.filter((e) => e.id !== editingEntryId && e.sale_date === form.sale_date && e.shift_name === form.shift_name),
    [entries, editingEntryId, form.sale_date, form.shift_name],
  );
  const assignedOperatorNames = useMemo(
    () => new Set(assignedEntriesForShift.map((e) => e.operator_name)),
    [assignedEntriesForShift],
  );
  const assignedDispenserNames = useMemo(
    () => new Set(assignedEntriesForShift.map((e) => e.dispenser_name).filter(Boolean)),
    [assignedEntriesForShift],
  );
  const availableOperators = useMemo(
    () => activeOperators.filter((o) => o.name === form.operator_name || !assignedOperatorNames.has(o.name)),
    [activeOperators, assignedOperatorNames, form.operator_name],
  );
  const availableDispensers = useMemo(
    () => activeDispensers.filter((d) => d.name === form.dispenser_name || !assignedDispenserNames.has(d.name)),
    [activeDispensers, assignedDispenserNames, form.dispenser_name],
  );

  const syncEntryRowsForDispenser = (dispenserName: string) => {
    const rows = nozzles
      .filter((n) => n.dispenser_name === dispenserName && (n.status === 'Active' || n.status == null))
      .map((n) => {
        const existing = entryRows.find((row) => row.nozzle_name === n.name);
        return existing || { nozzle_name: n.name, opening_reading: '', closing_reading: '', testing_volume: '', remarks: '' };
      });
    setEntryRows(rows);
  };

  const editableEntryIds = useMemo(() => {
    const latestByDispenser = new Map<string, number>();
    const sorted = [...entries].sort((a, b) => {
      const byDate = String(b.sale_date || '').localeCompare(String(a.sale_date || ''));
      if (byDate !== 0) return byDate;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    sorted.forEach((entry) => {
      const dispenserName = String(entry.dispenser_name || '');
      if (dispenserName && !latestByDispenser.has(dispenserName)) {
        latestByDispenser.set(dispenserName, Number(entry.id || 0));
      }
    });
    return new Set(latestByDispenser.values());
  }, [entries]);

  const updateEntryRow = (idx: number, key: keyof EntryRow, value: string) => {
    const next = [...entryRows];
    next[idx] = { ...next[idx], [key]: value };
    setEntryRows(next);
  };

  const calculations = useMemo(() => {
    const readings = entryRows.map((row) => {
      const nozzle = nozzleMap.get(row.nozzle_name);
      const meter = meterMap.get(row.nozzle_name);
      const opening = row.opening_reading != null && row.opening_reading !== '' ? Number(row.opening_reading) : Number(meter?.current_reading || 0);
      const closing = row.closing_reading === '' ? null : Number(row.closing_reading);
      const grossVolume = closing == null || !Number.isFinite(closing) ? 0 : Math.max(0, closing - opening);
      const testingVolume = Number(row.testing_volume || 0);
      const netVolume = Math.max(0, grossVolume - testingVolume);
      const productName = nozzle?.product_name || '';
      const unitPrice = Number(priceMap.get(productName) ?? 0);
      const grossAmount = grossVolume * unitPrice;
      const testingAmount = testingVolume * unitPrice;
      const netAmount = netVolume * unitPrice;
      return {
        nozzle_name: row.nozzle_name,
        product_name: productName,
        tank_name: nozzle?.tank_name || null,
        dispenser_name: nozzle?.dispenser_name || null,
        opening,
        closing,
        volume: grossVolume,
        testing_volume: testingVolume,
        net_volume: netVolume,
        unit_price: unitPrice,
        amount: grossAmount,
        testing_amount: testingAmount,
        net_amount: netAmount,
        remarks: row.remarks,
      };
    });

    const testing = readings
      .filter((r) => r.testing_volume > 0)
      .map((r) => ({
        nozzle_name: r.nozzle_name,
        tank_name: r.tank_name,
        product_name: r.product_name,
        volume: r.testing_volume,
        unit_price: r.unit_price,
        amount: r.testing_amount,
        remarks: r.remarks || null,
      }));

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
      byProduct[r.product_name].volume += Number(r.net_volume || 0);
      byProduct[r.product_name].amount += Number(r.net_amount || 0);
    });
    testing.forEach((t) => {
      if (!t.product_name) return;
      byProduct[t.product_name] = byProduct[t.product_name] || { volume: 0, testVol: 0, price: t.unit_price, amount: 0 };
      byProduct[t.product_name].testVol += Number(t.volume || 0);
    });

    return { readings, testing, byProduct, grossAmount, testingDeduction, totalSalesAmount, totalSubmitted, variance };
  }, [entryRows, nozzleMap, meterMap, priceMap, form.cash_amount, form.online_amount, form.credit_amount]);

  const openCreate = () => {
    setEditingEntryId(null);
    setForm({
      sale_date: new Date().toISOString().slice(0, 10),
      shift_name: '',
      operator_name: '',
      dispenser_name: '',
      cash_amount: '',
      online_amount: '',
      credit_amount: '',
    });
    setEntryRows([]);
    setFormErr('');
    setShowAdd(true);
  };

  const openEdit = (entry: any) => {
    setEditingEntryId(Number(entry.id));
    setForm({
      sale_date: entry.sale_date || '',
      shift_name: entry.shift_name || '',
      operator_name: entry.operator_name || '',
      dispenser_name: entry.dispenser_name || '',
      cash_amount: String(entry.cash_amount ?? ''),
      online_amount: String(entry.online_amount ?? ''),
      credit_amount: String(entry.credit_amount ?? ''),
    });
    setEntryRows((entry.daily_sales_nozzle_readings || []).map((reading: any) => {
      const testing = (entry.daily_sales_testing || []).find((row: any) => row.nozzle_name === reading.nozzle_name);
      return {
        nozzle_name: reading.nozzle_name,
        opening_reading: String(reading.opening_reading ?? ''),
        closing_reading: String(reading.closing_reading ?? ''),
        testing_volume: testing ? String(testing.volume ?? '') : '',
        remarks: testing?.remarks || '',
      };
    }));
    setFormErr('');
    setShowAdd(true);
  };

  const closeModal = () => {
    setShowAdd(false);
    setEditingEntryId(null);
    setFormErr('');
  };

  const save = async () => {
    setFormErr('');
    if (!form.sale_date || !form.shift_name || !form.operator_name || !form.dispenser_name) {
      setFormErr('Sale date, shift, operator and dispenser are required');
      return;
    }
    if (!editingEntryId && assignedDispenserNames.has(form.dispenser_name)) {
      setFormErr(`Sales already entered for dispenser ${form.dispenser_name} in ${form.shift_name} shift on ${form.sale_date}`);
      return;
    }
    if (assignedOperatorNames.has(form.operator_name)) {
      setFormErr(`Operator ${form.operator_name} is already assigned in ${form.shift_name} shift on ${form.sale_date}`);
      return;
    }
    if (selectedNozzles.length === 0) {
      setFormErr('No active nozzles found for the selected dispenser');
      return;
    }
    if (entryRows.length !== selectedNozzles.length) {
      setFormErr('Reload the dispenser selection and enter all active nozzles');
      return;
    }
    if (entryRows.some((row) => row.closing_reading === '' || !Number.isFinite(Number(row.closing_reading)))) {
      setFormErr('Enter closing reading for all active nozzles of the selected dispenser');
      return;
    }
    if (calculations.readings.some((row) => Number(row.testing_volume || 0) > Number(row.volume || 0))) {
      setFormErr('Testing quantity cannot be greater than dispensed quantity for any nozzle');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sale_date: form.sale_date,
        shift_name: form.shift_name,
        operator_name: form.operator_name,
        dispenser_name: form.dispenser_name,
        cash_amount: form.cash_amount === '' ? 0 : Number(form.cash_amount),
        online_amount: form.online_amount === '' ? 0 : Number(form.online_amount),
        credit_amount: form.credit_amount === '' ? 0 : Number(form.credit_amount),
        nozzle_readings: entryRows.map((row) => ({ nozzle_name: row.nozzle_name, closing_reading: Number(row.closing_reading) })),
        testing_volumes: entryRows
          .filter((row) => Number(row.testing_volume || 0) > 0)
          .map((row) => ({ nozzle_name: row.nozzle_name, volume: Number(row.testing_volume || 0), remarks: row.remarks || null })),
      };
      if (editingEntryId) {
        await apiPut('/api/daily-sales', { id: editingEntryId, ...payload });
      } else {
        await apiPost('/api/daily-sales', payload);
      }
      closeModal();
      await load();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to submit sales entry');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entryId: number) => {
    try {
      await apiDelete('/api/daily-sales', { id: entryId });
      setDeleteTarget(null);
      if (expandedId === entryId) setExpandedId(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to delete sales entry');
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
            const canMutate = editableEntryIds.has(Number(entry.id || 0));
            return (
              <Card key={entry.id} className="overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : entry.id)} className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50">
                  <div className="text-left">
                    <p className="font-semibold text-slate-800">{fmtDate(entry.sale_date)} • {entry.shift_name} • {entry.operator_name} • {entry.dispenser_name || 'Dispenser not set'}</p>
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
                      <div className="text-xs text-slate-500">
                        {canMutate ? 'This is the latest sales entry for the dispenser, so it can be corrected if needed.' : 'Only the latest sales entry for each dispenser can be edited or deleted, to avoid breaking later meter and stock flow.'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(entry)}
                          disabled={!canMutate}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Pencil className="w-4 h-4" /> Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(entry)}
                          disabled={!canMutate}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </div>

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
                            <th className="px-3 py-2 text-right">Dispensed</th>
                            <th className="px-3 py-2 text-right">Testing</th>
                            <th className="px-3 py-2 text-right">Net Sale</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Net Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(entry.daily_sales_nozzle_readings || []).map((r: any) => {
                            const testingByNozzle = (entry.daily_sales_testing || []).find((t: any) => t.nozzle_name === r.nozzle_name);
                            const testingVolume = Number(testingByNozzle?.volume || 0);
                            const netVolume = Math.max(0, Number(r.volume || 0) - testingVolume);
                            const netAmount = Number(r.amount || 0) - Number(testingByNozzle?.amount || 0);
                            return (
                            <tr key={r.id}>
                              <td className="px-3 py-2 text-slate-700">{r.nozzle_name}</td>
                              <td className="px-3 py-2"><Badge color="blue">{r.product_name}</Badge></td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmtNum(r.opening_reading, 2)}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmtNum(r.closing_reading, 2)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtNum(r.volume, 2)} L</td>
                              <td className="px-3 py-2 text-right text-amber-600">{fmtNum(testingVolume, 2)} L</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtNum(netVolume, 2)} L</td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmtMoney(r.unit_price)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmtMoney(netAmount)}</td>
                            </tr>
                          )})}
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

      <Modal open={showAdd} onClose={closeModal} title={editingEntryId ? 'Edit Daily Sales' : 'Record Daily Sales'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Date" required>
              <Input type="date" value={form.sale_date || ''} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} disabled={Boolean(editingEntryId)} />
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
                {availableOperators.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
              </Select>
            </Field>
            <Field label="Dispenser" required>
              <Select value={form.dispenser_name || ''} onChange={(e) => {
                const dispenserName = e.target.value;
                setForm({ ...form, dispenser_name: dispenserName });
                syncEntryRowsForDispenser(dispenserName);
              }} disabled={Boolean(editingEntryId)}>
                <option value="">Select…</option>
                {availableDispensers.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </Select>
            </Field>
          </div>

          {form.shift_name && form.sale_date && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {assignedDispenserNames.has(form.dispenser_name) && form.dispenser_name && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This dispenser already has a sales entry for the selected date and shift.
                </div>
              )}
              {assignedOperatorNames.has(form.operator_name) && form.operator_name && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This operator is already assigned for the selected date and shift.
                </div>
              )}
            </div>
          )}

          {!form.dispenser_name ? (
            <Card className="p-8 text-center text-sm text-slate-400">
              Select a dispenser to load only its active nozzles for sales entry.
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Enter each nozzle as a separate card. Opening, closing, testing, net sale and amount stay visible while typing.
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {entryRows.map((row, idx) => {
                  const nozzle = nozzleMap.get(row.nozzle_name);
                  const meter = meterMap.get(row.nozzle_name);
                  const opening = row.opening_reading != null && row.opening_reading !== '' ? Number(row.opening_reading) : Number(meter?.current_reading || 0);
                  const closing = row.closing_reading === '' ? opening : Number(row.closing_reading);
                  const dispensed = Math.max(0, closing - opening);
                  const testing = Number(row.testing_volume || 0);
                  const netVolume = Math.max(0, dispensed - testing);
                  const price = Number(priceMap.get(nozzle?.product_name || '') ?? 0);
                  const amount = netVolume * price;
                  return (
                    <Card key={row.nozzle_name} className="p-4 border-slate-200">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-slate-800">{row.nozzle_name}</div>
                          <div className="text-xs text-slate-500 mt-1">{nozzle?.dispenser_name || form.dispenser_name}</div>
                        </div>
                        <Badge color="blue">{nozzle?.product_name || '—'}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-xs text-slate-400">Opening Reading</div>
                          <div className="text-lg font-bold text-slate-800 mt-1">{fmtNum(opening, 2)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-3">
                          <div className="text-xs text-slate-400">Rate</div>
                          <div className="text-lg font-bold text-slate-800 mt-1">{fmtMoney(price)}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                        <Field label="Closing Reading" required>
                          <Input
                            type="number"
                            step="0.01"
                            value={row.closing_reading}
                            onChange={(e) => updateEntryRow(idx, 'closing_reading', e.target.value)}
                          />
                        </Field>
                        <Field label="Testing Quantity (L)">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.testing_volume}
                            onChange={(e) => updateEntryRow(idx, 'testing_volume', e.target.value)}
                          />
                        </Field>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="rounded-lg bg-slate-50 p-3 text-center">
                          <div className="text-xs text-slate-400">Dispensed</div>
                          <div className="text-lg font-bold text-slate-800 mt-1">{fmtNum(dispensed, 2)} L</div>
                        </div>
                        <div className="rounded-lg bg-amber-50 p-3 text-center">
                          <div className="text-xs text-amber-700">Testing</div>
                          <div className="text-lg font-bold text-amber-700 mt-1">{fmtNum(testing, 2)} L</div>
                        </div>
                        <div className="rounded-lg bg-emerald-50 p-3 text-center">
                          <div className="text-xs text-emerald-700">Net Sale</div>
                          <div className="text-lg font-bold text-emerald-700 mt-1">{fmtNum(netVolume, 2)} L</div>
                        </div>
                      </div>

                      <div className="rounded-lg bg-emerald-50 p-3 mt-4">
                        <div className="text-xs text-emerald-700">Net Amount</div>
                        <div className="text-2xl font-bold text-emerald-700 mt-1">{fmtMoney(amount)}</div>
                      </div>

                      <div className="mt-4">
                        <Field label="Remarks">
                          <Input value={row.remarks} onChange={(e) => updateEntryRow(idx, 'remarks', e.target.value)} placeholder="Optional remarks for testing or special case" />
                        </Field>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <div className="text-xs text-slate-400">Gross Amount</div>
                <div className="text-lg font-bold text-slate-800">{fmtMoney(calculations.grossAmount)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Testing Deduction</div>
                <div className="text-lg font-bold text-amber-600">-{fmtMoney(calculations.testingDeduction)}</div>
              </div>
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

          {calculations.readings.some((row) => Number(row.unit_price || 0) <= 0 && Number(row.volume || 0) > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              One or more nozzle products do not have an effective selling price for the selected sale date. Check `Price History` or `Products` master price.
            </div>
          )}

          {formErr && <p className="text-sm text-rose-600">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : editingEntryId ? 'Save Changes' : 'Submit Entry'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteEntry(Number(deleteTarget.id))}
        title="Delete Sales Entry"
        message={deleteTarget ? `Delete the sales entry for ${fmtDate(deleteTarget.sale_date)} / ${deleteTarget.shift_name} / ${deleteTarget.dispenser_name}? This should only be used to correct a human entry mistake.` : ''}
      />
    </div>
  );
}
