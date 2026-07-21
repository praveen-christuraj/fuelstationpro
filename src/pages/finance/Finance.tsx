import { useEffect, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowDownRight, BookOpen, Plus } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { apiGet, apiPost, fmtMoney, fmtDate } from '../../lib/api';

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
              <p className="text-[10px] text-slate-400 mt-1">Inflow - Deposits</p>
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
    </div>
  );
}
