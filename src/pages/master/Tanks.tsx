import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Upload, FileDown, Gauge, Database } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import Modal, { ConfirmModal } from '../../components/ui/Modal';
import { Field, Input } from '../../components/ui/Field';
import { Loading, ErrorState, EmptyState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { apiGet, apiPost, apiPut, apiDelete, fmtNum } from '../../lib/api';
import { parseCSV, toCSV, downloadCSV } from '../../lib/csv';

export default function Tanks() {
  const [tanks, setTanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [formErr, setFormErr] = useState('');
  const [delTarget, setDelTarget] = useState<any>(null);
  const [calTank, setCalTank] = useState<any>(null);
  const [calPoints, setCalPoints] = useState<any[]>([]);
  const [calMsg, setCalMsg] = useState('');
  const [calErr, setCalErr] = useState('');
  const [calSaving, setCalSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try { setTanks(await apiGet('/api/tanks')); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ name: '', code: '', product_name: '', capacity: '', current_volume: '', dead_stock: '', diameter: '' }); setEditing(null); setFormErr(''); setModal(true); };
  const openEdit = (t: any) => { setForm({ ...t }); setEditing(t); setFormErr(''); setModal(true); };

  const save = async () => {
    if (!form.name || !form.product_name || !form.capacity) { setFormErr('Name, Product and Capacity are required'); return; }
    try {
      const payload = { name: form.name, code: form.code, product_name: form.product_name, capacity: Number(form.capacity), current_volume: Number(form.current_volume || 0), dead_stock: Number(form.dead_stock || 0), diameter: Number(form.diameter || 0) };
      if (editing) await apiPut('/api/tanks', { id: editing.id, ...payload });
      else await apiPost('/api/tanks', payload);
      setModal(false); await load();
    } catch (e: any) { setFormErr(e.message); }
  };

  const remove = async (t: any) => { await apiDelete('/api/tanks', { id: t.id }); await load(); };

  const openCal = async (t: any) => {
    setCalTank(t); setCalMsg(''); setCalErr('');
    try {
      const resp = await apiGet(`/api/tanks/${t.id}/calibration`);
      setCalPoints(resp.points || []);
    } catch { setCalPoints([]); }
  };

  const downloadCalTemplate = () => {
    const sample = Array.from({ length: 5 }, (_, i) => ({ dip_cm: (i + 1) * 10, volume_liters: (i + 1) * 850 }));
    downloadCSV(`tank_calibration_template.csv`, toCSV(sample, ['dip_cm', 'volume_liters']));
  };

  const validateLocal = (points: { dip_cm: number; volume_liters: number }[]) => {
    const errs: string[] = [];
    if (points.length < 2) errs.push('Need at least 2 calibration points');
    for (let i = 1; i < points.length; i++) {
      if (points[i].dip_cm <= points[i - 1].dip_cm) errs.push(`Row ${i + 1}: dip_cm (${points[i].dip_cm}) must be > row ${i} (${points[i - 1].dip_cm})`);
      if (points[i].volume_liters < points[i - 1].volume_liters) errs.push(`Row ${i + 1}: volume_liters decreased from ${points[i - 1].volume_liters} to ${points[i].volume_liters}`);
    }
    const dips = points.map((p) => p.dip_cm);
    const dupes = dips.filter((d, i) => dips.indexOf(d) !== i);
    if (dupes.length) errs.push(`Duplicate dip_cm values: ${[...new Set(dupes)].join(', ')}`);
    return errs;
  };

  const onCalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setCalMsg(''); setCalErr('');
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = parseCSV(String(reader.result || '')).map((r) => ({ dip_cm: Number(r.dip_cm), volume_liters: Number(r.volume_liters) })).filter((r) => !isNaN(r.dip_cm) && !isNaN(r.volume_liters));
      const localErrs = validateLocal(raw);
      if (localErrs.length) { setCalErr(localErrs.join('; ')); return; }
      setCalSaving(true);
      try {
        const resp = await fetch(`/api/tanks/${calTank.id}/calibration`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: raw }),
        });
        if (!resp.ok) { const e = await resp.json(); throw new Error(e.error || 'Upload failed'); }
        const result = await resp.json();
        setCalPoints(result.points || []);
        setCalMsg(`Imported ${result.count} calibration points.`);
      } catch (err: any) { setCalErr(err.message); }
      finally { setCalSaving(false); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-800">Tanks & Calibration</h1><p className="text-sm text-slate-400 mt-0.5">Storage tanks with dip-chart calibration uploads</p></div>
        <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><Plus className="w-4 h-4" /> Add Tank</button>
      </div>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : tanks.length === 0 ? <Card><EmptyState message="No tanks configured" hint="Add a tank to begin" /></Card> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tanks.map((t) => {
            const pct = Math.min(100, (Number(t.current_volume) / Number(t.capacity || 1)) * 100);
            return (
              <Card key={t.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5"><div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center"><Database className="w-4.5 h-4.5 text-blue-600" /></div><div><div className="font-semibold text-slate-800 text-sm">{t.name}</div><div className="text-xs text-slate-400">{t.code} • {t.product_name}</div></div></div>
                  <div className="flex gap-1"><button onClick={() => openEdit(t)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button><button onClick={() => setDelTarget(t)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button></div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs mb-1"><span className="text-slate-500">Stock Level</span><span className="text-slate-700 font-medium">{fmtNum(t.current_volume, 0)} / {fmtNum(t.capacity, 0)} L</span></div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${pct < 20 ? 'bg-rose-500' : pct < 40 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} /></div>
                  <div className="flex justify-between text-xs mt-2 text-slate-400"><span>Dead stock: {fmtNum(t.dead_stock, 0)} L</span><span>{pct.toFixed(0)}% full</span></div>
                </div>
                <button onClick={() => openCal(t)} className="mt-4 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"><Gauge className="w-4 h-4" /> Calibration Chart</button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={`${editing ? 'Edit' : 'Add'} Tank`}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tank Name" required><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Code"><Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="Product" required><Input value={form.product_name || ''} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></Field>
          <Field label="Capacity (L)" required><Input type="number" value={form.capacity || ''} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
          <Field label="Current Volume (L)"><Input type="number" value={form.current_volume || ''} onChange={(e) => setForm({ ...form, current_volume: e.target.value })} /></Field>
          <Field label="Dead Stock (L)"><Input type="number" value={form.dead_stock || ''} onChange={(e) => setForm({ ...form, dead_stock: e.target.value })} /></Field>
          <Field label="Diameter (cm)"><Input type="number" value={form.diameter || ''} onChange={(e) => setForm({ ...form, diameter: e.target.value })} /></Field>
        </div>
        {formErr && <p className="text-sm text-rose-600 mt-3">{formErr}</p>}
        <div className="flex justify-end gap-2 mt-6"><button onClick={() => setModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={save} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">Save</button></div>
      </Modal>

      <Modal open={!!calTank} onClose={() => setCalTank(null)} title={`Calibration Chart — ${calTank?.name || ''}`} wide>
        <p className="text-sm text-slate-500 mb-4">Upload a dip-to-volume calibration chart (CSV). Each row maps a dip reading in cm to the corresponding volume in litres. This powers the Dip-to-Volume calculator.</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={downloadCalTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"><FileDown className="w-4 h-4" /> Download Template</button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer"><Upload className="w-4 h-4" /> Upload Calibration CSV<input type="file" accept=".csv" onChange={onCalFile} className="hidden" /></label>
          {calPoints.length > 0 && <Badge color="green">{calPoints.length} points loaded</Badge>}
        </div>
        {calMsg && <p className="text-sm text-emerald-600 mb-3">{calMsg}</p>}
        {calErr && <p className="text-sm text-rose-600 mb-3">{calErr}</p>}
        {calSaving && <p className="text-sm text-blue-600 mb-3">Uploading and replacing calibration chart…</p>}
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs sticky top-0"><tr><th className="text-left px-4 py-2">Dip (cm)</th><th className="text-left px-4 py-2">Volume (L)</th></tr></thead>
            <tbody className="divide-y divide-slate-50">{calPoints.map((c, i) => <tr key={i}><td className="px-4 py-2 text-slate-700">{fmtNum(c.dip_cm, 1)}</td><td className="px-4 py-2 text-slate-700">{fmtNum(c.volume_liters, 0)}</td></tr>)}{calPoints.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-400 text-sm">No calibration data — upload a chart above</td></tr>}</tbody>
          </table>
        </div>
      </Modal>

      <ConfirmModal open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && remove(delTarget)} title="Delete Tank" message="Delete this tank and its associations? This cannot be undone." />
    </div>
  );
}
