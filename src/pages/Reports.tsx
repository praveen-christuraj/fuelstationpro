import { useEffect, useMemo, useState } from 'react';
import { Download, Filter } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { LineChart, BarChart } from '../components/Charts';
import { Loading, ErrorState } from '../components/ui/States';
import { apiGet, fmtMoney, fmtNum } from '../lib/api';
import { toCSV, downloadCSV } from '../lib/csv';

type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export default function Reports() {
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('monthly');
  const [productFilter, setProductFilter] = useState('all');
  const [operatorFilter, setOperatorFilter] = useState('all');
  const [dispenserFilter, setDispenserFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setDailySales(await apiGet('/api/daily-sales'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const products = useMemo(() => {
    const set = new Set<string>();
    (dailySales || []).forEach((e) => {
      (e.daily_sales_nozzle_readings || []).forEach((r: any) => { if (r.product_name) set.add(r.product_name); });
      (e.daily_sales_testing || []).forEach((t: any) => { if (t.product_name) set.add(t.product_name); });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [dailySales]);

  const operators = useMemo(() => {
    return Array.from(new Set((dailySales || []).map((e) => e.operator_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [dailySales]);

  const dispensers = useMemo(() => {
    return Array.from(new Set((dailySales || []).map((e) => e.dispenser_name).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [dailySales]);

  const filteredEntries = useMemo(() => {
    return (dailySales || []).filter((e) => {
      if (operatorFilter !== 'all' && e.operator_name !== operatorFilter) return false;
      if (dispenserFilter !== 'all' && e.dispenser_name !== dispenserFilter) return false;
      return true;
    });
  }, [dailySales, operatorFilter, dispenserFilter]);

  const derived = useMemo(() => {
    return filteredEntries.map((e) => {
      const soldByProduct: Record<string, { volume: number; amount: number }> = {};
      const testByProduct: Record<string, { volume: number; amount: number }> = {};
      (e.daily_sales_nozzle_readings || []).forEach((r: any) => {
        const k = r.product_name || 'Other';
        soldByProduct[k] = soldByProduct[k] || { volume: 0, amount: 0 };
        soldByProduct[k].volume += Number(r.volume || 0);
        soldByProduct[k].amount += Number(r.amount || 0);
      });
      (e.daily_sales_testing || []).forEach((t: any) => {
        const k = t.product_name || 'Other';
        testByProduct[k] = testByProduct[k] || { volume: 0, amount: 0 };
        testByProduct[k].volume += Number(t.volume || 0);
        testByProduct[k].amount += Number(t.amount || 0);
      });
      const netByProduct: Record<string, { volume: number; amount: number }> = {};
      Object.keys({ ...soldByProduct, ...testByProduct }).forEach((k) => {
        const sold = soldByProduct[k] || { volume: 0, amount: 0 };
        const test = testByProduct[k] || { volume: 0, amount: 0 };
        netByProduct[k] = { volume: Math.max(0, sold.volume - test.volume), amount: sold.amount - test.amount };
      });
      const netVolumeTotal = Object.values(netByProduct).reduce((s, v) => s + Number(v.volume || 0), 0);
      return { entry: e, netByProduct, netVolumeTotal };
    });
  }, [filteredEntries]);

  const bucketKey = (d: string) => {
    const date = new Date(d);
    if (period === 'daily') return d.slice(0, 10);
    if (period === 'monthly') return d.slice(0, 7);
    if (period === 'quarterly') return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
    return String(date.getFullYear());
  };

  const grouped = useMemo(() => {
    const m: Record<string, { amount: number; volume: number; count: number }> = {};
    if (productFilter === 'all') {
      derived.forEach((d) => {
        const e = d.entry;
        const k = bucketKey(e.sale_date || '');
        m[k] = m[k] || { amount: 0, volume: 0, count: 0 };
        m[k].amount += Number(e.total_sales_amount || 0);
        m[k].volume += Number(d.netVolumeTotal || 0);
        m[k].count++;
      });
    } else {
      derived.forEach((d) => {
        const e = d.entry;
        const net = d.netByProduct[productFilter];
        if (!net) return;
        const k = bucketKey(e.sale_date || '');
        m[k] = m[k] || { amount: 0, volume: 0, count: 0 };
        m[k].amount += Number(net.amount || 0);
        m[k].volume += Number(net.volume || 0);
        m[k].count++;
      });
    }
    return Object.entries(m).sort().map(([period, v]) => ({ period, ...v }));
  }, [derived, period, productFilter]);

  const revenueSeries = grouped.slice(-12).map((g) => ({ label: g.period.slice(-7), value: Math.round(g.amount) }));
  const volumeBars = grouped.slice(-12).map((g) => ({ label: g.period.slice(-7), value: Math.round(g.volume) }));
  const totalRev = grouped.reduce((s, g) => s + g.amount, 0);
  const totalVol = grouped.reduce((s, g) => s + g.volume, 0);

  const exportReport = () => downloadCSV(`report_${period}.csv`, toCSV(grouped.map((g) => ({ period: g.period, revenue: g.amount.toFixed(2), volume_liters: g.volume.toFixed(2), entries: g.count }))));

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-800">Advanced Reports</h1><p className="text-sm text-slate-400 mt-0.5">Sales analytics with period & product drill-down</p></div>
        <button onClick={exportReport} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><Download className="w-4 h-4" /> Export Report</button>
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600"><Filter className="w-4 h-4" /> Filters</span>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">{(['daily', 'monthly', 'quarterly', 'yearly'] as Period[]).map((p) => <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${period === p ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{p}</button>)}</div>
          <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"><option value="all">All Products</option>{products.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <select value={operatorFilter} onChange={(e) => setOperatorFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"><option value="all">All Operators</option>{operators.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          <select value={dispenserFilter} onChange={(e) => setDispenserFilter(e.target.value)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"><option value="all">All Dispensers</option>{dispensers.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </div>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5"><div className="text-xs text-slate-400">Total Revenue</div><div className="text-2xl font-bold text-slate-800 mt-1">{fmtMoney(totalRev)}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-400">Total Volume</div><div className="text-2xl font-bold text-slate-800 mt-1">{fmtNum(totalVol, 0)} L</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-400">Reporting Periods</div><div className="text-2xl font-bold text-slate-800 mt-1">{grouped.length}</div></Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader title="Revenue Trend" subtitle={`By ${period}`} /><div className="p-5">{revenueSeries.length ? <LineChart data={revenueSeries} valueFmt={(n) => fmtMoney(n)} /> : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}</div></Card>
        <Card><CardHeader title="Volume Dispensed" subtitle={`By ${period}`} /><div className="p-5">{volumeBars.length ? <BarChart data={volumeBars} color="#16a34a" valueFmt={(n) => fmtNum(n, 0) + ' L'} /> : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}</div></Card>
      </div>
      <Card>
        <CardHeader title="Period Breakdown" />
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50"><th className="px-5 py-3">Period</th><th className="px-5 py-3 text-right">Revenue</th><th className="px-5 py-3 text-right">Volume (L)</th><th className="px-5 py-3 text-right">Entries</th></tr></thead><tbody className="divide-y divide-slate-50">{grouped.slice().reverse().map((g) => <tr key={g.period} className="hover:bg-slate-50/60"><td className="px-5 py-3 font-medium text-slate-700">{g.period}</td><td className="px-5 py-3 text-right text-slate-700">{fmtMoney(g.amount)}</td><td className="px-5 py-3 text-right text-slate-600">{fmtNum(g.volume, 0)}</td><td className="px-5 py-3 text-right text-slate-600">{g.count}</td></tr>)}{grouped.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">No sales data</td></tr>}</tbody></table></div>
      </Card>
    </div>
  );
}
