import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { BarChart, LineChart, DonutChart } from '../../components/Charts';
import DataFilters from '../../components/ui/DataFilters';
import { apiGet, fmtMoney, fmtDate } from '../../lib/api';

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

  const totals = useMemo(() => {
    const sales = summary.reduce((s, r) => s + (r.cash_sales + r.online_sales), 0);
    const deposits = summary.reduce((s, r) => s + r.deposits, 0);
    const expenses = summary.reduce((s, r) => s + r.expenses, 0);
    const shortage = summary.reduce((s, r) => s + r.shortage, 0);
    return { sales, deposits, expenses, shortage };
  }, [summary]);

  // Aggregate deposit splits across all dates
  const depositSplits = useMemo(() => {
    const map: Record<string, number> = {};
    summary.forEach((r) => Object.entries(r.deposit_detail || {}).forEach(([k, v]) => { map[k] = (map[k] || 0) + (v as number); }));
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [summary]);

  // Aggregate expense splits across all dates
  const expenseSplits = useMemo(() => {
    const map: Record<string, number> = {};
    summary.forEach((r) => Object.entries(r.expense_detail || {}).forEach(([k, v]) => { map[k] = (map[k] || 0) + (v as number); }));
    return Object.entries(map).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [summary]);

  const dailyTrend = useMemo(() => summary.slice().reverse().map((r) => ({ label: r.date.slice(5), value: Math.round(r.shortage) })), [summary]);

  const handleExport = (fmt: 'xlsx' | 'csv') => {
    const rows = summary.map((r) => ({
      'Date': r.date,
      'Cash Sales': Number(r.cash_sales || 0),
      'Online Sales': Number(r.online_sales || 0),
      'Total Inflow': Number(r.cash_sales || 0) + Number(r.online_sales || 0),
      'Total Deposits': Number(r.deposits || 0),
      'Total Expenses': Number(r.expenses || 0),
      'Shortage/Surplus': Number(r.shortage || 0),
      // Deposit splits
      ...Object.fromEntries(Object.entries(r.deposit_detail || {}).map(([k, v]) => [`Deposit: ${k}`, Number(v || 0)])),
      // Expense splits
      ...Object.fromEntries(Object.entries(r.expense_detail || {}).map(([k, v]) => [`Expense: ${k}`, Number(v || 0)])),
    }));
    // Add ledger rows
    const ledgerRows = ledger.map((e) => ({
      'Date': e.date,
      'Opening Balance': e.opening_balance,
      'Deposits': e.deposits,
      'Expenses': e.expenses,
      'Closing Balance': e.closing_balance,
    }));
    const combined = [...rows, {}, { 'Date': '--- LEDGER ---' }, ...ledgerRows];
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

      <DataFilters
        filters={filters}
        onFiltersChange={(f) => setFilters(f as typeof filters)}
        fields={[{ key: 'date', label: 'Date Range', type: 'daterange' }]}
      />

      {loading ? <p className="text-sm text-slate-400 text-center py-8">Loading...</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="p-4"><div className="text-xs text-slate-400">Cash + Online Sales</div><div className="text-xl font-bold text-slate-800 mt-1">{fmtMoney(totals.sales)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Total Deposits</div><div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(totals.deposits)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Total Expenses</div><div className="text-xl font-bold text-rose-600 mt-1">{fmtMoney(totals.expenses)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Shortage / Surplus</div><div className={`text-xl font-bold mt-1 ${totals.shortage > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtMoney(totals.shortage)}</div></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dailyTrend.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Daily Shortage Trend</h3>
                <LineChart data={dailyTrend} valueFmt={fmtMoney} color="#ef4444" />
              </Card>
            )}
            {depositSplits.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Deposit Breakdown</h3>
                <DonutChart data={depositSplits.map((d) => ({ ...d, color: d.label === 'Cash' || d.label === 'Coins' ? '#10b981' : d.label === 'Others' ? '#94a3b8' : '#3b82f6' }))} />
              </Card>
            )}
            {expenseSplits.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Expense by Category</h3>
                <BarChart data={expenseSplits} valueFmt={fmtMoney} color="#f43f5e" />
              </Card>
            )}
          </div>

          {/* Detailed daily breakdown */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Daily Detailed Breakdown</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Cash Sales</th>
                    <th className="px-3 py-2 text-right">Online Sales</th>
                    <th className="px-3 py-2 text-right">Inflow</th>
                    <th className="px-3 py-2 text-right">Deposits</th>
                    <th className="px-3 py-2 text-right">Expenses</th>
                    <th className="px-3 py-2 text-right">Shortage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {summary.map((r) => (
                    <tr key={r.date} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.cash_sales)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(r.online_sales)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmtMoney(r.cash_sales + r.online_sales)}</td>
                      <td className="px-3 py-2 text-right text-emerald-600">{fmtMoney(r.deposits)}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{fmtMoney(r.expenses)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${r.shortage > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtMoney(r.shortage)}</td>
                    </tr>
                  ))}
                  {summary.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No data for selected period</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Deposit split detail */}
          {depositSplits.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Deposit Split Detail</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {depositSplits.map((d) => (
                  <div key={d.label} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-400">{d.label}</div>
                    <div className="text-lg font-bold text-slate-800 mt-0.5">{fmtMoney(d.value)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Expense split detail */}
          {expenseSplits.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Expense Split Detail</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {expenseSplits.map((d) => (
                  <div key={d.label} className="rounded-lg border border-slate-200 p-3">
                    <div className="text-xs text-slate-400">{d.label}</div>
                    <div className="text-lg font-bold text-rose-600 mt-0.5">{fmtMoney(d.value)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Ledger */}
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
