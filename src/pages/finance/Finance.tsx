import { useEffect, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { ConfirmModal } from '../../components/ui/Modal';
import { apiGet, apiPost, apiPut, apiDelete, fmtMoney, fmtDate } from '../../lib/api';

const DEPOSIT_ROWS = [
  { category: 'Online', sub_category: 'Paytm' },
  { category: 'Online', sub_category: 'DTA' },
  { category: 'Online', sub_category: 'HP Pay' },
  { category: 'Online', sub_category: 'OTP' },
  { category: 'Online', sub_category: 'Personal Account' },
  { category: 'Online', sub_category: 'Others' },
  { category: 'Cash', sub_category: 'Cash' },
  { category: 'Cash', sub_category: 'Coins' },
  { category: 'Cash', sub_category: 'Others' },
];

const EXPENSE_ROWS = [
  { category: 'Regular Expense', sub_category: 'Regular Expense' },
  { category: 'Additional Expense', sub_category: 'Additional Expense' },
  { category: 'Advances', sub_category: 'Advances' },
  { category: 'Dues', sub_category: 'Dues' },
  { category: 'Negative Sales', sub_category: 'Negative Sales' },
  { category: 'Return to Tank', sub_category: 'Return to Tank' },
  { category: 'Others', sub_category: 'Others' },
];

export default function Finance() {
  const [summary, setSummary] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  // Multi-row forms
  const [showDeposit, setShowDeposit] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [depositRows, setDepositRows] = useState<Record<string, string>>({});
  const [expenseRows, setExpenseRows] = useState<Record<string, string>>({});
  const [depositRemarks, setDepositRemarks] = useState('');
  const [expenseRemarks, setExpenseRemarks] = useState('');
  const [txErr, setTxErr] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  // Edit transaction
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    id: 0,
    txn_date: '',
    txn_type: 'Deposit',
    category: '',
    sub_category: '',
    amount: '',
    remarks: '',
  });
  const [editErr, setEditErr] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Delete transaction
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, l, t] = await Promise.all([
        apiGet(`/api/finance/summary?date_from=${filterDate}&date_to=${filterDate}`),
        apiGet(`/api/finance/ledger?date_from=${filterDate}&date_to=${filterDate}`),
        apiGet(`/api/finance?txn_date=${filterDate}`),
      ]);
      setSummary(Array.isArray(s) ? s : []);
      setLedger(l?.ledger || []);
      setTransactions(Array.isArray(t) ? t : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterDate]);

  const todayData = summary[0] || { total_sales: 0, cash_sales: 0, online_sales: 0, credit_sales: 0, deposits: 0, deposit_detail: {}, expenses: 0, expense_detail: {}, shortage: 0 };

  const openDeposit = () => {
    setDepositDate(filterDate);
    setDepositRows({});
    setDepositRemarks('');
    setTxErr('');
    setShowDeposit(true);
  };

  const openExpense = () => {
    setExpenseDate(filterDate);
    setExpenseRows({});
    setExpenseRemarks('');
    setTxErr('');
    setShowExpense(true);
  };

  const saveDeposit = async () => {
    setTxErr('');
    if (!depositRemarks.trim()) { setTxErr('Remarks are required for the deposit entry'); return; }
    const filled = DEPOSIT_ROWS.filter((r) => depositRows[r.sub_category] && Number(depositRows[r.sub_category]) > 0);
    if (filled.length === 0) { setTxErr('Enter at least one deposit amount'); return; }
    setTxSaving(true);
    try {
      await apiPost('/api/finance/bulk', {
        transactions: filled.map((r) => ({
          txn_date: depositDate,
          txn_type: 'Deposit',
          category: r.category,
          sub_category: r.sub_category,
          amount: Number(depositRows[r.sub_category]),
          remarks: depositRemarks.trim(),
        })),
      });
      setShowDeposit(false);
      await load();
    } catch (e: any) {
      setTxErr(e.message || 'Failed');
    } finally {
      setTxSaving(false);
    }
  };

  const saveExpense = async () => {
    setTxErr('');
    if (!expenseRemarks.trim()) { setTxErr('Remarks are required for the expense entry'); return; }
    const filled = EXPENSE_ROWS.filter((r) => expenseRows[r.sub_category] && Number(expenseRows[r.sub_category]) > 0);
    if (filled.length === 0) { setTxErr('Enter at least one expense amount'); return; }
    setTxSaving(true);
    try {
      await apiPost('/api/finance/bulk', {
        transactions: filled.map((r) => ({
          txn_date: expenseDate,
          txn_type: 'Expense',
          category: r.category,
          sub_category: r.sub_category,
          amount: Number(expenseRows[r.sub_category]),
          remarks: expenseRemarks.trim(),
        })),
      });
      setShowExpense(false);
      await load();
    } catch (e: any) {
      setTxErr(e.message || 'Failed');
    } finally {
      setTxSaving(false);
    }
  };

  // Edit transaction
  const openEdit = (txn: any) => {
    setEditForm({
      id: txn.id,
      txn_date: txn.txn_date || filterDate,
      txn_type: txn.txn_type || 'Deposit',
      category: txn.category || '',
      sub_category: txn.sub_category || '',
      amount: String(txn.amount || ''),
      remarks: txn.remarks || '',
    });
    setEditErr('');
    setShowEdit(true);
  };

  const saveEdit = async () => {
    setEditErr('');
    if (!editForm.amount || Number(editForm.amount) <= 0) { setEditErr('Amount must be > 0'); return; }
    if (!editForm.remarks.trim()) { setEditErr('Remarks are required'); return; }
    setEditSaving(true);
    try {
      await apiPut('/api/finance', {
        id: editForm.id,
        txn_date: editForm.txn_date,
        txn_type: editForm.txn_type,
        category: editForm.category,
        sub_category: editForm.sub_category,
        amount: Number(editForm.amount),
        remarks: editForm.remarks.trim(),
      });
      setShowEdit(false);
      await load();
    } catch (e: any) {
      setEditErr(e.message || 'Failed to save');
    } finally {
      setEditSaving(false);
    }
  };

  // Delete transaction
  const deleteTxn = async () => {
    if (!deleteTarget) return;
    try {
      await apiDelete('/api/finance', { id: deleteTarget.id });
      setDeleteTarget(null);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  const depositTotal = DEPOSIT_ROWS.reduce((s, r) => s + (Number(depositRows[r.sub_category]) || 0), 0);
  const expenseTotal = EXPENSE_ROWS.reduce((s, r) => s + (Number(expenseRows[r.sub_category]) || 0), 0);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">{error} <button onClick={() => { setError(''); load(); }} className="underline ml-2">Retry</button></div>}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Wallet className="w-5 h-5 text-indigo-600" /> Finance Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Daily balance view, expense/deposit entries, and ledger</p>
        </div>
        <div className="flex items-center gap-2">
          <Field label="Date">
            <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </Field>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-8">Loading...</p>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-xs text-slate-400">Meter Sales (Inflow)</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{fmtMoney(todayData.total_sales)}</div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                <div className="text-slate-500">Cash: <span className="font-medium">{fmtMoney(todayData.cash_sales)}</span></div>
                <div className="text-slate-500">Online: <span className="font-medium">{fmtMoney(todayData.online_sales)}</span></div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">Total Deposits</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(todayData.deposits)}</div>
              {Object.keys(todayData.deposit_detail).length > 0 && (
                <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {Object.entries(todayData.deposit_detail).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span>{k}</span><span className="font-medium">{fmtMoney(v as number)}</span></div>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">Total Expenses</div>
              <div className="text-xl font-bold text-rose-600 mt-1">{fmtMoney(todayData.expenses)}</div>
              {Object.keys(todayData.expense_detail).length > 0 && (
                <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                  {Object.entries(todayData.expense_detail).map(([k, v]) => (
                    <div key={k} className="flex justify-between"><span>{k}</span><span className="font-medium">{fmtMoney(v as number)}</span></div>
                  ))}
                </div>
              )}
            </Card>
            <Card className={`p-4 border-2 ${todayData.shortage < 0 ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
              <div className="text-xs text-slate-400">Shortage / Surplus</div>
              <div className={`text-xl font-bold mt-1 ${todayData.shortage < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {todayData.shortage > 0 ? '+' : ''}{fmtMoney(todayData.shortage)}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Meter Sales − (Deposits + Expenses)</p>
            </Card>
          </div>

          {/* Transactions for this date */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Transactions for {fmtDate(filterDate)}</h3>
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No transactions recorded for this date</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Category</th>
                      <th className="px-3 py-2 text-left">Sub-Category</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Remarks</th>
                      <th className="px-3 py-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions.map((txn) => (
                      <tr key={txn.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${txn.txn_type === 'Deposit' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                            {txn.txn_type === 'Deposit' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {txn.txn_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{txn.category || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{txn.sub_category || '—'}</td>
                        <td className={`px-3 py-2 text-right font-medium ${txn.txn_type === 'Deposit' ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtMoney(txn.amount)}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs max-w-[200px] truncate">{txn.remarks || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => openEdit(txn)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteTarget(txn)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Ledger */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4" /> Ledger Balance</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Opening Balance</th>
                    <th className="px-3 py-2 text-right">Deposits</th>
                    <th className="px-3 py-2 text-right">Expenses</th>
                    <th className="px-3 py-2 text-right">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ledger.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No ledger entries for this date</td></tr>
                  ) : ledger.map((entry) => (
                    <tr key={entry.date} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-700">{fmtDate(entry.date)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(entry.opening_balance)}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">+{fmtMoney(entry.deposits)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">-{fmtMoney(entry.expenses)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmtMoney(entry.closing_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Quick actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><ArrowDownRight className="w-4 h-4 text-rose-600" /> Record Expense</h3>
              <p className="text-xs text-slate-500 mb-3">Log all expense splits for this date in one go</p>
              <button onClick={openExpense} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"><Plus className="w-4 h-4" /> Add Expense</button>
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><ArrowUpRight className="w-4 h-4 text-emerald-600" /> Record Deposit</h3>
              <p className="text-xs text-slate-500 mb-3">Log all deposit splits (online + cash) for this date</p>
              <button onClick={openDeposit} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Deposit</button>
            </Card>
          </div>
        </>
      )}

      {/* ── Deposit multi-row modal ── */}
      {showDeposit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDeposit(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Record Deposits</h3>
            <Field label="Date" required>
              <Input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} />
            </Field>

            {/* Online sub-categories */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Online</p>
              <div className="space-y-2">
                {DEPOSIT_ROWS.filter((r) => r.category === 'Online').map((r) => (
                  <div key={r.sub_category} className="flex items-center gap-3">
                    <span className="text-sm text-slate-700 w-36">{r.sub_category}</span>
                    <input type="number" step="0.01" min="0" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={depositRows[r.sub_category] || ''} onChange={(e) => setDepositRows({ ...depositRows, [r.sub_category]: e.target.value })} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Cash sub-categories */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Cash</p>
              <div className="space-y-2">
                {DEPOSIT_ROWS.filter((r) => r.category === 'Cash').map((r) => (
                  <div key={r.sub_category} className="flex items-center gap-3">
                    <span className="text-sm text-slate-700 w-36">{r.sub_category}</span>
                    <input type="number" step="0.01" min="0" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={depositRows[r.sub_category] || ''} onChange={(e) => setDepositRows({ ...depositRows, [r.sub_category]: e.target.value })} placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold text-slate-700">Total: <span className="text-emerald-600">{fmtMoney(depositTotal)}</span></span>
            </div>

            <Field label="Remarks" required>
              <Input value={depositRemarks} onChange={(e) => setDepositRemarks(e.target.value)} placeholder="e.g. End of day deposit" />
            </Field>

            {txErr && <p className="text-sm text-rose-600">{txErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeposit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveDeposit} disabled={txSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">{txSaving ? 'Saving...' : 'Save Deposits'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Expense multi-row modal ── */}
      {showExpense && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowExpense(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Record Expenses</h3>
            <Field label="Date" required>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </Field>

            <div className="space-y-2">
              {EXPENSE_ROWS.map((r) => (
                <div key={r.sub_category} className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 w-36">{r.category}</span>
                  <input type="number" step="0.01" min="0" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" value={expenseRows[r.sub_category] || ''} onChange={(e) => setExpenseRows({ ...expenseRows, [r.sub_category]: e.target.value })} placeholder="0" />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold text-slate-700">Total: <span className="text-rose-600">{fmtMoney(expenseTotal)}</span></span>
            </div>

            <Field label="Remarks" required>
              <Input value={expenseRemarks} onChange={(e) => setExpenseRemarks(e.target.value)} placeholder="e.g. Daily running expenses" />
            </Field>

            {txErr && <p className="text-sm text-rose-600">{txErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExpense(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveExpense} disabled={txSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">{txSaving ? 'Saving...' : 'Save Expenses'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Transaction Modal ── */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowEdit(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Edit Transaction</h3>
            <Field label="Date" required>
              <Input type="date" value={editForm.txn_date} onChange={(e) => setEditForm({ ...editForm, txn_date: e.target.value })} />
            </Field>
            <Field label="Type">
              <Input value={editForm.txn_type} disabled />
            </Field>
            <Field label="Category">
              <Input value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
            </Field>
            <Field label="Sub-Category">
              <Input value={editForm.sub_category} onChange={(e) => setEditForm({ ...editForm, sub_category: e.target.value })} />
            </Field>
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
            </Field>
            <Field label="Remarks" required>
              <Input value={editForm.remarks} onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })} />
            </Field>
            {editErr && <p className="text-sm text-rose-600">{editErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{editSaving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteTxn}
        title="Delete Transaction"
        message={deleteTarget ? `Are you sure you want to delete this ${deleteTarget.txn_type} of ${fmtMoney(deleteTarget.amount)} (${deleteTarget.sub_category || deleteTarget.category})? This action cannot be undone.` : ''}
      />
    </div>
  );
}
