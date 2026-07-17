import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Droplet, Wallet, AlertTriangle, Fuel, ArrowUpRight, Boxes } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { BarChart, LineChart, DonutChart } from '../components/Charts';
import { Loading, ErrorState } from '../components/ui/States';
import { Badge } from '../components/ui/Badge';
import { apiGet, fmtMoney, fmtNum, fmtDate } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import PriceUpdateModal from '../components/PriceUpdateModal';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
  const nav = useNavigate();
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [credit, setCredit] = useState<any[]>([]);
  const [unloadBatches, setUnloadBatches] = useState<any[]>([]);

  // Redirect data_entry users away from dashboard to their first allowed page
  useEffect(() => {
    if (role === 'data_entry') nav('/ops/sales', { replace: true });
  }, [role, nav]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [ds, t, p, c, u] = await Promise.all([
        apiGet('/api/daily-sales'),
        apiGet('/api/tanks'),
        apiGet('/api/products'),
        apiGet('/api/credit-sales'),
        apiGet('/api/tanker-unloading/batches'),
      ]);
      setDailySales(ds || []);
      setTanks(t || []);
      setProducts(p || []);
      setCredit(c || []);
      setUnloadBatches(u || []);
    } catch (e: any) { setError(e.message || 'Failed to load dashboard'); }
    finally { setLoading(false); }
  };
  const [showPriceModal, setShowPriceModal] = useState(false);

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const [ds, tk, p, c, u] = await Promise.all([
          apiGet('/api/daily-sales'),
          apiGet('/api/tanks'),
          apiGet('/api/products'),
          apiGet('/api/credit-sales'),
          apiGet('/api/tanker-unloading/batches'),
        ]);
        setDailySales(ds || []); setTanks(tk || []); setProducts(p || []); setCredit(c || []); setUnloadBatches(u || []);
      } catch (_) {}
    }, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!loading && !error) {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem('lastPriceUpdateDate') !== today) {
        setShowPriceModal(true);
      }
    }
  }, [loading, error]);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const totalSalesAmt = dailySales.reduce((s, x) => s + Number(x.total_sales_amount || 0), 0);
  const totalCredit = credit.filter((c) => c.status !== 'Paid').reduce((s, x) => s + Number(x.amount || 0), 0);
  const salesSubmittedVariance = dailySales.reduce((s, x) => s + Number(x.variance || 0), 0);

  const soldByProduct: Record<string, number> = {};
  const testingByProduct: Record<string, number> = {};
  dailySales.forEach((e) => {
    (e.daily_sales_nozzle_readings || []).forEach((r: any) => {
      const key = r.product_name || 'Other';
      soldByProduct[key] = (soldByProduct[key] || 0) + Number(r.volume || 0);
    });
    (e.daily_sales_testing || []).forEach((t: any) => {
      const key = t.product_name || 'Other';
      testingByProduct[key] = (testingByProduct[key] || 0) + Number(t.volume || 0);
    });
  });

  const netSoldByProduct: Record<string, number> = {};
  Object.keys({ ...soldByProduct, ...testingByProduct }).forEach((k) => {
    netSoldByProduct[k] = Math.max(0, Number(soldByProduct[k] || 0) - Number(testingByProduct[k] || 0));
  });

  const stockByProduct: Record<string, number> = {};
  tanks.forEach((t) => {
    const key = t.product_name || 'Other';
    stockByProduct[key] = (stockByProduct[key] || 0) + Number(t.current_volume || 0);
  });

  const renderProductLines = (values: Record<string, number>, emptyLabel: string) => {
    const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
      return <div className="text-2xl font-bold text-slate-800">{emptyLabel}</div>;
    }
    return (
      <div className="space-y-1.5">
        {entries.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-slate-500 truncate">{label}</span>
            <span className="text-lg font-bold text-slate-800 whitespace-nowrap">{fmtNum(value, 0)} L</span>
          </div>
        ))}
      </div>
    );
  };

  // sales by date (last 7 distinct)
  const byDate: Record<string, number> = {};
  dailySales.forEach((s) => { const d = (s.sale_date || '').slice(0, 10); byDate[d] = (byDate[d] || 0) + Number(s.total_sales_amount || 0); });
  const dateSeries = Object.entries(byDate).sort().slice(-7).map(([d, v]) => ({ label: fmtDate(d).slice(0, 6), value: Math.round(v) }));

  // sales by product
  const prodDonut = Object.entries(netSoldByProduct).map(([label, value], i) => ({ label, value: Math.round(value), color: COLORS[i % COLORS.length] }));

  // volume by shift
  const byShift: Record<string, number> = {};
  dailySales.forEach((s) => {
    const key = s.shift_name || 'Shift';
    const sold = (s.daily_sales_nozzle_readings || []).reduce((acc: number, r: any) => acc + Number(r.volume || 0), 0);
    const test = (s.daily_sales_testing || []).reduce((acc: number, r: any) => acc + Number(r.volume || 0), 0);
    byShift[key] = (byShift[key] || 0) + Math.max(0, sold - test);
  });
  const shiftBars = Object.entries(byShift).map(([label, value]) => ({ label, value: Math.round(value) }));

  const kpis: { label: string; value: ReactNode; icon: typeof Wallet; color: string }[] = [
    { label: 'Total Sales', value: <div className="text-2xl font-bold text-slate-800">{totalSalesAmt ? fmtMoney(totalSalesAmt) : '₹0.00'}</div>, icon: Wallet, color: 'blue' },
    { label: 'Volume Sold', value: renderProductLines(netSoldByProduct, 'No sales'), icon: Droplet, color: 'emerald' },
    { label: 'Current Stock', value: renderProductLines(stockByProduct, 'No stock'), icon: Boxes, color: 'violet' },
    { label: 'Outstanding Credit', value: <div className="text-2xl font-bold text-slate-800">{totalCredit ? fmtMoney(totalCredit) : '₹0.00'}</div>, icon: AlertTriangle, color: 'amber' },
  ];
  const colorMap: Record<string, string> = { blue: 'from-blue-500 to-blue-600', emerald: 'from-emerald-500 to-emerald-600', violet: 'from-violet-500 to-violet-600', amber: 'from-amber-500 to-amber-600' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Station Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Real-time overview of sales, inventory & finance</p>
        </div>
        <Badge color="green">● Live</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <div className="flex items-start justify-between">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorMap[k.color]} flex items-center justify-center shadow-sm`}><k.icon className="w-5 h-5 text-white" /></div>
            </div>
            <div className="mt-3">{k.value}<div className="text-xs text-slate-400 mt-1">{k.label}</div></div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="Sales Revenue Trend" subtitle="Last 7 reporting days" />
          <div className="p-5">{dateSeries.length ? <LineChart data={dateSeries} valueFmt={(n) => fmtMoney(n)} /> : <p className="text-sm text-slate-400 py-10 text-center">No sales data yet</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Volume by Product" subtitle="Share of litres sold" />
          <div className="p-5">{prodDonut.length ? <DonutChart data={prodDonut} /> : <p className="text-sm text-slate-400 py-10 text-center">No data</p>}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Volume by Shift" subtitle="Litres dispensed" />
          <div className="p-5">{shiftBars.length ? <BarChart data={shiftBars} color="#16a34a" valueFmt={(n) => fmtNum(n, 0) + ' L'} /> : <p className="text-sm text-slate-400 py-10 text-center">No data</p>}</div>
        </Card>
        <Card>
          <CardHeader title="Tank Stock Levels" subtitle="Current fill %" />
          <div className="p-5 space-y-3">
            {tanks.slice(0, 6).map((t) => {
              const pct = Math.min(100, (Number(t.current_volume) / Number(t.capacity || 1)) * 100);
              return (
                <div key={t.id}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 font-medium">{t.name}</span><span className="text-slate-400">{fmtNum(t.current_volume, 0)}/{fmtNum(t.capacity, 0)} L</span></div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${pct < 20 ? 'bg-rose-500' : pct < 40 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            {tanks.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No tanks configured</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Loss / Gain Summary" subtitle="Net variance" />
          <div className="p-5">
            <div className="text-center py-2">
              <div className={`text-3xl font-bold ${salesSubmittedVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{salesSubmittedVariance >= 0 ? '+' : ''}{fmtMoney(salesSubmittedVariance)}</div>
              <p className="text-xs text-slate-400 mt-1">Sales amount vs operator submitted amount</p>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tankers Received</span><span className="font-medium text-slate-700">{unloadBatches.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Products Tracked</span><span className="font-medium text-slate-700">{products.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sales Entries</span><span className="font-medium text-slate-700">{dailySales.length}</span></div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent Sales Activity" subtitle="Latest shift entries" action={<a href="/ops/sales" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5">View all <ArrowUpRight className="w-3 h-3" /></a>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Shift</th><th className="px-5 py-3">Operator</th><th className="px-5 py-3">Dispenser</th><th className="px-5 py-3 text-right">Amount</th><th className="px-5 py-3 text-right">Variance</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {dailySales.slice(0, 6).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-slate-600">{fmtDate(s.sale_date)}</td>
                  <td className="px-5 py-3"><Badge color="blue">{s.shift_name}</Badge></td>
                  <td className="px-5 py-3 text-slate-600">{s.operator_name}</td>
                  <td className="px-5 py-3 text-slate-600">{s.dispenser_name || '—'}</td>
                  <td className="px-5 py-3 text-right font-medium text-slate-800">{fmtMoney(s.total_sales_amount)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`font-semibold ${Number(s.variance || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{Number(s.variance || 0) >= 0 ? '+' : ''}{fmtMoney(s.variance)}</span>
                  </td>
                </tr>
              ))}
              {dailySales.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">No sales recorded yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {showPriceModal && <PriceUpdateModal onClose={() => setShowPriceModal(false)} />}
    </div>
  );
}
