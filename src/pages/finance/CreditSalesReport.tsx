import { useEffect, useState, useMemo } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import DataFilters from '../../components/ui/DataFilters';
import { BarChart, DonutChart } from '../../components/Charts';
import { apiGet, fmtMoney, fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

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

export default function CreditSalesReport() {
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ date_from: '', date_to: '', status: '', customer: '' });
  const [viewMode, setViewMode] = useState<'date' | 'month' | 'customer'>('date');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.date_from) params.set('date_from', filters.date_from);
      if (filters.date_to) params.set('date_to', filters.date_to);
      if (filters.status) params.set('status', filters.status);
      if (filters.customer) params.set('customer', filters.customer);
      const data = await apiGet(`/api/credit-sales/report?${params.toString()}`);
      setCredits(Array.isArray(data) ? data : []);
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
    return { total, settled, pending: total - settled, count: credits.length };
  }, [credits]);

  const statusChart = useMemo(() => {
    const counts: Record<string, number> = { Pending: 0, Partial: 0, Settled: 0 };
    credits.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return [
      { label: 'Pending', value: counts.Pending, color: '#ef4444' },
      { label: 'Partial', value: counts.Partial, color: '#f59e0b' },
      { label: 'Settled', value: counts.Settled, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [credits]);

  // Grouped views
  const groupedByMonth = useMemo(() => {
    const map: Record<string, { total: number; settled: number; pending: number; count: number; entries: any[] }> = {};
    credits.forEach((c) => {
      const month = c.sale_date?.slice(0, 7) || 'Unknown';
      if (!map[month]) map[month] = { total: 0, settled: 0, pending: 0, count: 0, entries: [] };
      map[month].total += Number(c.amount || 0);
      map[month].settled += Number(c.settled_amount || 0);
      map[month].count++;
      map[month].entries.push(c);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a)).map(([month, data]) => ({ month, ...data, pending: data.total - data.settled }));
  }, [credits]);

  const groupedByCustomer = useMemo(() => {
    const map: Record<string, { total: number; settled: number; pending: number; count: number; entries: any[] }> = {};
    credits.forEach((c) => {
      const cust = c.customer_name || 'Unknown';
      if (!map[cust]) map[cust] = { total: 0, settled: 0, pending: 0, count: 0, entries: [] };
      map[cust].total += Number(c.amount || 0);
      map[cust].settled += Number(c.settled_amount || 0);
      map[cust].count++;
      map[cust].entries.push(c);
    });
    return Object.entries(map).sort(([, a], [, b]) => b.total - a.total).map(([customer, data]) => ({ customer, ...data }));
  }, [credits]);

  const statusColor = (s: string) => s === 'Settled' ? 'green' : s === 'Partial' ? 'amber' : 'red';

  const handleExport = (fmt: 'xlsx' | 'csv') => {
    const rows = credits.map((c) => ({
      'Date': c.sale_date,
      'Customer': c.customer_name,
      'Vehicle': c.vehicle_no || '',
      'Product': c.product_name || '',
      'Amount': Number(c.amount || 0),
      'Settled': Number(c.settled_amount || 0),
      'Remaining': Number(c.amount || 0) - Number(c.settled_amount || 0),
      'Status': c.status,
      'Settlement Method': c.settlement_method || '',
      'Settled Date': c.settled_date || '',
      'Remarks': c.remarks || '',
    }));
    if (fmt === 'xlsx') exportToXLSX(rows, `credit-sales-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}`, 'Credit Sales');
    else exportToCSV(rows, `credit-sales-report-${filters.date_from || 'all'}-${filters.date_to || 'all'}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-bold text-slate-800">Credit Sales Report</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('xlsx')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="w-4 h-4" /> XLSX</button>
          <button onClick={() => handleExport('csv')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"><Download className="w-4 h-4" /> CSV</button>
        </div>
      </div>

      <DataFilters
        filters={filters}
        onFiltersChange={(f) => setFilters(f as typeof filters)}
        fields={[
          { key: 'date', label: 'Date Range', type: 'daterange' },
          { key: 'customer', label: 'Customer', type: 'text', placeholder: 'Search customer name...' },
          { key: 'status', label: 'Status', type: 'select', options: [
            { value: 'Pending', label: 'Pending' },
            { value: 'Partial', label: 'Partial' },
            { value: 'Settled', label: 'Settled' },
          ]},
        ]}
      />

      {loading ? <p className="text-sm text-slate-400 text-center py-8">Loading...</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card className="p-4"><div className="text-xs text-slate-400">Total Records</div><div className="text-xl font-bold text-slate-800 mt-1">{totals.count}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Total Credit</div><div className="text-xl font-bold text-slate-800 mt-1">{fmtMoney(totals.total)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Total Settled</div><div className="text-xl font-bold text-emerald-600 mt-1">{fmtMoney(totals.settled)}</div></Card>
            <Card className="p-4"><div className="text-xs text-slate-400">Pending</div><div className="text-xl font-bold text-orange-600 mt-1">{fmtMoney(totals.pending)}</div></Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {statusChart.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Status Distribution</h3>
                <DonutChart data={statusChart} />
              </Card>
            )}
            {groupedByCustomer.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Top Customers by Credit</h3>
                <BarChart data={groupedByCustomer.slice(0, 8).map((c) => ({ label: c.customer.slice(0, 12), value: Math.round(c.total) }))} valueFmt={fmtMoney} color="#6366f1" />
              </Card>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-2">
            {(['date', 'month', 'customer'] as const).map((mode) => (
              <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === mode ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                {mode === 'date' ? 'Date-wise' : mode === 'month' ? 'Month-wise' : 'Customer-wise'}
              </button>
            ))}
          </div>

          {/* Date-wise view */}
          {viewMode === 'date' && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">All Credit Sales (Date-wise)</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Vehicle</th>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Settled</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-left">Method</th>
                      <th className="px-3 py-2 text-left">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {credits.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2">{fmtDate(c.sale_date)}</td>
                        <td className="px-3 py-2 font-medium">{c.customer_name}</td>
                        <td className="px-3 py-2 text-slate-600">{c.vehicle_no || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{c.product_name || '—'}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(c.amount)}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(c.settled_amount || 0)}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmtMoney(Number(c.amount || 0) - Number(c.settled_amount || 0))}</td>
                        <td className="px-3 py-2 text-center"><Badge color={statusColor(c.status)}>{c.status}</Badge></td>
                        <td className="px-3 py-2 text-slate-600">{c.settlement_method || '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs max-w-[150px] truncate">{c.remarks || '—'}</td>
                      </tr>
                    ))}
                    {credits.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">No records found</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Month-wise view */}
          {viewMode === 'month' && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Month-wise Summary</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Month</th>
                      <th className="px-3 py-2 text-right">Records</th>
                      <th className="px-3 py-2 text-right">Total Credit</th>
                      <th className="px-3 py-2 text-right">Settled</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {groupedByMonth.map((g) => (
                      <tr key={g.month} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{g.month}</td>
                        <td className="px-3 py-2 text-right">{g.count}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(g.total)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{fmtMoney(g.settled)}</td>
                        <td className="px-3 py-2 text-right text-orange-600">{fmtMoney(g.pending)}</td>
                      </tr>
                    ))}
                    {groupedByMonth.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No records found</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Customer-wise view */}
          {viewMode === 'customer' && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Customer-wise Summary</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-right">Records</th>
                      <th className="px-3 py-2 text-right">Total Credit</th>
                      <th className="px-3 py-2 text-right">Settled</th>
                      <th className="px-3 py-2 text-right">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {groupedByCustomer.map((g) => (
                      <tr key={g.customer} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium">{g.customer}</td>
                        <td className="px-3 py-2 text-right">{g.count}</td>
                        <td className="px-3 py-2 text-right">{fmtMoney(g.total)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">{fmtMoney(g.settled)}</td>
                        <td className="px-3 py-2 text-right text-orange-600">{fmtMoney(g.pending)}</td>
                      </tr>
                    ))}
                    {groupedByCustomer.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No records found</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
