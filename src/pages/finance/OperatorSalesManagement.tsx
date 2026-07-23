import { useEffect, useState, useMemo, useCallback } from 'react';
import { ClipboardList, Filter, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { ConfirmModal } from '../../components/ui/Modal';
import { apiGet, apiPost, apiPut, apiDelete, fmtMoney, fmtDate } from '../../lib/api';

type SettlementStatus = 'open' | 'settled';

export default function OperatorSalesManagement() {
  const [settlements, setSettlements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Master data for filter dropdowns
  const [masterOperators, setMasterOperators] = useState<string[]>([]);
  const [masterShifts, setMasterShifts] = useState<string[]>([]);

  // Create/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formData, setFormData] = useState({
    id: 0,
    sale_date: new Date().toISOString().slice(0, 10),
    shift_name: '',
    operator_name: '',
    dispenser_name: '',
    total_sales_amount: '0',
    submitted_amount: '0',
    deduction_amount: '0',
    net_payable: '0',
    status: 'open' as SettlementStatus,
    remarks: '',
  });
  const [formErr, setFormErr] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  // Seed from daily sales
  const [seeding, setSeeding] = useState(false);

  const loadMasters = useCallback(async () => {
    try {
      const [ops, shifts] = await Promise.all([
        apiGet<any[]>('/api/operators'),
        apiGet<any[]>('/api/shifts'),
      ]);
      setMasterOperators((ops || []).map((o: any) => o.name).sort());
      setMasterShifts((shifts || []).map((s: any) => s.name).sort());
    } catch (_) { /* non-critical */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (filterOperator) params.set('operator_name', filterOperator);
      if (filterShift) params.set('shift_name', filterShift);
      if (filterStatus) params.set('status', filterStatus);
      const res = await apiGet(`/api/operator-sales${params.toString() ? `?${params.toString()}` : ''}`);
      setSettlements(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, filterOperator, filterShift, filterStatus]);

  useEffect(() => { loadMasters(); }, [loadMasters]);
  useEffect(() => { load(); }, [load]);

  // Derived totals
  const totals = useMemo(() => {
    let totalSales = 0, totalSubmitted = 0, totalVariance = 0, totalDeduction = 0, totalNet = 0;
    for (const s of settlements) {
      totalSales += Number(s.total_sales_amount || 0);
      totalSubmitted += Number(s.submitted_amount || 0);
      totalVariance += Number(s.variance || 0);
      totalDeduction += Number(s.deduction_amount || 0);
      totalNet += Number(s.net_payable || 0);
    }
    return { totalSales, totalSubmitted, totalVariance, totalDeduction, totalNet };
  }, [settlements]);

  // Open create form
  const openCreate = () => {
    setFormData({
      id: 0, sale_date: new Date().toISOString().slice(0, 10),
      shift_name: '', operator_name: '', dispenser_name: '',
      total_sales_amount: '0', submitted_amount: '0',
      deduction_amount: '0', net_payable: '0',
      status: 'open', remarks: '',
    });
    setFormMode('create');
    setFormErr('');
    setShowForm(true);
  };

  // Open edit form
  const openEdit = (s: any) => {
    setFormData({
      id: s.id,
      sale_date: s.sale_date,
      shift_name: s.shift_name || '',
      operator_name: s.operator_name || '',
      dispenser_name: s.dispenser_name || '',
      total_sales_amount: String(s.total_sales_amount || '0'),
      submitted_amount: String(s.submitted_amount || '0'),
      deduction_amount: String(s.deduction_amount || '0'),
      net_payable: String(s.net_payable || '0'),
      status: s.status || 'open',
      remarks: s.remarks || '',
    });
    setFormMode('edit');
    setFormErr('');
    setShowForm(true);
  };

  // Recompute net_payable whenever submitted_amount or deduction_amount changes
  const updateFormField = (field: string, value: string) => {
    const updated = { ...formData, [field]: value };
    if (field === 'submitted_amount' || field === 'deduction_amount') {
      const submitted = Number(updated.submitted_amount) || 0;
      const deduction = Number(updated.deduction_amount) || 0;
      updated.net_payable = String(Math.round((submitted - deduction) * 100) / 100);
    }
    setFormData(updated);
  };

  // Save (create or update)
  const handleSave = async () => {
    setFormErr('');
    if (!formData.sale_date) { setFormErr('Sale date is required'); return; }
    if (!formData.shift_name) { setFormErr('Shift is required'); return; }
    if (!formData.operator_name) { setFormErr('Operator is required'); return; }
    if (!formData.dispenser_name) { setFormErr('Dispenser is required'); return; }

    setFormSaving(true);
    try {
      if (formMode === 'create') {
        await apiPost('/api/operator-sales', {
          sale_date: formData.sale_date,
          shift_name: formData.shift_name,
          operator_name: formData.operator_name,
          dispenser_name: formData.dispenser_name,
          total_sales_amount: Number(formData.total_sales_amount),
          submitted_amount: Number(formData.submitted_amount),
          deduction_amount: Number(formData.deduction_amount),
          status: formData.status,
          remarks: formData.remarks,
        });
      } else {
        await apiPut('/api/operator-sales', {
          id: formData.id,
          total_sales_amount: Number(formData.total_sales_amount),
          submitted_amount: Number(formData.submitted_amount),
          deduction_amount: Number(formData.deduction_amount),
          status: formData.status,
          remarks: formData.remarks,
        });
      }
      setShowForm(false);
      setSuccess(formMode === 'create' ? 'Settlement created successfully' : 'Settlement updated successfully');
      await load();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to save');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete('/api/operator-sales', { id: deleteTarget.id });
      setDeleteTarget(null);
      setSuccess('Settlement deleted successfully');
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  // Seed from daily_sales_entries
  const handleSeed = async () => {
    setSeeding(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await apiPost('/api/operator-sales/seed', params);
      setSuccess(`Seeded ${res.inserted} new settlements (${res.skipped} skipped)`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to seed');
    } finally {
      setSeeding(false);
    }
  };

  // Quick settle/unsettle toggle
  const toggleStatus = async (s: any) => {
    try {
      const newStatus = s.status === 'settled' ? 'open' : 'settled';
      await apiPut('/api/operator-sales', { id: s.id, status: newStatus });
      setSuccess(`Settlement ${newStatus === 'settled' ? 'closed' : 're-opened'}`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">{error} <button onClick={() => { setError(''); load(); }} className="underline ml-2">Retry</button></div>}
      {success && <div className="rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 text-sm">{success} <button onClick={() => setSuccess('')} className="underline ml-2">Dismiss</button></div>}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-indigo-600" /> Operator Sales Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage operator sales, submitted amounts, variance, deductions, and close-out</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleSeed} disabled={seeding} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw className={`w-4 h-4 ${seeding ? 'animate-spin' : ''}`} /> {seeding ? 'Seeding...' : 'Seed from Sales'}
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> Add Settlement
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Date From">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="Date To">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
          <Field label="Operator">
            <Select value={filterOperator} onChange={(e) => setFilterOperator(e.target.value)}>
              <option value="">All Operators</option>
              {masterOperators.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Shift">
            <Select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
              <option value="">All Shifts</option>
              {masterShifts.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="settled">Settled</option>
            </Select>
          </Field>
        </div>
      </Card>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Sales (Meter)</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(totals.totalSales)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Submitted</div>
          <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(totals.totalSubmitted)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Variance</div>
          <div className={`text-lg font-bold mt-0.5 ${totals.totalVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {totals.totalVariance >= 0 ? '+' : ''}{fmtMoney(totals.totalVariance)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Deduction</div>
          <div className="text-lg font-bold text-rose-600 mt-0.5">{fmtMoney(totals.totalDeduction)}</div>
        </Card>
        <Card className="p-3 border-2 border-indigo-200 bg-indigo-50">
          <div className="text-[10px] text-indigo-500 uppercase tracking-wider">Net Payable</div>
          <div className="text-lg font-bold text-indigo-700 mt-0.5">{fmtMoney(totals.totalNet)}</div>
        </Card>
      </div>

      {/* ── Settlements Table ── */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">
          Settlement Records {settlements.length > 0 && <span className="text-slate-400 font-normal">({settlements.length})</span>}
        </h3>
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
        ) : settlements.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-slate-400">No settlement records found</p>
            <p className="text-xs text-slate-400 mt-1">Use <strong>Seed from Sales</strong> to pull data from daily sales entries, or <strong>Add Settlement</strong> to create one manually</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Shift</th>
                  <th className="px-3 py-2 text-left">Operator</th>
                  <th className="px-3 py-2 text-left">Dispenser</th>
                  <th className="px-3 py-2 text-right">Meter Sales</th>
                  <th className="px-3 py-2 text-right">Submitted</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="px-3 py-2 text-right">Deduction</th>
                  <th className="px-3 py-2 text-right">Net Payable</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Remarks</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{fmtDate(s.sale_date)}</td>
                    <td className="px-3 py-2 text-slate-600">{s.shift_name}</td>
                    <td className="px-3 py-2 text-slate-700 font-medium">{s.operator_name}</td>
                    <td className="px-3 py-2 text-slate-600">{s.dispenser_name}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtMoney(s.total_sales_amount)}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtMoney(s.submitted_amount)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${Number(s.variance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {Number(s.variance || 0) >= 0 ? '+' : ''}{fmtMoney(s.variance)}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-600">{fmtMoney(s.deduction_amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-indigo-700">{fmtMoney(s.net_payable)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleStatus(s)}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          s.status === 'settled' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {s.status === 'settled' ? 'Settled' : 'Open'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs max-w-[140px] truncate">{s.remarks || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteTarget(s)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Create/Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">{formMode === 'create' ? 'New Settlement' : 'Edit Settlement'}</h3>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required>
                <Input type="date" value={formData.sale_date} onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })} disabled={formMode === 'edit'} />
              </Field>
              <Field label="Status">
                <Select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as SettlementStatus })}>
                  <option value="open">Open</option>
                  <option value="settled">Settled</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Shift" required>
                <Select value={formData.shift_name} onChange={(e) => setFormData({ ...formData, shift_name: e.target.value })} disabled={formMode === 'edit'}>
                  <option value="">Select</option>
                  {masterShifts.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Operator" required>
                <Select value={formData.operator_name} onChange={(e) => setFormData({ ...formData, operator_name: e.target.value })} disabled={formMode === 'edit'}>
                  <option value="">Select</option>
                  {masterOperators.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label="Dispenser" required>
                <Input value={formData.dispenser_name} onChange={(e) => setFormData({ ...formData, dispenser_name: e.target.value })} disabled={formMode === 'edit'} placeholder="e.g. D1" />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Meter Sales">
                <Input type="number" step="0.01" value={formData.total_sales_amount} onChange={(e) => updateFormField('total_sales_amount', e.target.value)} disabled={formMode === 'edit'} />
              </Field>
              <Field label="Submitted Amount" required>
                <Input type="number" step="0.01" value={formData.submitted_amount} onChange={(e) => updateFormField('submitted_amount', e.target.value)} />
              </Field>
              <Field label="Deduction">
                <Input type="number" step="0.01" value={formData.deduction_amount} onChange={(e) => updateFormField('deduction_amount', e.target.value)} />
              </Field>
            </div>

            <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2">
              <span className="text-sm font-semibold text-slate-700">Net Payable:</span>
              <span className="text-lg font-bold text-indigo-700">{fmtMoney(Number(formData.net_payable) || 0)}</span>
            </div>

            <Field label="Remarks">
              <Input value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value })} placeholder="Optional remarks" />
            </Field>

            {formErr && <p className="text-sm text-rose-600">{formErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={handleSave} disabled={formSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">
                {formSaving ? 'Saving...' : formMode === 'create' ? 'Create Settlement' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Settlement"
        message={deleteTarget ? `Are you sure you want to delete the settlement for ${deleteTarget.operator_name} on ${fmtDate(deleteTarget.sale_date)} (${deleteTarget.shift_name}, ${deleteTarget.dispenser_name})?` : ''}
      />
    </div>
  );
}
