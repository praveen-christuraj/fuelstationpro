import { useState } from 'react';
import { Upload, FileDown, CheckCircle2, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { Card } from './ui/Card';
import { parseCSV, toCSV, downloadCSV } from '../lib/csv';
import { apiPost } from '../lib/api';

export interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
  example: string;
}

interface Props {
  title: string;
  description: string;
  endpoint: string;
  fields: FieldSpec[];
  templateName: string;
}

export default function BulkUploadWizard({ title, description, endpoint, fields, templateName }: Props) {
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [errors, setErrors] = useState<{ row: number; msg: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null);
  const [fileName, setFileName] = useState('');

  const downloadTemplate = () => {
    const headers = fields.map((f) => f.key);
    const example = [Object.fromEntries(fields.map((f) => [f.key, f.example]))];
    downloadCSV(`${templateName}_template.csv`, toCSV(example, headers));
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = parseCSV(text);
      const errs: { row: number; msg: string }[] = [];
      rows.forEach((r, i) => {
        for (const f of fields) {
          if (f.required && (!r[f.key] || r[f.key].trim() === '')) {
            errs.push({ row: i + 2, msg: `Missing required "${f.label}"` });
          }
          if (f.type === 'number' && r[f.key] && isNaN(Number(r[f.key]))) {
            errs.push({ row: i + 2, msg: `"${f.label}" must be a number` });
          }
        }
      });
      setParsed(rows); setErrors(errs); setStep(2);
    };
    reader.readAsText(file);
  };

  const commit = async () => {
    setUploading(true);
    let ok = 0, fail = 0;
    const payload = parsed.map((r) => {
      const o: Record<string, any> = {};
      fields.forEach((f) => {
        let v: any = r[f.key];
        if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
        o[f.key] = v;
      });
      return o;
    });
    try {
      await apiPost(endpoint, payload);
      ok = payload.length;
    } catch {
      // fallback: one-by-one
      for (const row of payload) {
        try { await apiPost(endpoint, row); ok++; } catch { fail++; }
      }
    }
    setResult({ ok, fail }); setUploading(false); setStep(3);
  };

  const reset = () => { setStep(1); setParsed([]); setErrors([]); setResult(null); setFileName(''); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{title}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{description}</p>
      </div>

      <div className="flex items-center gap-2 text-xs font-medium">
        {['Download & Fill', 'Upload & Validate', 'Commit'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>{i + 1}</span>
            <span className={step >= i + 1 ? 'text-slate-700' : 'text-slate-400'}>{s}</span>
            {i < 2 && <ChevronRight className="w-4 h-4 text-slate-300" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="p-6">
          <div className="max-w-xl">
            <h3 className="font-semibold text-slate-800 mb-1">Step 1 — Get the template</h3>
            <p className="text-sm text-slate-500 mb-4">Download the CSV template with the exact column headers, fill it with your records, then upload it back. Required columns are marked below.</p>
            <div className="rounded-lg border border-slate-200 overflow-hidden mb-4">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left px-3 py-2">Column</th><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Required</th><th className="text-left px-3 py-2">Example</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {fields.map((f) => (
                  <tr key={f.key}><td className="px-3 py-2 font-mono text-slate-700">{f.key}</td><td className="px-3 py-2 text-slate-500">{f.type || 'text'}</td><td className="px-3 py-2">{f.required ? <span className="text-rose-600">Yes</span> : <span className="text-slate-400">No</span>}</td><td className="px-3 py-2 text-slate-500">{f.example}</td></tr>
                ))}
              </tbody>
              </table>
            </div>
            <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"><FileDown className="w-4 h-4" /> Download CSV Template</button>
            <div className="mt-6 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
              <Upload className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-3">Upload your filled CSV file</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer">
                <Upload className="w-4 h-4" /> Choose File
                <input type="file" accept=".csv" onChange={onFile} className="hidden" />
              </label>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">Step 2 — Validate ({fileName})</h3>
              <p className="text-sm text-slate-500">{parsed.length} rows parsed • {errors.length} validation issue{errors.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={reset} className="text-sm text-slate-500 hover:underline">Start over</button>
          </div>
          {errors.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1"><AlertTriangle className="w-4 h-4" /> Issues found — fix these rows before committing</div>
              <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                {errors.slice(0, 30).map((e, i) => <li key={i}>Row {e.row}: {e.msg}</li>)}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0"><tr>{fields.map((f) => <th key={f.key} className="text-left px-3 py-2 whitespace-nowrap">{f.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-50">
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i}>{fields.map((f) => <td key={f.key} className="px-3 py-2 text-slate-600 whitespace-nowrap">{r[f.key] || '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <button onClick={reset} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={commit} disabled={errors.length > 0 || parsed.length === 0 || uploading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Commit {parsed.length} Records
            </button>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <Card className="p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">Upload complete</h3>
          <p className="text-sm text-slate-500 mt-1">{result.ok} records imported successfully{result.fail > 0 ? `, ${result.fail} failed` : ''}.</p>
          <button onClick={reset} className="mt-5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Upload Another File</button>
        </Card>
      )}
    </div>
  );
}
