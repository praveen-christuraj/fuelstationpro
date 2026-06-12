import { useEffect, useState } from 'react';
import { Calculator, Droplet, ArrowRight } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field, Select, Input } from '../../components/ui/Field';
import { Loading } from '../../components/ui/States';
import { apiGet, fmtNum } from '../../lib/api';

export default function DipVolume() {
  const [tanks, setTanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tankId, setTankId] = useState('');
  const [points, setPoints] = useState<any[]>([]);
  const [dip, setDip] = useState('');
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => { apiGet('/api/tanks').then((t) => { setTanks(t); setLoading(false); }); }, []);
  useEffect(() => {
    if (tankId) {
      apiGet(`/api/tanks/${tankId}/calibration`).then((resp) => setPoints(resp.points || [])).catch(() => setPoints([]));
    } else { setPoints([]); }
    setResult(null);
  }, [tankId]);

  const calc = () => {
    const d = Number(dip);
    if (points.length < 2 || isNaN(d)) { setResult(null); return; }
    if (d <= points[0].dip_mm) { setResult(points[0].volume_liters); return; }
    if (d >= points[points.length - 1].dip_mm) { setResult(points[points.length - 1].volume_liters); return; }
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      if (d >= a.dip_mm && d <= b.dip_mm) {
        const frac = (d - a.dip_mm) / (b.dip_mm - a.dip_mm || 1);
        setResult(a.volume_liters + frac * (b.volume_liters - a.volume_liters));
        return;
      }
    }
  };

  if (loading) return <Loading />;
  const tank = tanks.find((t) => String(t.id) === tankId);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-800">Dip-to-Volume Calculator</h1><p className="text-sm text-slate-400 mt-0.5">Convert tank dip readings to volume using linear interpolation on the calibration chart</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="space-y-4">
            <Field label="Select Tank" required><Select value={tankId} onChange={(e) => setTankId(e.target.value)}><option value="">Choose a tank…</option>{tanks.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.product_name})</option>)}</Select></Field>
            {tankId && points.length === 0 && <p className="text-sm text-amber-600">No calibration chart uploaded for this tank. Upload one on the Tanks page.</p>}
            <Field label="Dip Reading (mm)" required><Input type="number" step="any" value={dip} onChange={(e) => setDip(e.target.value)} placeholder="e.g. 425" disabled={points.length < 2} /></Field>
            <button onClick={calc} disabled={points.length < 2 || !dip} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"><Calculator className="w-4 h-4" /> Calculate Volume</button>
          </div>
          {result != null && (
            <div className="mt-5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 p-5 border border-blue-200">
              <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1"><Droplet className="w-4 h-4" /> Interpolated Volume</div>
              <div className="text-3xl font-bold text-blue-800">{fmtNum(result, 1)} <span className="text-lg">Litres</span></div>
              {tank && <div className="text-xs text-blue-600 mt-2 flex items-center gap-1">Tank capacity {fmtNum(tank.capacity, 0)} L <ArrowRight className="w-3 h-3" /> {((result / tank.capacity) * 100).toFixed(1)}% full</div>}
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Calibration Chart" subtitle={tank ? `${tank.name} — ${points.length} points` : 'Select a tank'} />
          <div className="p-4 max-h-96 overflow-y-auto">
            {points.length === 0 ? <p className="text-sm text-slate-400 py-10 text-center">No calibration data</p> : (
              <table className="w-full text-sm"><thead className="text-xs text-slate-500"><tr><th className="text-left py-2">Dip (mm)</th><th className="text-right py-2">Volume (L)</th></tr></thead><tbody className="divide-y divide-slate-50">{points.map((p, i) => <tr key={i}><td className="py-1.5 text-slate-600">{fmtNum(p.dip_mm, 1)}</td><td className="py-1.5 text-right text-slate-700">{fmtNum(p.volume_liters, 0)}</td></tr>)}</tbody></table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
