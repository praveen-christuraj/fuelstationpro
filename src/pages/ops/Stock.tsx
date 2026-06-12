import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp, TrendingDown } from 'lucide-react';
import MasterTable from '../../components/MasterTable';
import { Card } from '../../components/ui/Card';
import { apiGet, fmtNum } from '../../lib/api';
import { fmtDate } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';

export default function Stock() {
  const [moves, setMoves] = useState<any[]>([]);
  useEffect(() => { apiGet('/api/stock-movements').then(setMoves).catch(() => {}); }, []);
  const inTotal = moves.filter((m) => m.movement_type === 'IN').reduce((s, m) => s + Number(m.volume || 0), 0);
  const outTotal = moves.filter((m) => m.movement_type === 'OUT').reduce((s, m) => s + Number(m.volume || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><ArrowDownToLine className="w-5 h-5 text-emerald-600" /></div><div><div className="text-xs text-slate-400">Total Stock In</div><div className="text-xl font-bold text-slate-800">{fmtNum(inTotal, 0)} L</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center"><ArrowUpFromLine className="w-5 h-5 text-rose-600" /></div><div><div className="text-xs text-slate-400">Total Stock Out</div><div className="text-xl font-bold text-slate-800">{fmtNum(outTotal, 0)} L</div></div></Card>
        <Card className="p-5 flex items-center gap-3"><div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">{inTotal - outTotal >= 0 ? <TrendingUp className="w-5 h-5 text-blue-600" /> : <TrendingDown className="w-5 h-5 text-blue-600" />}</div><div><div className="text-xs text-slate-400">Net Movement</div><div className="text-xl font-bold text-slate-800">{fmtNum(inTotal - outTotal, 0)} L</div></div></Card>
      </div>
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
