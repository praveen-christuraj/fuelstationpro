import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Droplet, Wallet, AlertTriangle, Fuel, ArrowUpRight, Boxes } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { BarChart, LineChart, DonutChart } from '../components/Charts';
import { Loading, ErrorState } from '../components/ui/States';
import { Badge } from '../components/ui/Badge';
import { apiGet, fmtMoney, fmtNum, fmtDate } from '../lib/api';

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sales, setSales] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [credit, setCredit] = useState<any[]>([]);
  const [unload, setUnload] = useState<any[]>([]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, t, p, c, u] = await Promise.all([
        apiGet('/api/sales'), apiGet('/api/tanks'), apiGet('/api/products'), apiGet('/api/credit-sales'), apiGet('/api/tanker-unloading'),
      ]);
      setSales(s); setTanks(t); setProducts(p); setCredit(c); setUnload(u);
    } catch (e: any) { setError(e.message || 'Failed to load dashboard'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const totalSalesAmt = sales.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const totalVol = sales.reduce((s, x) => s + Number(x.sale_volume || 0), 0);
  const totalCredit = credit.filter((c) => c.status !== 'Paid').reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalStock = tanks.reduce((s, t) => s + Number(t.current_volume || 0), 0);
  const totalLossGain = sales.reduce((s, x) => s + Number(x.loss_gain || 0), 0);

  // sales by date (last 7 distinct)
  const byDate: Record<string, number> = {};
  sales.forEach((s) => { const d = (s.sale_date || '').slice(0, 10); byDate[d] = (byDate[d] || 0) + Number(s.total_amount || 0); });
  const dateSeries = Object.entries(byDate).sort().slice(-7).map(([d, v]) => ({ label: fmtDate(d).slice(0, 6), value: Math.round(v) }));

  // sales by product
  const byProduct: Record<string, number> = {};
  sales.forEach((s) => { byProduct[s.product_name || 'Other'] = (byProduct[s.product_name || 'Other'] || 0) + Number(s.sale_volume || 0); });
  const prodDonut = Object.entries(byProduct).map(([label, value], i) => ({ label, value: Math.round(value), color: COLORS[i % COLORS.length] }));

  // volume by shift
  const byShift: Record<string, number> = {};
  sales.forEach((s) => { byShift[s.shift_name || 'Shift'] = (byShift[s.shift_name || 'Shift'] || 0) + Number(s.sale_volume || 0); });
  const shiftBars = Object.entries(byShift).map(([label, value]) => ({ label, value: Math.round(value) }));

  const kpis = [
    { label: 'Total Sales', value: fmtMoney(totalSalesAmt), icon: Wallet, color: 'blue', trend: '+12.4%', up: true },
    { label: 'Volume Dispensed', value: fmtNum(totalVol, 0) + ' L', icon: Droplet, color: 'emerald', trend: '+8.1%', up: true },
    { label: 'Current Stock', value: fmtNum(totalStock, 0) + ' L', icon: Boxes, color: 'violet', trend: `${tanks.length} tanks`, up: true },
    { label: 'Outstanding Credit', value: fmtMoney(totalCredit), icon: AlertTriangle, color: 'amber', trend: `${credit.filter((c) => c.status !== 'Paid').length} open`, up: false },
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
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${k.up ? 'text-emerald-600' : 'text-amber-600'}`}>{k.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{k.trend}</span>
            </div>
            <div className="mt-3"><div className="text-2xl font-bold text-slate-800">{k.value}</div><div className="text-xs text-slate-400 mt-0.5">{k.label}</div></div>
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
              <div className={`text-3xl font-bold ${totalLossGain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totalLossGain >= 0 ? '+' : ''}{fmtNum(totalLossGain, 1)} L</div>
              <p className="text-xs text-slate-400 mt-1">Cumulative meter vs book variance</p>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tankers Received</span><span className="font-medium text-slate-700">{unload.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Products Tracked</span><span className="font-medium text-slate-700">{products.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sales Records</span><span className="font-medium text-slate-700">{sales.length}</span></div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent Sales Activity" subtitle="Latest shift entries" action={<a href="/ops/sales" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5">View all <ArrowUpRight className="w-3 h-3" /></a>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50"><th className="px-5 py-3">Date</th><th className="px-5 py-3">Product</th><th className="px-5 py-3">Operator</th><th className="px-5 py-3">Shift</th><th className="px-5 py-3 text-right">Volume</th><th className="px-5 py-3 text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {sales.slice(0, 6).map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-slate-600">{fmtDate(s.sale_date)}</td>
                  <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5"><Fuel className="w-3.5 h-3.5 text-blue-500" />{s.product_name}</span></td>
                  <td className="px-5 py-3 text-slate-600">{s.operator_name}</td>
                  <td className="px-5 py-3"><Badge color="blue">{s.shift_name}</Badge></td>
                  <td className="px-5 py-3 text-right text-slate-700">{fmtNum(s.sale_volume, 1)} L</td>
                  <td className="px-5 py-3 text-right font-medium text-slate-800">{fmtMoney(s.total_amount)}</td>
                </tr>
              ))}
              {sales.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">No sales recorded yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
