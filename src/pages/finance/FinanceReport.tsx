import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Download, Filter } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input, Select } from '../../components/ui/Field';
import { BarChart, LineChart, DonutChart } from '../../components/Charts';
import DataFilters from '../../components/ui/DataFilters';
import { apiGet, fmtMoney, fmtDate } from '../../lib/api';

const DEPOSIT_SUB_CATEGORIES = ['Paytm', 'DTA', 'HP Pay', 'OTP', 'Personal Account', 'Others', 'Cash', 'Coins'];
const EXPENSE_CATEGORIES = ['Regular Expense', 'Additional Expense', 'Advances', 'Dues', 'Negative Sales', 'Return to Tank', 'Others'];

function exportToXLSX(rows: any[], filename: string, sheetName: string) {
  import('xlsx').then((XLSXModule) => {
    const XLSX = XLSXModule.default || XLSXModule;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${filename}.xlsx`);
  });
}

function exportToCSV(rows: any[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => {
    const val = r[h] ?? '';
    const str = String(val);
    return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
  }).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

export default function FinanceReport() {
  const [summary, setSummary] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: '', date_to: '' });

  // Split-level filters
  const [depositFilter, setDepositFilter] = useState('');
  const [expenseFilter, setExpenseFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      const [s, l] = await Promise.all([
        apiGet(`/api/finance/summary?${params.toString()}`),
        apiGet(`/api/finance/ledger?${params.toString()}`),
      ]);
      setSummary(Array.isArray(s) ? s : []);
      setLedger(l?.ledger || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  // ── Totals ──
  const totals = useMemo(() => {
    const sales = summary.reduce((s, r) => s + r.total_sales, 0);
    const deposits = summary.reduce((s, r) => s + r.deposits, 0);
    const expenses = summary.reduce((s, r) => s + r.expenses, 0);
    const shortage = summary.reduce((s, r) => s + r.shortage, 0);
    return { sales, deposits, expenses, shortage };
  }, [summary]);

  // ── Deposit splits aggregated ──
  const depositSplits = useMemo(() => {
    const map: Record<string, number> = {};
    summary.forEach((r) => Object.entries(r.deposit_detail || {}).forEach(([k, v]) => { map[k] = (map[k] || 0) + (v as number); }));
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [summary]);

  // ── Expense splits aggregated ──
  const expenseSplits = useMemo(() => {
    const map: Record<string, number> = {};
    summary.forEach((r) => Object.entries(r.expense_detail || {}).forEach(([k, v]) => { map[k] = (map[k] || 0) + (v as number); }));
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [summary]);

  // ── Daily shortage trend ──
  const dailyTrend = useMemo(() => summary.slice().reverse().map((r) => ({ label: r.date.slice(5), value: Math.round(r.shortage) })), [summary]);

  // ── Deposit split table: per sub-category per date ──
  const depositSplitTable = useMemo(() => {
    const allSubs = new Set<string>();
    summary.forEach((r) => Object.keys(r.deposit_detail || {}).forEach((k) => allSubs.add(k)));
    const subs = [...allSubs].sort();
    const rows = summary.map((r) => {
      const row: Record<string, any> = { date: r.date };
      let rowTotal = 0;
      subs.forEach((s) => {
        const val = Number((r.deposit_detail || {})[s] || 0);
        row[s] = val;
        rowTotal += val;
      });
      row._total = rowTotal;
      return row;
    });
    return { subs, rows };
  }, [summary]);

  // ── Expense split table: per category per date ──
  const expenseSplitTable = useMemo(() => {
    const allCats = new Set<string>();
    summary.forEach((r) => Object.keys(r.expense_detail || {}).forEach((k) => allCats.add(k)));
    const cats = [...allCats].sort();
    const rows = summary.map((r) => {
      const row: Record<string, any> = { date: r.date };
      let rowTotal = 0;
      cats.forEach((c) => {
        const val = Number((r.expense_detail || {})[c] || 0);
        row[c] = val;
        rowTotal += val;
      });
      row._total = rowTotal;
      return row;
    });
    return { cats, rows };
  }, [summary]);

  // ── Filtered split data ──
  const filteredDepositSplits = useMemo(() => {
    if (!depositFilter) return depositSplits;
    return depositSplits.filter((d) => d.label === depositFilter);
  }, [depositSplits, depositFilter]);

  const filteredExpenseSplits = useMemo(() => {
    if (!expenseFilter) return expenseSplits;
    return expenseSplits.filter((d) => d.label === expenseFilter);
  }, [expenseSplits, expenseFilter]);

  const filteredDepositTotal = filteredDepositSplits.reduce((s, d) => s + d.value, 0);
  const filteredExpenseTotal = filteredExpenseSplits.reduce((s, d) => s + d.value, 0);

  // ── Export ──
  const handleExport = (fmt: 'xlsx' | 'csv') => {
    // Sheet 1: Daily Summary
    const dailyRows = summary.map((r) => {
      const row: Record<string, any> = {
        'Date': r.date,
        'Meter Sales': Number(r.total_sales || 0),
        'Cash Submitted': Number(r.cash_sales || 0),
        'Online Submitted': Number(r.online_sales || 0),
        'Total Deposits': Number(r.deposits || 0),
        'Total Expenses': Number(r.expenses || 0),
        'Shortage/Surplus': Number(r.shortage || 0),
      };
      Object.entries(r.deposit_detail || {}).forEach(([k, v]) => { row[`Deposit: ${k}`] = Number(v || 0); });
      Object.entries(r.expense_detail || {}).forEach(([k, v]) => { row[`Expense: ${k}`] = Number(v || 0); });
      return row;
    });

    // Sheet 2: Ledger
    const ledgerRows = ledger.map((e) => ({
      'Date': e.date,
      'Opening Balance': e.opening_balance,
      'Deposits': e.deposits,
      'Expenses': e.expenses,
      'Closing Balance': e.closing_balance,
    }));

    const combined = [...dailyRows, {}, { 'Date': '--- LEDGER ---' }, ...ledgerRows];
    if (fmt === 'xlsx') exportToXLSX(combined, `finance-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}`, 'Finance Report');
    else exportToCSV(combined, `finance-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-800">Finance Report</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('xlsx')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="w-4 h-4" /> XLSX</button>
          <button onClick={() => handleExport('csv')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>

      {/* Date filters */}
      <DataFilters
        filters={filters}
        onFiltersChange={(f) => setFilters(f as typeof filters)}
        fields={[{ key: 'date', label: 'Date Range', type: 'daterange' }]}
      />

      {/* Split-level filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Split Filters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Deposit Sub-Category">
            <Select value={depositFilter} onChange={(e) => setDepositFilter(e.target.value)}>
              <option value="">All Deposits</option>
              {DEPOSIT_SUB_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Expense Category">
            <Select value={expenseFilter} onChange={(e) => setExpenseFilter(e.target.value)}>
              <option value="">All Expenses</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {loading ? <p className="text-sm text-slate-400 text-center py-8">Loading...</p> : (
        <>
          {/* ── Summary Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-xs text-slate-400">Meter Sales (Inflow)</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{fmtMoney(totals.sales)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">{depositFilter ? `Deposit: ${depositFilter}` : 'Total Deposits'}</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(filteredDepositTotal)}</div>
              {depositFilter && <div className="text-[10px] text-slate-400 mt-1">of {fmtMoney(totals.deposits)} total</div>}
            </Card>
            <Card className="p-4">
              <div className="text-xs text-slate-400">{expenseFilter ? `Expense: ${expenseFilter}` : 'Total Expenses'}</div>
              <div className="text-xl font-bold text-rose-600 mt-1">{fmtMoney(filteredExpenseTotal)}</div>
              {expenseFilter && <div className="text-[10px] text-slate-400 mt-1">of {fmtMoney(totals.expenses)} total</div>}
            </Card>
            <Card className={`p-4 border-2 ${totals.shortage < 0 ? 'border-rose-300 bg-rose-50' : 'border-emerald-300 bg-emerald-50'}`}>
              <div className="text-xs text-slate-400">Shortage / Surplus</div>
              <div className={`text-xl font-bold mt-1 ${totals.shortage < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {fmtMoney(totals.shortage)}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Meter Sales − (Deposits + Expenses)</p>
            </Card>
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dailyTrend.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Daily Shortage/Surplus Trend</h3>
                <LineChart data={dailyTrend} valueFmt={fmtMoney} color="#ef4444" />
              </Card>
            )}
            {filteredDepositSplits.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">{depositFilter ? `Deposit: ${depositFilter}` : 'Deposit Breakdown'}</h3>
                <DonutChart data={filteredDepositSplits.map((d) => ({ ...d, color: d.label === 'Cash' || d.label === 'Coins' ? '#10b981' : d.label === 'Others' ? '#94a3b8' : '#3b82f6' }))} />
              </Card>
            )}
            {filteredExpenseSplits.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">{expenseFilter ? `Expense: ${expenseFilter}` : 'Expense by Category'}</h3>
                <BarChart data={filteredExpenseSplits} valueFmt={fmtMoney} color="#f43f5e" />
              </Card>
            )}
          </div>

          {/* ── Deposit Split-by-Date Table ── */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Deposit Split Detail{depositFilter ? ` — ${depositFilter}` : ''}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 bg-slate-50">Date</th>
                    {(depositFilter ? [depositFilter] : depositSplitTable.subs).map((s) => (
                      <th key={s} className="px-3 py-2 text-right">{s}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {depositSplitTable.rows.map((row) => {
                    const shownSubs = depositFilter ? [depositFilter] : depositSplitTable.subs;
                    const rowTotal = shownSubs.reduce((s, sub) => s + (Number(row[sub]) || 0), 0);
                    return (
                      <tr key={row.date} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white">{fmtDate(row.date)}</td>
                        {shownSubs.map((s) => (
                          <td key={s} className="px-3 py-2 text-right text-emerald-600">{row[s] ? fmtMoney(row[s]) : '—'}</td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {depositSplitTable.rows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No deposit data</td></tr>
                  )}
                </tbody>
                {/* Totals row */}
                {depositSplitTable.rows.length > 0 && (
                  <tfoot className="bg-slate-50 font-semibold">
                    <tr>
                      <td className="px-3 py-2 sticky left-0 bg-slate-50">Total</td>
                      {(depositFilter ? [depositFilter] : depositSplitTable.subs).map((s) => {
                        const colTotal = depositSplitTable.rows.reduce((sum, row) => sum + (Number(row[s]) || 0), 0);
                        return <td key={s} className="px-3 py-2 text-right text-emerald-700">{colTotal ? fmtMoney(colTotal) : '—'}</td>;
                      })}
                      <td className="px-3 py-2 text-right">{fmtMoney(depositSplitTable.rows.reduce((s, row) => s + row._total, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* ── Expense Split-by-Date Table ── */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">
              Expense Split Detail{expenseFilter ? ` — ${expenseFilter}` : ''}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left sticky left-0 bg-slate-50">Date</th>
                    {(expenseFilter ? [expenseFilter] : expenseSplitTable.cats).map((c) => (
                      <th key={c} className="px-3 py-2 text-right">{c}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expenseSplitTable.rows.map((row) => {
                    const shownCats = expenseFilter ? [expenseFilter] : expenseSplitTable.cats;
                    const rowTotal = shownCats.reduce((s, cat) => s + (Number(row[cat]) || 0), 0);
                    return (
                      <tr key={row.date} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium sticky left-0 bg-white">{fmtDate(row.date)}</td>
                        {shownCats.map((c) => (
                          <td key={c} className="px-3 py-2 text-right text-rose-600">{row[c] ? fmtMoney(row[c]) : '—'}</td>
                        ))}
                        <td className="px-3 py-2 text-right font-semibold">{fmtMoney(rowTotal)}</td>
                      </tr>
                    );
                  })}
                  {expenseSplitTable.rows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No expense data</td></tr>
                  )}
                </tbody>
                {/* Totals row */}
                {expenseSplitTable.rows.length > 0 && (
                  <tfoot className="bg-slate-50 font-semibold">
                    <tr>
                      <td className="px-3 py-2 sticky left-0 bg-slate-50">Total</td>
                      {(expenseFilter ? [expenseFilter] : expenseSplitTable.cats).map((c) => {
                        const colTotal = expenseSplitTable.rows.reduce((sum, row) => sum + (Number(row[c]) || 0), 0);
                        return <td key={c} className="px-3 py-2 text-right text-rose-700">{colTotal ? fmtMoney(colTotal) : '—'}</td>;
                      })}
                      <td className="px-3 py-2 text-right">{fmtMoney(expenseSplitTable.rows.reduce((s, row) => s + row._total, 0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* ── Daily Detailed Breakdown ── */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Daily Summary</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Meter Sales</th>
                    <th className="px-3 py-2 text-right">Cash Submitted</th>
                    <th className="px-3 py-2 text-right">Online Submitted</th>
                    <th className="px-3 py-2 text-right">Deposits</th>
                    <th className="px-3 py-2 text-right">Expenses</th>
                    <th className="px-3 py-2 text-right">Shortage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {summary.map((r) => (
                    <tr key={r.date} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.total_sales)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.cash_sales)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.online_sales)}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{fmtMoney(r.deposits)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{fmtMoney(r.expenses)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${r.shortage < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtMoney(r.shortage)}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No data for selected period</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Ledger ── */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Ledger Summary</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Opening</th>
                    <th className="px-3 py-2 text-right">Deposits</th>
                    <th className="px-3 py-2 text-right">Expenses</th>
                    <th className="px-3 py-2 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ledger.map((e) => (
                    <tr key={e.date} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{fmtDate(e.date)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(e.opening_balance)}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{fmtMoney(e.deposits)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{fmtMoney(e.expenses)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtMoney(e.closing_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
