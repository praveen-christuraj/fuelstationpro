import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Field';
import { BarChart, LineChart, DonutChart } from '../../components/Charts';
import DataFilters from '../../components/ui/DataFilters';
import { apiGet, fmtMoney, fmtDate, fmtNum } from '../../lib/api';

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

  const depositChart = useMemo(() => {
    const map: Record<string, number> = {};
    summary.forEach((r) => Object.entries(r.deposit_detail || {}).forEach(([k, v]) => { map[k] = (map[k] || 0) + (v as number); }));
    return Object.entries(map).map(([label, value]) => ({ label, value: Math.round(value), color: label === 'Cash' ? '#10b981' : label === 'Online' ? '#3b82f6' : '#94a3b8' }));
  }, [summary]);

  const expenseChart = useMemo(() => {
    const map: Record<string, number> = {};
    summary.forEach((r) => Object.entries(r.expense_detail || {}).forEach(([k, v]) => { map[k] = (map[k] || 0) + (v as number); }));
    return Object.entries(map).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [summary]);

  const dailyTrend = useMemo(() => summary.slice().reverse().map((r) => ({ label: r.date.slice(5), value: Math.round(r.shortage) })), [summary]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-600" />
        <h2 className="text-xl font-bold text-slate-800">Finance Report</h2>
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
            {depositChart.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Deposit Breakdown</h3>
                <DonutChart data={depositChart} />
              </Card>
            )}
            {expenseChart.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Expense by Category</h3>
                <BarChart data={expenseChart} valueFmt={fmtMoney} color="#f43f5e" />
              </Card>
            )}
          </div>

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
