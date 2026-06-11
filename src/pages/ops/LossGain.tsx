import { useEffect, useState } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Loading, ErrorState } from '../../components/ui/States';
import { BarChart } from '../../components/Charts';
import { Badge } from '../../components/ui/Badge';
import { apiGet, fmtNum } from '../../lib/api';
import { buildLossGainRows } from '../../lib/loss-gain';
import { TrendingUp, TrendingDown } from 'lucide-react';

export default function LossGain() {
  const [sales, setSales] = useState<any[]>([]);
  const [tanks, setTanks] = useState<any[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const [unloads, setUnloads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, t, m, u] = await Promise.all([
        apiGet('/api/sales'),
        apiGet('/api/tanks'),
        apiGet('/api/stock-movements'),
        apiGet('/api/tanker-unloading'),
      ]);
      setSales(s); setTanks(t); setMoves(m); setUnloads(u);
    }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const rows = buildLossGainRows({ sales, tanks, moves, unloads });
  const totalVar = rows.reduce((s, r) => s + r.variance, 0);
  const bars = rows.map((r) => ({ label: r.product.slice(0, 8), value: Math.round(r.variance) }));

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-800">Loss / Gain Analysis</h1><p className="text-sm text-slate-400 mt-0.5">Reconcile physical tank stock against book stock (receipts − sales − testing)</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">{totalVar >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />} Net Variance</div>
          <div className={`text-3xl font-bold mt-1 ${totalVar >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totalVar >= 0 ? '+' : ''}{fmtNum(totalVar, 1)} L</div>
          <p className="text-xs text-slate-400 mt-1">{totalVar >= 0 ? 'Net gain across products' : 'Net loss across products'}</p>
        </Card>
        <Card className="lg:col-span-2"><CardHeader title="Variance by Product" subtitle="Physical vs book stock (L)" /><div className="p-5">{bars.length ? <BarChart data={bars} color="#8b5cf6" valueFmt={(n) => fmtNum(n, 0) + ' L'} /> : <p className="text-sm text-slate-400 text-center py-8">No data</p>}</div></Card>
      </div>
      <Card>
        <CardHeader title="Reconciliation Detail" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm"><thead><tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50"><th className="px-5 py-3">Product</th><th className="px-5 py-3 text-right">Receipts</th><th className="px-5 py-3 text-right">Adj. In</th><th className="px-5 py-3 text-right">Adj. Out</th><th className="px-5 py-3 text-right">Sold</th><th className="px-5 py-3 text-right">Testing</th><th className="px-5 py-3 text-right">Book Stock</th><th className="px-5 py-3 text-right">Physical Stock</th><th className="px-5 py-3 text-right">Variance</th></tr></thead>
          <tbody className="divide-y divide-slate-50">{rows.map((r) => (<tr key={r.product} className="hover:bg-slate-50/60"><td className="px-5 py-3 font-medium text-slate-700">{r.product}</td><td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.receipts, 0)}</td><td className="px-5 py-3 text-right text-emerald-600">{fmtNum(r.adjIn, 0)}</td><td className="px-5 py-3 text-right text-rose-600">{fmtNum(r.adjOut, 0)}</td><td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.sold, 0)}</td><td className="px-5 py-3 text-right text-amber-600">{fmtNum(r.testing, 0)}</td><td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.bookStock, 0)}</td><td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.tankVol, 0)}</td><td className="px-5 py-3 text-right"><Badge color={r.variance < -5 ? 'red' : r.variance > 5 ? 'green' : 'slate'}>{r.variance >= 0 ? '+' : ''}{fmtNum(r.variance, 1)} L</Badge></td></tr>))}{rows.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">No data to reconcile</td></tr>}</tbody></table>
        </div>
      </Card>
    </div>
  );
}
