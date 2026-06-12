import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Download, Loader2 } from 'lucide-react';
import { Card } from './ui/Card';
import Modal, { ConfirmModal } from './ui/Modal';
import { Field, Input } from './ui/Field';
import { Loading, ErrorState, EmptyState } from './ui/States';
import { apiGet, apiPost, apiPut, apiDelete } from '../lib/api';
import { toCSV, downloadCSV } from '../lib/csv';

export interface ColumnDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'boolean';
  options?: { value: string | number; label: string }[];
  optionsEndpoint?: string;
  optionsLabelKey?: string;
  optionsValueKey?: string;
  required?: boolean;
  render?: (row: any) => React.ReactNode;
  hideInForm?: boolean;
  hideInTable?: boolean;
  default?: any;
  onFieldChange?: (form: any, key: string, value: any, option?: any) => Record<string, any>;
  pattern?: string;
  patternMessage?: string;
  min?: number;
  max?: number;
  minLength?: number;
}

interface Props {
  endpoint: string;
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  entityName: string;
}

export default function MasterTable({ endpoint, title, subtitle, columns, entityName }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<any>(null);
  const [optionsCache, setOptionsCache] = useState<Record<string, any[]>>({});
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true); setError('');
    try { setRows(await apiGet(endpoint)); }
    catch (e: any) { setError(e.message || 'Failed to load data'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [endpoint]);

  useEffect(() => {
    let mounted = true;
    const dynamicCols = columns.filter((c) => c.optionsEndpoint && !c.options);
    if (dynamicCols.length === 0) return;
    dynamicCols.forEach(async (c) => {
      const ep = c.optionsEndpoint!;
      if (optionsCache[ep]) return;
      setLoadingOptions((prev) => ({ ...prev, [ep]: true }));
      try {
        const data = await apiGet(ep);
        if (!mounted) return;
        setOptionsCache((prev) => ({ ...prev, [ep]: Array.isArray(data) ? data : data?.points || [] }));
      } catch {
        if (!mounted) return;
        setOptionsCache((prev) => ({ ...prev, [ep]: [] }));
      }
      finally {
        if (mounted) setLoadingOptions((prev) => ({ ...prev, [ep]: false }));
      }
    });
    return () => { mounted = false; };
  }, [columns, optionsCache]);

  const getOptions = (c: ColumnDef) => {
    if (c.options) return c.options;
    if (c.optionsEndpoint) {
      const data = optionsCache[c.optionsEndpoint] || [];
      const labelKey = c.optionsLabelKey || 'name';
      const valueKey = c.optionsValueKey || 'name';
      return data.map((item: any) => ({ value: item[valueKey] ?? '', label: item[labelKey] ?? '' }));
    }
    return [];
  };

  const openCreate = () => {
    const init: Record<string, any> = {};
    columns.forEach((c) => { if (!c.hideInForm) init[c.key] = c.default ?? ''; });
    setForm(init); setEditing(null); setFormErr(''); setModalOpen(true);
  };
  const openEdit = (row: any) => {
    const init: Record<string, any> = {};
    columns.forEach((c) => { if (!c.hideInForm) init[c.key] = row[c.key] ?? ''; });
    setForm(init); setEditing(row); setFormErr(''); setModalOpen(true);
  };

  const save = async () => {
    for (const c of columns) {
      if (c.hideInForm) continue;
      const val = form[c.key];
      if (c.required && (val === '' || val == null)) {
        setFormErr(`${c.label} is required`); return;
      }
      if (val === '' || val == null) continue;
      if (c.pattern && new RegExp(c.pattern).test(String(val)) === false) {
        setFormErr(c.patternMessage || `Invalid ${c.label}`); return;
      }
      if (c.type === 'number' || c.type === 'text') {
        const num = Number(val);
        if (c.min != null && num < c.min) { setFormErr(`${c.label} must be ${c.min} or greater`); return; }
        if (c.max != null && num > c.max) { setFormErr(`${c.label} must be ${c.max} or less`); return; }
      }
      if (c.minLength != null && String(val).length < c.minLength) { setFormErr(`${c.label} must be at least ${c.minLength} characters`); return; }
    }
    setSaving(true); setFormErr('');
    try {
      const payload: Record<string, any> = {};
      columns.forEach((c) => {
        if (c.hideInForm) return;
        let v = form[c.key];
        if (c.type === 'number') v = v === '' ? null : Number(v);
        if (c.type === 'boolean') v = v === true || v === 'true';
        payload[c.key] = v;
      });
      if (editing) await apiPut(endpoint, { id: editing.id, ...payload });
      else await apiPost(endpoint, payload);
      setModalOpen(false);
      await load();
    } catch (e: any) { setFormErr(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async (row: any) => {
    try { await apiDelete(endpoint, { id: row.id }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const handleFieldChange = (c: ColumnDef, value: any) => {
    const opts = getOptions(c);
    const option = opts.find((o) => o.value === value);
    const updates = { [c.key]: value };
    if (c.onFieldChange) {
      let rawOption: any = option;
      if (c.optionsEndpoint) {
        const rawData = optionsCache[c.optionsEndpoint] || [];
        const valueKey = c.optionsValueKey || 'name';
        rawOption = rawData.find((item: any) => String(item[valueKey]) === String(value));
      }
      Object.assign(updates, c.onFieldChange(form, c.key, value, rawOption));
    }
    setForm({ ...form, ...updates });
  };

  const tableCols = columns.filter((c) => !c.hideInTable);
  const filtered = rows.filter((r) =>
    !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  );

  const exportCsv = () => {
    downloadCSV(`${entityName}.csv`, toCSV(rows));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-50"><Download className="w-4 h-4" /> Export</button>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shadow-sm"><Plus className="w-4 h-4" /> Add {entityName}</button>
        </div>
      </div>

      <Card>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
        </div>
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length === 0 ? <EmptyState message={`No ${entityName.toLowerCase()} found`} hint={`Click "Add ${entityName}" to create one`} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100 bg-slate-50/50">
                  {tableCols.map((c) => <th key={c.key} className="px-4 py-3 whitespace-nowrap">{c.label}</th>)}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    {tableCols.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {c.render ? c.render(row) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(row)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDelTarget(row)} className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={`${editing ? 'Edit' : 'Add'} ${entityName}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {columns.filter((c) => !c.hideInForm).map((c) => {
            const opts = getOptions(c);
            const isLoading = c.optionsEndpoint && loadingOptions[c.optionsEndpoint];
            return (
              <div key={c.key} className={c.type === 'boolean' ? 'sm:col-span-2' : ''}>
                <Field label={c.label} required={c.required}>
                  {c.type === 'select' ? (
                    <select value={form[c.key] ?? ''} onChange={(e) => handleFieldChange(c, e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      <option value="">{isLoading ? 'Loading…' : 'Select…'}</option>
                      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : c.type === 'boolean' ? (
                    <label className="inline-flex items-center gap-2 mt-1">
                      <input type="checkbox" checked={form[c.key] === true || form[c.key] === 'true'} onChange={(e) => setForm({ ...form, [c.key]: e.target.checked })} className="w-4 h-4 rounded text-blue-600" />
                      <span className="text-sm text-slate-600">Enabled</span>
                    </label>
                  ) : (
                    <Input type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'} step="any" value={form[c.key] ?? ''} pattern={c.pattern} min={c.min} max={c.max} minLength={c.minLength} onChange={(e) => handleFieldChange(c, e.target.value)} />
                  )}
                </Field>
              </div>
            );
          })}
        </div>
        {formErr && <p className="text-sm text-rose-600 mt-3">{formErr}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </Modal>

      <ConfirmModal open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={() => delTarget && remove(delTarget)} title={`Delete ${entityName}`} message={`Are you sure you want to delete this ${entityName.toLowerCase()}? This action cannot be undone.`} />
    </div>
  );
}
