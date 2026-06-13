import { useEffect, useMemo, useState } from 'react';
import { Plus, Ruler } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { Field, Input, Select } from '../../components/ui/Field';
import { Loading, ErrorState } from '../../components/ui/States';
import { apiGet, apiPost, fmtNum, fmtDate } from '../../lib/api';
import { interpolateVolume } from '../../lib/interp';

type ReadingType = 'opening' | 'closing' | 'unloading_before' | 'unloading_after';

export default function DipReadings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tanks, setTanks] = useState<any[]>([]);
  const [pointsCache, setPointsCache] = useState<Record<string, any[]>>({});
  const [readings, setReadings] = useState<any[]>([]);
  const [businessDate, setBusinessDate] = useState(new Date().toISOString().slice(0, 10));

  const [open, setOpen] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ reading_date: string; tank_name: string; dip_mm: string; reading_type: ReadingType }>({
    reading_date: new Date().toISOString().slice(0, 10),
    tank_name: '',
    dip_mm: '',
    reading_type: 'closing',
  });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [t, r] = await Promise.all([apiGet('/api/tanks'), apiGet('/api/dip-readings')]);
      setTanks(t || []);
      setReadings(r || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load dip readings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const loadPointsForTankName = async (tankName: string) => {
    const tank = tanks.find((t) => t.name === tankName);
    if (!tank) return [];
    const key = String(tank.id);
    if (pointsCache[key]) return pointsCache[key];
    const resp = await apiGet(`/api/tanks/${tank.id}/calibration`);
    const points = resp?.points || [];
    setPointsCache((prev) => ({ ...prev, [key]: points }));
    return points;
  };

  const computedVolume = useMemo(() => {
    const dip = Number(form.dip_mm);
    const tank = tanks.find((t) => t.name === form.tank_name);
    if (!tank || !Number.isFinite(dip)) return null;
    const points = pointsCache[String(tank.id)] || [];
    return interpolateVolume(points, dip);
  }, [form.dip_mm, form.tank_name, tanks, pointsCache]);

  const readingsForDate = useMemo(
    () => readings.filter((r) => r.reading_date === businessDate),
    [readings, businessDate],
  );
  const closingByTank = useMemo(() => {
    const map = new Map<string, any>();
    readingsForDate.forEach((r) => {
      if (r.reading_type === 'closing') map.set(r.tank_name, r);
    });
    return map;
  }, [readingsForDate]);

  const openCreate = () => {
    setForm({ reading_date: businessDate, tank_name: '', dip_mm: '', reading_type: 'closing' });
    setFormErr('');
    setOpen(true);
  };

  const save = async () => {
    setFormErr('');
    if (!form.reading_date || !form.tank_name || form.dip_mm === '') {
      setFormErr('Date, tank and dip are required');
      return;
    }
    setSaving(true);
    try {
      await apiPost('/api/dip-readings', {
        reading_date: form.reading_date,
        tank_name: form.tank_name,
        dip_mm: Number(form.dip_mm),
        reading_type: form.reading_type,
      });
      setBusinessDate(form.reading_date);
      setOpen(false);
      await load();
    } catch (e: any) {
      setFormErr(e.message || 'Failed to save dip reading');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Daily Stock Closing</h1>
          <p className="text-sm text-slate-400 mt-0.5">Record tank dip readings, compute physical closing volume from calibration, and save it for loss/gain analysis</p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-44">
            <Field label="Business Date">
              <Input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
            </Field>
          </div>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Record Dip
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs text-slate-400">Tanks Closed</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{closingByTank.size} / {tanks.length}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Physical Closing Volume</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{fmtNum(Array.from(closingByTank.values()).reduce((s, r) => s + Number(r.volume_liters || 0), 0), 1)} L</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-slate-400">Mode</div>
          <div className="text-sm font-medium text-slate-700 mt-2">Only closing dip updates the tank's saved physical stock</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Tank</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Dip (mm)</th>
                <th className="px-4 py-3 text-right">Volume (L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {readingsForDate.slice().reverse().map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(r.reading_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{r.tank_name}</td>
                  <td className="px-4 py-3 text-slate-600">{String(r.reading_type || '').replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{fmtNum(r.dip_mm, 1)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmtNum(r.volume_liters, 1)} L</td>
                </tr>
              ))}
              {readingsForDate.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">No dip readings recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Tank Dip / Closing Stock">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date" required>
              <Input type="date" value={form.reading_date} onChange={(e) => setForm({ ...form, reading_date: e.target.value })} />
            </Field>
            <Field label="Type" required>
              <Select value={form.reading_type} onChange={(e) => setForm({ ...form, reading_type: e.target.value as ReadingType })}>
                <option value="opening">Opening</option>
                <option value="closing">Closing</option>
                <option value="unloading_before">Before Unloading</option>
                <option value="unloading_after">After Unloading</option>
              </Select>
            </Field>
            <Field label="Tank" required>
              <Select
                value={form.tank_name}
                onChange={async (e) => {
                  const tankName = e.target.value;
                  setForm((prev) => ({ ...prev, tank_name: tankName }));
                  if (tankName) {
                    try {
                      await loadPointsForTankName(tankName);
                    } catch {
                      // ignore
                    }
                  }
                }}
              >
                <option value="">Select…</option>
                {tanks.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.product_name})</option>)}
              </Select>
            </Field>
            <Field label="Dip (mm)" required>
              <Input type="number" step="any" value={form.dip_mm} onChange={(e) => setForm({ ...form, dip_mm: e.target.value })} />
            </Field>
          </div>
          <Card className="p-4 bg-blue-50 border-blue-100">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Ruler className="w-4 h-4" />
              <span>Computed volume:</span>
              <strong>{computedVolume == null ? '—' : `${fmtNum(computedVolume, 1)} L`}</strong>
            </div>
            {computedVolume == null && <div className="text-xs text-blue-600 mt-1">Upload calibration chart for this tank to enable dip-to-volume conversion.</div>}
          </Card>
          {formErr && <p className="text-sm text-rose-600">{formErr}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
