import { useEffect, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, TrendingDown, BookOpen, Plus } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { apiGet, apiPost, fmtMoney, fmtDate } from '../../lib/api';

const EXPENSE_CATEGORIES = [
  { value: 'Regular Expense', label: 'Regular Expense' },
  { value: 'Additional Expense', label: 'Additional Expense' },
  { value: 'Advances', label: 'Advances' },
  { value: 'Dues', label: 'Dues' },
  { value: 'Negative Sales', label: 'Negative Sales' },
  { value: 'Return to Tank', label: 'Return to Tank' },
  { value: 'Others', label: 'Others' },
];

const DEPOSIT_CATEGORIES = [
  { value: 'Online', label: 'Online', sub: ['Paytm', 'DTA', 'HP Pay', 'OTP', 'Personal Account', 'Others'] },
  { value: 'Cash', label: 'Cash', sub: ['Cash', 'Coins', 'Others'] },
];

export default function Finance() {
  const [summary, setSummary] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  // Transaction forms
  const [showExpense, setShowExpense] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [txForm, setTxForm] = useState({
    txn_date: new Date().toISOString().slice(0, 10),
    category: '',
    sub_category: '',
    amount: '',
    remarks: '',
  });
  const [txErr, setTxErr] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [s, l] = await Promise.all([
        apiGet(`/api/finance/summary?date_from=${filterDate}&date_to=${filterDate}`),
        apiGet(`/api/finance/ledger?date_from=${filterDate}&date_to=${filterDate}`),
      ]);
      setSummary(Array.isArray(s) ? s : []);
      setLedger(l?.ledger || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterDate]);

  const todayData = summary[0] || { total_sales: 0, cash_sales: 0, online_sales: 0, credit_sales: 0, deposits: 0, deposit_detail: {}, expenses: 0, expense_detail: {}, shortage: 0 };
  const ledgerEntry = ledger[0] || { opening_balance: 0, deposits: 0, expenses: 0, closing_balance: 0 };

  // Transaction save
  const openExpense = () => {
    setTxForm({ txn_date: filterDate, category: '', sub_category: '', amount: '', remarks: '' });
    setTxErr('');
    setShowExpense(true);
  };

  const openDeposit = () => {
    setTxForm({ txn_date: filterDate, category: '', sub_category: '', amount: '', remarks: '' });
    setTxErr('');
    setShowDeposit(true);
  };

  const saveExpense = async () => {
    setTxErr('');
    if (!txForm.category) { setTxErr('Category is required'); return; }
    if (!txForm.amount || Number(txForm.amount) <= 0) { setTxErr('Amount must be > 0'); return; }
    if (!txForm.remarks.trim()) { setTxErr('Remarks are required'); return; }
    setTxSaving(true);
    try {
      await apiPost('/api/finance', {
        txn_date: txForm.txn_date,
        txn_type: 'Expense',
        category: txForm.category,
        sub_category: txForm.sub_category || txForm.category,
        amount: Number(txForm.amount),
        remarks: txForm.remarks.trim(),
      });
      setShowExpense(false);
      await load();
    } catch (e: any) {
      setTxErr(e.message || 'Failed');
    } finally {
      setTxSaving(false);
    }
  };

  const saveDeposit = async () => {
    setTxErr('');
    if (!txForm.category) { setTxErr('Deposit type is required'); return; }
    if (!txForm.sub_category) { setTxErr('Sub-category is required'); return; }
    if (!txForm.amount || Number(txForm.amount) <= 0) { setTxErr('Amount must be > 0'); return; }
    if (!txForm.remarks.trim()) { setTxErr('Remarks are required'); return; }
    setTxSaving(true);
    try {
      await apiPost('/api/finance', {
        txn_date: txForm.txn_date,
        txn_type: 'Deposit',
        category: txForm.category,
        sub_category: txForm.sub_category,
        amount: Number(txForm.amount),
        remarks: txForm.remarks.trim(),
      });
      setShowDeposit(false);
      await load();
    } catch (e: any) {
      setTxErr(e.message || 'Failed');
    } finally {
      setTxSaving(false);
    }
  };

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
              <div className="text-xs text-slate-400">Cash + Online Sales (Inflow)</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{fmtMoney(todayData.cash_sales + todayData.online_sales)}</div>
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
            <Card className={`p-4 border-2 ${todayData.shortage > 0 ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
              <div className="text-xs text-slate-400">Shortage / Surplus</div>
              <div className={`text-xl font-bold mt-1 ${todayData.shortage > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {todayData.shortage > 0 ? '+' : ''}{fmtMoney(todayData.shortage)}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Inflow − Deposits</p>
            </Card>
          </div>

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
              <p className="text-xs text-slate-500 mb-3">Log an expense for this date</p>
              <button onClick={openExpense} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700"><Plus className="w-4 h-4" /> Add Expense</button>
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2"><ArrowUpRight className="w-4 h-4 text-emerald-600" /> Record Deposit</h3>
              <p className="text-xs text-slate-500 mb-3">Log a cash or online deposit for this date</p>
              <button onClick={openDeposit} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"><Plus className="w-4 h-4" /> Add Deposit</button>
            </Card>
          </div>
        </>
      )}

      {/* Expense modal */}
      {showExpense && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowExpense(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Record Expense</h3>
            <Field label="Date" required>
              <Input type="date" value={txForm.txn_date} onChange={(e) => setTxForm({ ...txForm, txn_date: e.target.value })} />
            </Field>
            <Field label="Category" required>
              <Select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value, sub_category: '' })}>
                <option value="">Select category...</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Sub-Category">
              <Input value={txForm.sub_category} onChange={(e) => setTxForm({ ...txForm, sub_category: e.target.value })} placeholder="Optional sub-category" />
            </Field>
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
            </Field>
            <Field label="Remarks" required>
              <Input value={txForm.remarks} onChange={(e) => setTxForm({ ...txForm, remarks: e.target.value })} placeholder="Required" />
            </Field>
            {txErr && <p className="text-sm text-rose-600">{txErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExpense(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveExpense} disabled={txSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">{txSaving ? 'Saving...' : 'Save Expense'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit modal */}
      {showDeposit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowDeposit(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">Record Deposit</h3>
            <Field label="Date" required>
              <Input type="date" value={txForm.txn_date} onChange={(e) => setTxForm({ ...txForm, txn_date: e.target.value })} />
            </Field>
            <Field label="Deposit Type" required>
              <Select value={txForm.category} onChange={(e) => setTxForm({ ...txForm, category: e.target.value, sub_category: '' })}>
                <option value="">Select type...</option>
                {DEPOSIT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            {txForm.category && (
              <Field label="Sub-Category" required>
                <Select value={txForm.sub_category} onChange={(e) => setTxForm({ ...txForm, sub_category: e.target.value })}>
                  <option value="">Select...</option>
                  {DEPOSIT_CATEGORIES.find((c) => c.value === txForm.category)?.sub.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Amount" required>
              <Input type="number" step="0.01" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
            </Field>
            <Field label="Remarks" required>
              <Input value={txForm.remarks} onChange={(e) => setTxForm({ ...txForm, remarks: e.target.value })} placeholder="Required" />
            </Field>
            {txErr && <p className="text-sm text-rose-600">{txErr}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeposit(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={saveDeposit} disabled={txSaving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">{txSaving ? 'Saving...' : 'Save Deposit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
