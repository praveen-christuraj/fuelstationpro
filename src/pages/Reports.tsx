import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Truck, ClipboardList, TrendingUp, Wallet, CreditCard } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Loading, ErrorState } from '../components/ui/States';
import { apiGet, fmtMoney, fmtNum } from '../lib/api';

const colorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
};

export default function Reports() {
  const nav = useNavigate();
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [ds, tu, ph] = await Promise.all([
          apiGet('/api/daily-sales?pageSize=1'),
          apiGet('/api/tanker-unloading/batches?pageSize=1'),
          apiGet('/api/price-history'),
        ]);
        setDailySales(ds?.data || []);
        setBatches(tu?.data || []);
        setHistory(ph || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const kpis = useMemo(() => {
    const totalRev = (dailySales || []).reduce((s, e) => s + Number(e.total_sales_amount || 0), 0);
    const totalBatches = batches?.length || 0;
    const priceRevisions = history.length || 0;
    return { totalRev, totalBatches, priceRevisions };
  }, [dailySales, batches, history]);

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  const reportCards = [
    {
      path: '/reports/daily-sales',
      title: 'Daily Sales Report',
      desc: 'Detailed sales analytics with period, product, operator, dispenser, and shift drill-down. Payment mix analysis, variance tracking, and per-entry nozzle-level drill-through.',
      icon: ClipboardList,
      color: 'blue',
      stats: [
        { label: 'Revenue', value: fmtMoney(kpis.totalRev) },
        { label: 'Drill by', value: 'Date / Product / Operator' },
      ],
    },
    {
      path: '/reports/tanker-unloading',
      title: 'Tanker Unloading Report',
      desc: 'Receipt volume tracking with declared vs received analysis, variance trends by period, supplier-wise and tank-wise drill-down, and per-batch compartment-level details.',
      icon: Truck,
      color: 'emerald',
      stats: [
        { label: 'Batches', value: String(kpis.totalBatches) },
        { label: 'Periods', value: 'Daily / Monthly / Annually' },
      ],
    },
    {
      path: '/reports/price-history',
      title: 'Price History Report',
      desc: 'Price revision tracking with inflation analysis, effective price timeline per product, scheduled vs current vs historical price status, and product-wise price trend charts.',
      icon: TrendingUp,
      color: 'amber',
      stats: [
        { label: 'Revisions', value: String(kpis.priceRevisions) },
        { label: 'Drill by', value: 'Product / Date / Inflation' },
      ],
    },
    {
      path: '/reports/finance',
      title: 'Finance Report',
      desc: 'Date-wise shortage/surplus trends, deposit breakdown by category, expense analysis by category, and ledger balance summary across periods.',
      icon: Wallet,
      color: 'blue',
      stats: [
        { label: 'View', value: 'Shortage Trends / Ledger' },
        { label: 'Filters', value: 'Date Range' },
      ],
    },
    {
      path: '/reports/credit-sales',
      title: 'Credit Sales Report',
      desc: 'Credit sales status distribution, customer-wise outstanding tracking, settled vs pending analysis, and period-wise credit movement.',
      icon: CreditCard,
      color: 'emerald',
      stats: [
        { label: 'View', value: 'Status / Customer / Period' },
        { label: 'Filters', value: 'Date Range / Status' },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Advanced Reports</h1>
        <p className="text-sm text-slate-400 mt-0.5">Choose a report type below to drill into detailed analytics</p>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {reportCards.map((rc) => {
          const cc = colorMap[rc.color] || colorMap.blue;
          return (
            <Card key={rc.path} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => nav(rc.path)}>
              <div className="p-5 flex flex-col sm:flex-row sm:items-start gap-5">
                <div className={`w-12 h-12 rounded-xl ${cc.bg} flex items-center justify-center shrink-0`}>
                  <rc.icon className={`w-6 h-6 ${cc.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-800">{rc.title}</h2>
                  <p className="text-sm text-slate-500 mt-1">{rc.desc}</p>
                  <div className="flex flex-wrap gap-4 mt-3">
                    {rc.stats.map((stat) => (
                      <div key={stat.label} className="text-sm">
                        <span className="text-slate-400">{stat.label}: </span>
                        <span className="font-semibold text-slate-700">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Badge color="blue">View Report →</Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
