import { useEffect, useState, useMemo } from 'react';
import { CreditCard, CheckCircle2, Clock, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { Badge } from '../../components/ui/Badge';
import { ConfirmModal } from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { apiGet, apiPost, apiPut, apiDelete, fmtMoney, fmtDate } from '../../lib/api';

type PendingRow = {
  daily_sales_entry_id: number;
  sale_date: string;
  shift_name: string;
  operator_name: string;
  dispenser_name: string;
  total_credit_amount: number;
  allocated_amount: number;
  pending_amount: number;
};

type ExistingCredit = {
  id: number;
  sale_date: string;
  daily_sales_entry_id: number;
  customer_name: string;
  amount: number;
  status: string;
  settled_amount: number;
  settlement_remarks?: string;
  remarks?: string;
};

type SettleForm = {
  credit_sale_id: number;
  settle_amount: string;
  settle_method: string;
  settle_date: string;
  remarks: string;
};

export default function CreditSales() {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [existing, setExisting] = useState<ExistingCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    daily_sales_entry_id: '',
    customer_name: '',
    vehicle_no: '',
    product_name: '',
    amount: '',
    remarks: '',
  });
  const [createErr, setCreateErr] = useState('');
  const [createSaving, setCreateSaving] = useState(false);

  // Edit form
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    id: 0,
    sale_date: '',
    customer_name: '',
    vehicle_no: '',
    product_name: '',
    amount: '',
    remarks: '',
  });
  const [editErr, setEditErr] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Pagination (credit sale records)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<ExistingCredit | null>(null);

  // Settle form
  const [showSettle, setShowSettle] = useState(false);
  const [settleForm, setSettleForm] = useState<SettleForm>({
    credit_sale_id: 0,
    settle_amount: '',
    settle_method: 'Cash',
    settle_date: new Date().toISOString().slice(0, 10),
    remarks: '',
  });
  const [settleErr, setSettleErr] = useState('');
  const [settleSaving, setSettleSaving] = useState(false);

  // Filter
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  const loadPending = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterDate) params.set('date_from', filterDate);
      if (filterDate) params.set('date_to', filterDate);
      const result = await apiGet(`/api/credit-sales/pending?${params.toString()}`);
      setPending(result.pending || []);
      setExisting(result.existing || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPending(); }, [filterDate]);

  // Stats
  const totalPending = pending.reduce((s, r) => s + r.pending_amount, 0);
  const totalCredit = existing.reduce((s, c) => s + Number(c.amount || 0), 0);
  const totalSettled = existing.reduce((s, c) => s + Number(c.settled_amount || 0), 0);
  const unsettledCount = existing.filter((c) => c.status !== 'Settled').length;

  // Create
  const openCreate = (row?: PendingRow) => {
    setCreateForm({
      daily_sales_entry_id: row ? String(row.daily_sales_entry_id) : '',
      customer_name: '',
      vehicle_no: '',
      product_name: '',
      amount: row ? String(row.pending_amount) : '',
      remarks: '',
    });
    setCreateErr('');
    setShowCreate(true);
  };

  const saveCreate = async () => {
    setCreateErr('');
    if (!createForm.customer_name.trim()) { setCreateErr('Customer name is required'); return; }
    if (!createForm.amount || Number(createForm.amount) <= 0) { setCreateErr('Amount must be > 0'); return; }
    if (!createForm.remarks.trim()) { setCreateErr('Remarks are required'); return; }
    setCreateSaving(true);
    try {
      await apiPost('/api/credit-sales', {
        sale_date: filterDate || new Date().toISOString().slice(0, 10),
        daily_sales_entry_id: createForm.daily_sales_entry_id ? Number(createForm.daily_sales_entry_id) : null,
        customer_name: createForm.customer_name.trim(),
        vehicle_no: createForm.vehicle_no.trim(),
        product_name: createForm.product_name.trim(),
        amount: Number(createForm.amount),
        status: 'Pending',
        settled_amount: 0,
        remarks: createForm.remarks.trim(),
      });
      setShowCreate(false);
      await loadPending();
    } catch (e: any) {
      setCreateErr(e.message || 'Failed to save');
    } finally {
      setCreateSaving(false);
    }
  };

  // Edit
  const openEdit = (credit: ExistingCredit) => {
    setEditForm({
      id: credit.id,
      sale_date: credit.sale_date || '',
      customer_name: credit.customer_name || '',
      vehicle_no: '',
      product_name: '',
      amount: String(credit.amount || ''),
      remarks: credit.remarks || '',
    });
    setEditErr('');
    setShowEdit(true);
  };

  const saveEdit = async () => {
    setEditErr('');
    if (!editForm.customer_name.trim()) { setEditErr('Customer name is required'); return; }
    if (!editForm.amount || Number(editForm.amount) <= 0) { setEditErr('Amount must be > 0'); return; }
    setEditSaving(true);
    try {
      await apiPut('/api/credit-sales', {
        id: editForm.id,
        sale_date: editForm.sale_date,
        customer_name: editForm.customer_name.trim(),
        amount: Number(editForm.amount),
        remarks: editForm.remarks.trim(),
      });
      setShowEdit(false);
      await loadPending();
    } catch (e: any) {
      setEditErr(e.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  // Delete
  const deleteCredit = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete('/api/credit-sales', { id: deleteTarget.id });
      setDeleteTarget(null);
      await loadPending();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  // Settle
  const openSettle = (credit: ExistingCredit) => {
    const remaining = Number(credit.amount || 0) - Number(credit.settled_amount || 0);
    setSettleForm({
      credit_sale_id: credit.id,
      settle_amount: String(Math.round(remaining * 100) / 100),
      settle_method: 'Cash',
      settle_date: new Date().toISOString().slice(0, 10),
      remarks: '',
    });
    setSettleErr('');
    setShowSettle(true);
  };

  const saveSettle = async () => {
    setSettleErr('');
    const amt = Number(settleForm.settle_amount);
    if (!amt || amt <= 0) { setSettleErr('Amount must be > 0'); return; }
    setSettleSaving(true);
    try {
      await apiPost('/api/credit-sales/settle', {
        id: settleForm.credit_sale_id,
        settled_amount: amt,
        settlement_method: settleForm.settle_method,
        settled_date: settleForm.settle_date,
        remarks: settleForm.remarks.trim(),
      });
      setShowSettle(false);
      await loadPending();
    } catch (e: any) {
      setSettleErr(e.message || 'Settlement failed');
    } finally {
      setSettleSaving(false);
    }
  };

  const statusColor = (s: string) => s === 'Settled' ? 'green' : s === 'Partial' ? 'amber' : 'red';

  // Paginated existing credit records
  const existingTotalPages = Math.max(1, Math.ceil(existing.length / pageSize));
  const paginatedExisting = useMemo(() => {
    const from = (currentPage - 1) * pageSize;
    return existing.slice(from, from + pageSize);
  }, [existing, currentPage, pageSize]);

  const handleExistingPageChange = (page: number) => setCurrentPage(page);
  const handleExistingPageSizeChange = (size: number) => { setPageSize(size); setCurrentPage(1); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-5 h-5 text-indigo-600" /> Credit Sales</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track and settle credit sales from daily entries</p>
        </div>
        <button onClick={() => openCreate()} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">+ New Credit Sale</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center"><Clock className="w-4 h-4 text-orange-600" /></div>
          <div><div className="text-xs text-slate-400">Pending (Today)</div><div className="text-lg font-bold text-slate-800">{fmtMoney(totalPending)}</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center"><CreditCard className="w-4 h-4 text-indigo-600" /></div>
          <div><div className="text-xs text-slate-400">Total Credit</div><div className="text-lg font-bold text-slate-800">{fmtMoney(totalCredit)}</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
          <div><div className="text-xs text-slate-400">Total Settled</div><div className="text-lg font-bold text-slate-800">{fmtMoney(totalSettled)}</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-rose-600" /></div>
          <div><div className="text-xs text-slate-400">Unsettled Records</div><div className="text-lg font-bold text-slate-800">{unsettledCount}</div></div>
        </Card>
      </div>

      {/* Date filter */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Field label="Filter by Date">
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </Field>
        </div>
      </Card>

      {/* Pending from daily sales */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Pending Credit from Daily Sales</h3>
        {loading ? <p className="text-sm text-slate-400">Loading...</p> : error ? <p className="text-sm text-rose-600">{error}</p> : pending.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No pending credit amounts for this date</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Shift</th>
                  <th className="px-3 py-2 text-left">Operator</th>
                  <th className="px-3 py-2 text-right">Total Credit</th>
                  <th className="px-3 py-2 text-right">Allocated</th>
                  <th className="px-3 py-2 text-right">Pending</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pending.map((row) => (
                  <tr key={row.daily_sales_entry_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-700">{fmtDate(row.sale_date)}</td>
                    <td className="px-3 py-2 text-slate-600">{row.shift_name || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{row.operator_name || '—'}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(row.total_credit_amount)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(row.allocated_amount)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-600">{fmtMoney(row.pending_amount)}</td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => openCreate(row)} className="text-xs text-indigo-600 hover:underline font-medium">Create Record</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Existing credit records */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">
          Credit Sale Records {existing.length > 0 && <span className="text-slate-400 font-normal">({existing.length})</span>}
        </h3>
        {existing.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No credit sale records yet</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Settled</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedExisting.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{fmtDate(c.sale_date)}</td>
                      <td className="px-3 py-2 text-slate-700 font-medium">{c.customer_name}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.amount)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.settled_amount || 0)}</td>
                      <td className="px-3 py-2 text-center"><Badge color={statusColor(c.status)}>{c.status}</Badge></td>
                      <td className="px-3 py-2 text-center">
                        <div className="inline-flex items-center gap-1">
                          {c.status !== 'Settled' && (
                            <>
                              <button onClick={() => openSettle(c)} className="text-xs text-emerald-600 hover:underline font-medium">Settle</button>
                              <button onClick={() => openEdit(c)} className="p-1 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteTarget(c)} className="p-1 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={existingTotalPages}
              totalItems={existing.length}
              pageSize={pageSize}
              onPageChange={handleExistingPageChange}
              onPageSizeChange={handleExistingPageSizeChange}
            />
          </>
        )}
      </Card>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">New Credit Sale</h3>
            <Field label="Customer Name" required>
              <Input value={createForm.customer_name} onChange={(e) => setCreateForm({ ...createForm, customer_name: e.target.value })} placeholder="Customer name" />
            </Field>
            <Field label="Vehicle No.">
              <Input value={createForm.vehicle_no} onChange={(e) => setCreateForm({ ...createForm, vehicle_no: e.target.value })} placeholder="e.g. MH-12-AB-1234" />
            </Field>
            <Field label="Product">
              <Input value={createForm.product_name} onChange={(e) => setCreateForm({ ...createForm, product_name: e.target.value })} placeholder="e.g. Petrol" />
            </Field>
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={createForm.amount} onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })} />
            </Field>
            <Field label="Remarks" required>
              <Input value={createForm.remarks} onChange={(e) => setCreateForm({ ...createForm, remarks: e.target.value })} placeholder="e.g. Fleet refueling" />
            </Field>
            {createErr && <p className="text-sm text-rose-600">{createErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveCreate} disabled={createSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">{createSaving ? 'Saving...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Edit Credit Sale</h3>
            <Field label="Customer Name" required>
              <Input value={editForm.customer_name} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} placeholder="Customer name" />
            </Field>
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
            </Field>
            <Field label="Remarks">
              <Input value={editForm.remarks} onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })} placeholder="Remarks" />
            </Field>
            {editErr && <p className="text-sm text-rose-600">{editErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60">{editSaving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Settle modal */}
      {showSettle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowSettle(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Settle Credit Sale</h3>
            <Field label="Settlement Date">
              <Input type="date" value={settleForm.settle_date} onChange={(e) => setSettleForm({ ...settleForm, settle_date: e.target.value })} />
            </Field>
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={settleForm.settle_amount} onChange={(e) => setSettleForm({ ...settleForm, settle_amount: e.target.value })} />
            </Field>
            <Field label="Settlement Method" required>
              <Select value={settleForm.settle_method} onChange={(e) => setSettleForm({ ...settleForm, settle_method: e.target.value })}>
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </Select>
            </Field>
            <Field label="Remarks">
              <Input value={settleForm.remarks} onChange={(e) => setSettleForm({ ...settleForm, remarks: e.target.value })} placeholder="e.g. Payment received via UPI" />
            </Field>
            <p className="text-xs text-slate-500">Settlement is for record tracking only and does not affect Finance Management.</p>
            {settleErr && <p className="text-sm text-rose-600">{settleErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSettle(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveSettle} disabled={settleSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">{settleSaving ? 'Saving...' : 'Settle'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteCredit}
        title="Delete Credit Sale"
        message={deleteTarget ? `Are you sure you want to delete the credit sale record for ${deleteTarget.customer_name} (${fmtMoney(deleteTarget.amount)})? This action cannot be undone.` : ''}
      />
    </div>
  );
}
