import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Field, Input } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';
import { BarChart } from '../../components/Charts';
import { apiGet, fmtDate, fmtNum } from '../../lib/api';

export default function LossGain() {
  const [tanks, setTanks] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [unloadLines, setUnloadLines] = useState<any[]>([]);
  const [dipReadings, setDipReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [t, ds, u, d] = await Promise.all([
        apiGet('/api/tanks'),
        apiGet('/api/daily-sales'),
        apiGet('/api/tanker-unloading'),
        apiGet(`/api/dip-readings?reading_date=${encodeURIComponent(date)}`),
      ]);
      setTanks(t || []);
      setDailySales(ds || []);
      setUnloadLines(u || []);
      setDipReadings(d || []);
    }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [date]);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const byTankRows = useMemo(() => {
    const dipsForDate = (dipReadings || []).filter((r) => r.reading_date === date);
    const openingByTank = new Map<string, number>();
    const closingByTank = new Map<string, number>();
    for (const r of dipsForDate) {
      if (r.reading_type === 'opening') openingByTank.set(r.tank_name, Number(r.volume_liters || 0));
      if (r.reading_type === 'closing') closingByTank.set(r.tank_name, Number(r.volume_liters || 0));
    }

    const receiptsByTank = new Map<string, number>();
    for (const u of unloadLines || []) {
      if (u.unload_date !== date) continue;
      const tankName = String(u.tank_name || '').trim();
      if (!tankName) continue;
      receiptsByTank.set(tankName, (receiptsByTank.get(tankName) || 0) + Number(u.received_volume || 0));
    }

    const salesEntries = (dailySales || []).filter((e) => e.sale_date === date);
    const salesByTank = new Map<string, number>();
    const testingByTank = new Map<string, number>();
    for (const e of salesEntries) {
      for (const r of e.daily_sales_nozzle_readings || []) {
        const tankName = String(r.tank_name || '').trim();
        if (!tankName) continue;
        salesByTank.set(tankName, (salesByTank.get(tankName) || 0) + Number(r.volume || 0));
      }
      for (const t of e.daily_sales_testing || []) {
        const tankName = String(t.tank_name || '').trim();
        if (!tankName) continue;
        testingByTank.set(tankName, (testingByTank.get(tankName) || 0) + Number(t.volume || 0));
      }
    }

    return (tanks || []).map((tank) => {
      const opening = openingByTank.get(tank.name) ?? Number(tank.current_volume || 0);
      const actualClosing = closingByTank.get(tank.name) ?? Number(tank.current_volume || 0);
      const receipts = receiptsByTank.get(tank.name) || 0;
      const salesOut = salesByTank.get(tank.name) || 0;
      const testing = testingByTank.get(tank.name) || 0;
      const expectedClosing = opening + receipts - salesOut + testing;
      const variance = actualClosing - expectedClosing;
      return {
        tank: tank.name,
        product: tank.product_name,
        opening,
        receipts,
        salesOut,
        testing,
        expectedClosing,
        actualClosing,
        variance,
      };
    });
  }, [tanks, dailySales, unloadLines, dipReadings, date]);

  const totalVar = byTankRows.reduce((s, r) => s + Number(r.variance || 0), 0);
  const bars = byTankRows.map((r) => ({ label: r.tank.slice(0, 10), value: Math.round(Number(r.variance || 0)) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Loss / Gain Analysis</h1>
          <p className="text-sm text-slate-400 mt-0.5">Daily reconciliation using dip readings + tanker receipts + nozzle outflow</p>
        </div>
        <div className="w-full sm:w-56">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">{totalVar >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />} Net Variance</div>
          <div className={`text-3xl font-bold mt-1 ${totalVar >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totalVar >= 0 ? '+' : ''}{fmtNum(totalVar, 1)} L</div>
          <p className="text-xs text-slate-400 mt-1">{fmtDate(date)}</p>
        </Card>
        <Card className="lg:col-span-2"><CardHeader title="Variance by Tank" subtitle="Actual dip closing vs expected closing (L)" /><div className="p-5">{bars.length ? <BarChart data={bars} color="#8b5cf6" valueFmt={(n) => fmtNum(n, 0) + ' L'} /> : <p className="text-sm text-slate-400 text-center py-8">No data</p>}</div></Card>
      </div>
      <Card>
        <CardHeader title="Reconciliation Detail" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3">Tank</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">Opening</th>
                <th className="px-5 py-3 text-right">Receipts</th>
                <th className="px-5 py-3 text-right">Outflow</th>
                <th className="px-5 py-3 text-right">Testing</th>
                <th className="px-5 py-3 text-right">Expected Closing</th>
                <th className="px-5 py-3 text-right">Actual Closing</th>
                <th className="px-5 py-3 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {byTankRows.map((r) => (
                <tr key={r.tank} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-700">{r.tank}</td>
                  <td className="px-5 py-3 text-slate-600">{r.product}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.opening, 0)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{fmtNum(r.receipts, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.salesOut, 0)}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{fmtNum(r.testing, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.expectedClosing, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.actualClosing, 0)}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge color={r.variance < -5 ? 'red' : r.variance > 5 ? 'green' : 'slate'}>{r.variance >= 0 ? '+' : ''}{fmtNum(r.variance, 1)} L</Badge>
                  </td>
                </tr>
              ))}
              {byTankRows.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">No data to reconcile</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
