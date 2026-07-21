import { useEffect, useState, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import DataFilters from '../../components/ui/DataFilters';
import { BarChart, DonutChart } from '../../components/Charts';
import { apiGet, fmtMoney, fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

export default function CreditSalesReport() {
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', status: '' });

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      if (filters.status) params.set('status', filters.status);
      const data = await apiGet(`/api/credit-sales/pending?${params.toString()}`);
      setCredits(data.existing || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters]);

  const totals = useMemo(() => {
    const total = credits.reduce((s, c) => s + Number(c.amount || 0), 0);
    const settled = credits.reduce((s, c) => s + Number(c.settled_amount || 0), 0);
    const pending = total - settled;
    return { total, settled, pending };
  }, [credits]);

  const statusChart = useMemo(() => {
    const counts = { Pending: 0, Partial: 0, Settled: 0 };
    credits.forEach((c) => { counts[c.status as keyof typeof counts] = (counts[c.status as keyof typeof counts] || 0) + 1; });
    return [
      { label: 'Pending', value: counts.Pending, color: '#ef4444' },
      { label: 'Partial', value: counts.Partial, color: '#f59e0b' },
      { label: 'Settled', value: counts.Settled, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [credits]);

  const statusColor = (s: string) => s === 'Settled' ? 'green' : s === 'Partial' ? 'amber' : 'red';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-indigo-600" />
        <h2 className="text-xl font-bold text-slate-800">Credit Sales Report</h2>
      </div>

      <DataFilters
        filters={filters}
        onFiltersChange={(f) => setFilters(f as typeof filters)}
        fields={[
          { key: 'date', label: 'Date Range', type: 'daterange' },
          { key: 'status', label: 'Status', type: 'select', options: [
            { value: 'Pending', label: 'Pending' },
            { value: 'Partial', label: 'Partial' },
            { value: 'Settled', label: 'Settled' },
          ]},
        ]}
      />

      {loading ? <p className="text-sm text-slate-400 text-center py-8">Loading...</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4"><div className="text-xs text-slate-400">Total Credit</div><div className="text-xl font-bold text-slate-800 mt-1">{fmtMoney(totals.total)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Total Settled</div><div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(totals.settled)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Pending</div><div className="text-xl font-bold text-orange-600 mt-1">{fmtMoney(totals.pending)}</div></Card>
          </div>

          {statusChart.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Status Distribution</h3>
              <DonutChart data={statusChart} />
            </Card>
          )}

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">All Credit Sales</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Settled</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {credits.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{fmtDate(c.sale_date)}</td>
                      <td className="px-3 py-2 font-medium">{c.customer_name}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.amount)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(c.settled_amount || 0)}</td>
                      <td className="px-3 py-2 text-center"><Badge color={statusColor(c.status)}>{c.status}</Badge></td>
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
