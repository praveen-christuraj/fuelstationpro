import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Field, Input, Select } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';
import { BarChart } from '../../components/Charts';
import { apiGet, fmtDate, fmtNum } from '../../lib/api';

type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

type DailyTankRow = {
  date: string;
  tank: string;
  product: string;
  opening: number | null;
  receipts: number;
  dispatch: number;
  testing: number;
  bookClosing: number | null;
  physicalClosing: number | null;
  variance: number | null;
};

export default function LossGain() {
  const [tanks, setTanks] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [unloadLines, setUnloadLines] = useState<any[]>([]);
  const [dipReadings, setDipReadings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<Period>('daily');
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(today.slice(0, 4));
  const [quarterYear, setQuarterYear] = useState(today.slice(0, 4));
  const [quarter, setQuarter] = useState(String(Math.floor(new Date().getMonth() / 3) + 1));

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [t, ds, u, d] = await Promise.all([
        apiGet('/api/tanks'),
        apiGet('/api/daily-sales'),
        apiGet('/api/tanker-unloading'),
        apiGet('/api/dip-readings'),
      ]);
      setTanks(t || []);
      setDailySales(ds || []);
      setUnloadLines(u || []);
      setDipReadings(d || []);
    }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const quarterKey = (d: string) => {
    const dt = new Date(d);
    return `${dt.getFullYear()}-Q${Math.floor(dt.getMonth() / 3) + 1}`;
  };

  const dailyRows = useMemo<DailyTankRow[]>(() => {
    const dipMap = new Map<string, number>();
    (dipReadings || []).forEach((r) => {
      dipMap.set(`${r.reading_date}||${r.tank_name}||${r.reading_type}`, Number(r.volume_liters || 0));
    });

    const receiptsMap = new Map<string, number>();
    (unloadLines || []).forEach((u) => {
      const tankName = String(u.tank_name || '').trim();
      const unloadDate = String(u.unload_date || '').trim();
      if (!tankName || !unloadDate) return;
      const key = `${unloadDate}||${tankName}`;
      receiptsMap.set(key, (receiptsMap.get(key) || 0) + Number(u.received_volume || 0));
    });

    const dispatchMap = new Map<string, number>();
    const testingMap = new Map<string, number>();
    (dailySales || []).forEach((entry) => {
      const saleDate = String(entry.sale_date || '').trim();
      (entry.daily_sales_nozzle_readings || []).forEach((r: any) => {
        const tankName = String(r.tank_name || '').trim();
        if (!saleDate || !tankName) return;
        const key = `${saleDate}||${tankName}`;
        dispatchMap.set(key, (dispatchMap.get(key) || 0) + Number(r.volume || 0));
      });
      (entry.daily_sales_testing || []).forEach((t: any) => {
        const tankName = String(t.tank_name || '').trim();
        if (!saleDate || !tankName) return;
        const key = `${saleDate}||${tankName}`;
        testingMap.set(key, (testingMap.get(key) || 0) + Number(t.volume || 0));
      });
    });

    const allDates = Array.from(new Set([
      ...(dipReadings || []).map((r) => r.reading_date),
      ...(unloadLines || []).map((u) => u.unload_date),
      ...(dailySales || []).map((e) => e.sale_date),
    ].filter(Boolean))).sort();

    const rows: DailyTankRow[] = [];
    (tanks || []).forEach((tank) => {
      let lastPhysical: number | null = null;
      allDates.forEach((businessDate) => {
        const opening = dipMap.get(`${businessDate}||${tank.name}||opening`) ?? lastPhysical;
        const physicalClosing = dipMap.get(`${businessDate}||${tank.name}||closing`) ?? null;
        const receipts = receiptsMap.get(`${businessDate}||${tank.name}`) || 0;
        const dispatch = dispatchMap.get(`${businessDate}||${tank.name}`) || 0;
        const testing = testingMap.get(`${businessDate}||${tank.name}`) || 0;
        const bookClosing = opening == null ? null : opening + receipts - dispatch;
        const variance = physicalClosing == null || bookClosing == null ? null : physicalClosing - bookClosing;

        if (opening != null || receipts > 0 || dispatch > 0 || physicalClosing != null || testing > 0) {
          rows.push({
            date: businessDate,
            tank: tank.name,
            product: tank.product_name,
            opening,
            receipts,
            dispatch,
            testing,
            bookClosing,
            physicalClosing,
            variance,
          });
        }

        if (physicalClosing != null) lastPhysical = physicalClosing;
      });
    });
    return rows;
  }, [dipReadings, unloadLines, dailySales, tanks]);

  const selectedRows = useMemo(() => {
    return dailyRows.filter((row) => {
      if (period === 'daily') return row.date === date;
      if (period === 'monthly') return row.date.startsWith(month);
      if (period === 'quarterly') return quarterKey(row.date) === `${quarterYear}-Q${quarter}`;
      return row.date.startsWith(year);
    });
  }, [dailyRows, period, date, month, quarterYear, quarter, year]);

  const byTankRows = useMemo(() => {
    const grouped = new Map<string, DailyTankRow[]>();
    selectedRows.forEach((row) => {
      if (!grouped.has(row.tank)) grouped.set(row.tank, []);
      grouped.get(row.tank)!.push(row);
    });

    return Array.from(grouped.entries()).map(([tankName, rows]) => {
      const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
      const firstOpening = sorted.find((r) => r.opening != null)?.opening ?? null;
      const receipts = sorted.reduce((s, r) => s + r.receipts, 0);
      const dispatch = sorted.reduce((s, r) => s + r.dispatch, 0);
      const testing = sorted.reduce((s, r) => s + r.testing, 0);
      const lastPhysical = [...sorted].reverse().find((r) => r.physicalClosing != null)?.physicalClosing ?? null;
      const bookClosing = firstOpening == null ? null : firstOpening + receipts - dispatch;
      const variance = lastPhysical == null || bookClosing == null ? null : lastPhysical - bookClosing;
      return {
        tank: tankName,
        product: sorted[0]?.product || '',
        opening: firstOpening,
        receipts,
        dispatch,
        testing,
        bookClosing,
        physicalClosing: lastPhysical,
        variance,
      };
    }).sort((a, b) => a.tank.localeCompare(b.tank));
  }, [selectedRows]);

  const breakdownRows = useMemo(() => {
    const grouped = new Map<string, { receipts: number; dispatch: number; testing: number; variance: number; reconciled: number }>();
    selectedRows.forEach((row) => {
      const key =
        period === 'daily' ? row.date :
        period === 'monthly' ? row.date :
        row.date.slice(0, 7);
      if (!grouped.has(key)) grouped.set(key, { receipts: 0, dispatch: 0, testing: 0, variance: 0, reconciled: 0 });
      const item = grouped.get(key)!;
      item.receipts += row.receipts;
      item.dispatch += row.dispatch;
      item.testing += row.testing;
      if (row.variance != null) {
        item.variance += row.variance;
        item.reconciled += 1;
      }
    });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, item]) => ({ label, ...item }));
  }, [selectedRows, period]);

  const totalVar = byTankRows.reduce((s, r) => s + Number(r.variance || 0), 0);
  const totalReceipts = byTankRows.reduce((s, r) => s + Number(r.receipts || 0), 0);
  const totalDispatch = byTankRows.reduce((s, r) => s + Number(r.dispatch || 0), 0);
  const reconciledTanks = byTankRows.filter((r) => r.variance != null).length;
  const varianceBars = byTankRows.filter((r) => r.variance != null).map((r) => ({ label: r.tank.slice(0, 10), value: Math.round(Number(r.variance || 0)) }));
  const trendBars = breakdownRows.map((r) => ({ label: r.label.slice(-7), value: Math.round(r.variance || 0) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Loss / Gain Analysis</h1>
          <p className="text-sm text-slate-400 mt-0.5">Material balance: Book closing = Opening stock + Receipt - Dispatch, and Loss/Gain = Physical closing - Book closing</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(['daily', 'monthly', 'quarterly', 'yearly'] as Period[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize ${period === p ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{p}</button>
            ))}
          </div>
          {period === 'daily' && (
            <div className="w-44">
              <Field label="Date">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          )}
          {period === 'monthly' && (
            <div className="w-40">
              <Field label="Month">
                <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </Field>
            </div>
          )}
          {period === 'quarterly' && (
            <>
              <div className="w-32">
                <Field label="Year">
                  <Input type="number" min="2000" max="2100" value={quarterYear} onChange={(e) => setQuarterYear(e.target.value)} />
                </Field>
              </div>
              <div className="w-32">
                <Field label="Quarter">
                  <Select value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                    <option value="1">Q1</option>
                    <option value="2">Q2</option>
                    <option value="3">Q3</option>
                    <option value="4">Q4</option>
                  </Select>
                </Field>
              </div>
            </>
          )}
          {period === 'yearly' && (
            <div className="w-32">
              <Field label="Year">
                <Input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-slate-500">{totalVar >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />} Net Variance</div>
          <div className={`text-3xl font-bold mt-1 ${totalVar >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totalVar >= 0 ? '+' : ''}{fmtNum(totalVar, 1)} L</div>
          <p className="text-xs text-slate-400 mt-1">{period === 'daily' ? fmtDate(date) : period === 'monthly' ? month : period === 'quarterly' ? `${quarterYear} Q${quarter}` : year}</p>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Receipts</div>
          <div className="text-3xl font-bold mt-1 text-slate-800">{fmtNum(totalReceipts, 1)} L</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Dispatch</div>
          <div className="text-3xl font-bold mt-1 text-slate-800">{fmtNum(totalDispatch, 1)} L</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Tanks Reconciled</div>
          <div className="text-3xl font-bold mt-1 text-slate-800">{reconciledTanks}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card><CardHeader title="Variance by Tank" subtitle="Physical closing minus book closing" /><div className="p-5">{varianceBars.length ? <BarChart data={varianceBars} color="#8b5cf6" valueFmt={(n) => fmtNum(n, 0) + ' L'} /> : <p className="text-sm text-slate-400 text-center py-8">No reconciled tank data</p>}</div></Card>
        <Card><CardHeader title="Period Drill-Through" subtitle={period === 'daily' ? 'Selected date' : period === 'monthly' ? 'Date-wise within month' : 'Month-wise within period'} /><div className="p-5">{trendBars.length ? <BarChart data={trendBars} color="#2563eb" valueFmt={(n) => fmtNum(n, 0) + ' L'} /> : <p className="text-sm text-slate-400 text-center py-8">No period data</p>}</div></Card>
      </div>

      <Card>
        <CardHeader title="Reconciliation Detail" subtitle="Dispatch uses gross nozzle outflow; testing is shown separately for reference" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3">Tank</th>
                <th className="px-5 py-3">Product</th>
                <th className="px-5 py-3 text-right">Opening</th>
                <th className="px-5 py-3 text-right">Receipts</th>
                <th className="px-5 py-3 text-right">Dispatch</th>
                <th className="px-5 py-3 text-right">Testing</th>
                <th className="px-5 py-3 text-right">Book Closing</th>
                <th className="px-5 py-3 text-right">Physical Closing</th>
                <th className="px-5 py-3 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {byTankRows.map((r) => (
                <tr key={r.tank} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-700">{r.tank}</td>
                  <td className="px-5 py-3 text-slate-600">{r.product}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.opening == null ? '—' : fmtNum(r.opening, 0)}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{fmtNum(r.receipts, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.dispatch, 0)}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{fmtNum(r.testing, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.bookClosing == null ? '—' : fmtNum(r.bookClosing, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.physicalClosing == null ? '—' : fmtNum(r.physicalClosing, 0)}</td>
                  <td className="px-5 py-3 text-right">
                    {r.variance == null ? <Badge color="slate">Pending</Badge> : <Badge color={r.variance < -5 ? 'red' : r.variance > 5 ? 'green' : 'slate'}>{r.variance >= 0 ? '+' : ''}{fmtNum(r.variance, 1)} L</Badge>}
                  </td>
                </tr>
              ))}
              {byTankRows.length === 0 && <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400">No data to reconcile</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader title="Period Breakdown" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3">Period</th>
                <th className="px-5 py-3 text-right">Receipts</th>
                <th className="px-5 py-3 text-right">Dispatch</th>
                <th className="px-5 py-3 text-right">Testing</th>
                <th className="px-5 py-3 text-right">Variance</th>
                <th className="px-5 py-3 text-right">Reconciled Tanks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {breakdownRows.map((r) => (
                <tr key={r.label} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 font-medium text-slate-700">{r.label}</td>
                  <td className="px-5 py-3 text-right text-emerald-600">{fmtNum(r.receipts, 0)}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{fmtNum(r.dispatch, 0)}</td>
                  <td className="px-5 py-3 text-right text-amber-600">{fmtNum(r.testing, 0)}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge color={r.variance < -5 ? 'red' : r.variance > 5 ? 'green' : 'slate'}>{r.variance >= 0 ? '+' : ''}{fmtNum(r.variance, 1)} L</Badge>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">{r.reconciled}</td>
                </tr>
              ))}
              {breakdownRows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400">No period data</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
