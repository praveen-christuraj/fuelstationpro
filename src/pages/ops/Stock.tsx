import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown } from 'lucide-react';
import MasterTable from '../../components/MasterTable';
import { Card } from '../../components/ui/Card';
import { apiGet, fmtNum } from '../../lib/api';
import { fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Field, Input } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';

export default function Stock() {
  const [moves, setMoves] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [unloading, setUnloading] = useState<any[]>([]);
  const [stockError, setStockError] = useState('');
  const [loading, setLoading] = useState(true);
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));

  const load = async () => {
    setLoading(true);
    setStockError('');
    try {
      const [moveRows, salesRows, unloadingRows] = await Promise.all([
        apiGet('/api/stock-movements'),
        apiGet('/api/daily-sales'),
        apiGet('/api/tanker-unloading'),
      ]);
      setMoves(moveRows || []);
      setDailySales(salesRows || []);
      setUnloading(unloadingRows || []);
    } catch (e: any) {
      setStockError(e.message || 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const derived = useMemo(() => {
    const receipts = unloading
      .filter((u) => u.unload_date === businessDate)
      .reduce((s, u) => s + Number(u.received_volume || 0), 0);
    const dispatch = dailySales
      .filter((e) => e.sale_date === businessDate)
      .reduce((sum, entry) => sum + (entry.daily_sales_nozzle_readings || []).reduce((s: number, row: any) => s + Number(row.volume || 0), 0), 0);
    const testing = dailySales
      .filter((e) => e.sale_date === businessDate)
      .reduce((sum, entry) => sum + (entry.daily_sales_testing || []).reduce((s: number, row: any) => s + Number(row.volume || 0), 0), 0);
    const manualIn = moves
      .filter((m) => m.movement_date === businessDate && m.movement_type === 'IN')
      .reduce((s, m) => s + Number(m.volume || 0), 0);
    const manualOut = moves
      .filter((m) => m.movement_date === businessDate && m.movement_type === 'OUT')
      .reduce((s, m) => s + Number(m.volume || 0), 0);
    return { receipts, dispatch, testing, manualIn, manualOut };
  }, [unloading, dailySales, moves, businessDate]);

  if (loading) return <Loading />;
  if (stockError) return <ErrorState message={stockError} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Stock In / Out</h1>
          <p className="text-sm text-slate-400 mt-0.5">Receipts come from tanker unloading, dispatch comes from Daily Sales Entry, and stock movements below remain manual adjustments only</p>
        </div>
        <div className="w-full sm:w-56">
          <Field label="Business Date">
            <Input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><ArrowDownToLine className="w-5 h-5 text-emerald-600" /></div><div><div className="text-xs text-slate-400">Tanker Receipts</div><div className="text-xl font-bold text-slate-800">{fmtNum(derived.receipts, 0)} L</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center"><ArrowUpFromLine className="w-5 h-5 text-rose-600" /></div><div><div className="text-xs text-slate-400">Sales Dispatch</div><div className="text-xl font-bold text-slate-800">{fmtNum(derived.dispatch, 0)} L</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><ArrowUpFromLine className="w-5 h-5 text-amber-600" /></div><div><div className="text-xs text-slate-400">Testing Included</div><div className="text-xl font-bold text-slate-800">{fmtNum(derived.testing, 0)} L</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><ArrowDownToLine className="w-5 h-5 text-slate-600" /></div><div><div className="text-xs text-slate-400">Manual In / Out</div><div className="text-xl font-bold text-slate-800">{fmtNum(derived.manualIn, 0)} / {fmtNum(derived.manualOut, 0)} L</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">{derived.receipts - derived.dispatch + derived.manualIn - derived.manualOut >= 0 ? <TrendingUp className="w-5 h-5 text-blue-600" /> : <TrendingDown className="w-5 h-5 text-blue-600" />}</div><div><div className="text-xs text-slate-400">Net Stock Change</div><div className="text-xl font-bold text-slate-800">{fmtNum(derived.receipts - derived.dispatch + derived.manualIn - derived.manualOut, 0)} L</div></div></Card>
      </div>
      <Card className="p-4 bg-blue-50 border-blue-100 text-sm text-blue-800">
        Dispatch in material balance uses gross nozzle outflow from Daily Sales Entry. Testing quantity is shown separately for reference, but it is already part of total dispatch from the tank.
      </Card>
      <MasterTable endpoint="/api/stock-movements" entityName="Movement" title="Stock In / Out" subtitle="All inventory movements affecting tank stock" columns={[
        { key: 'id', label: 'ID', hideInForm: true },
        { key: 'movement_date', label: 'Date', type: 'date', required: true, render: (r) => fmtDate(r.movement_date) },
        { key: 'movement_type', label: 'Type', type: 'select', required: true, options: [{ value: 'IN', label: 'Stock In' }, { value: 'OUT', label: 'Stock Out' }], render: (r) => <Badge color={r.movement_type === 'IN' ? 'green' : 'red'}>{r.movement_type}</Badge> },
        { key: 'tank_name', label: 'Tank', type: 'select', required: true, optionsEndpoint: '/api/tanks' },
        { key: 'product_name', label: 'Product', type: 'select', required: true, optionsEndpoint: '/api/products' },
        { key: 'volume', label: 'Volume (L)', type: 'number', required: true, render: (r) => fmtNum(r.volume, 0) },
        { key: 'reason', label: 'Reason / Ref', type: 'select', options: [{ value: 'Tanker Receipt', label: 'Tanker Receipt' }, { value: 'Sales Dispense', label: 'Sales Dispense' }, { value: 'Testing', label: 'Testing' }, { value: 'Transfer', label: 'Transfer' }, { value: 'Adjustment', label: 'Adjustment' }] },
      ]} />
    </div>
  );
}
