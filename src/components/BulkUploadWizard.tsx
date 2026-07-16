import { useState, useRef } from 'react';
import { Upload, FileDown, CheckCircle2, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import { Card } from './ui/Card';
import { parseCSV, toCSV, downloadCSV } from '../lib/csv';
import { getAuthHeaders } from '../lib/api';

export interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date';
  required?: boolean;
  example: string;
  options?: string[];
  unique?: boolean;
  min?: number;
  max?: number;
}

interface Props {
  title: string;
  description: string;
  endpoint: string;
  fields: FieldSpec[];
  templateName: string;
  customValidate?: (row: Record<string, string>, rowNumber: number) => string[];
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHUNK_SIZE = 250;
const MAX_VISIBLE_ERRORS = 200;

function trimVal(v: any): string {
  return String(v ?? '').trim();
}

function isBlank(v: any): boolean {
  return trimVal(v) === '';
}

function toTrimmedNum(v: any): number | null {
  const s = trimVal(v);
  if (s === '') return null;
  const n = Number(s);
  if (isNaN(n) || !isFinite(n)) return null;
  return n;
}

function toNonNegativeNum(v: any): number | null {
  const n = toTrimmedNum(v);
  if (n === null) return null;
  return n >= 0 ? n : null;
}

export default function BulkUploadWizard({ title, description, endpoint, fields, templateName, customValidate }: Props) {
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; msg: string }[]>([]);
  const [duplicateErrors, setDuplicateErrors] = useState<{ row: number; msg: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [result, setResult] = useState<{ ok: number; fail: number; duplicates: number; validationErrors: number; errors?: string[] } | null>(null);
  const [fileName, setFileName] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const downloadTemplate = () => {
    const headers = fields.map((f) => f.key);
    const example = [Object.fromEntries(fields.map((f) => [f.key, f.example]))];
    downloadCSV(`${templateName}_template.csv`, toCSV(example, headers));
  };

  const downloadErrors = () => {
    const allErrors = [...validationErrors, ...duplicateErrors];
    if (allErrors.length === 0) return;
    const rows = allErrors.map((e) => ({ Row: e.row, Error: e.msg }));
    downloadCSV(`${templateName}_errors.csv`, toCSV(rows));
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      alert(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit. Please split the file and try again.`);
      e.target.value = '';
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const rows = parseCSV(text);
      const validationErrors: { row: number; msg: string }[] = [];
      const duplicateErrors: { row: number; msg: string }[] = [];
      const seenValues = new Map<string, Map<string, number>>();
      fields
        .filter((f) => f.unique)
        .forEach((f) => {
          seenValues.set(f.key, new Map<string, number>());
        });

      rows.forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 2;
        let isValid = true;

        for (const f of fields) {
          const val = row[f.key];
          const trimmed = trimVal(val);
          if (f.required && isBlank(val)) {
            validationErrors.push({ row: rowNumber, msg: `Missing required "${f.label}"` });
            isValid = false;
          }
          if (f.type === 'number' && !isBlank(val) && toTrimmedNum(val) === null) {
            validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be a number, got "${trimmed}"` });
            isValid = false;
          }
          if (f.type === 'number' && f.min != null && !isBlank(val)) {
            const n = toTrimmedNum(val);
            if (n !== null && n < f.min) {
              validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be ${f.min} or greater, got ${n}` });
              isValid = false;
            }
          }
          if (f.type === 'number' && f.max != null && !isBlank(val)) {
            const n = toTrimmedNum(val);
            if (n !== null && n > f.max) {
              validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be ${f.max} or less, got ${n}` });
              isValid = false;
            }
          }
          if (f.options && !isBlank(val) && !f.options.includes(trimmed)) {
            validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be one of: ${f.options.join(', ')}` });
            isValid = false;
          }
        }

        if (customValidate) {
          const customErrors = customValidate(row, rowNumber);
          for (const msg of customErrors) {
            validationErrors.push({ row: rowNumber, msg });
            isValid = false;
          }
        }

        if (!isValid) return;

        for (const f of fields) {
          if (f.unique) {
            const normalized = trimVal(row[f.key]).toLowerCase();
            if (normalized !== '') {
              const seenMap = seenValues.get(f.key)!;
              if (seenMap.has(normalized)) {
                duplicateErrors.push({
                  row: rowNumber,
                  msg: `Duplicate value "${trimVal(row[f.key])}" for "${f.label}" (already at row ${seenMap.get(normalized)})`,
                });
                isValid = false;
                break;
              }
              seenMap.set(normalized, rowNumber);
            }
          }
        }
      });

      setParsed(rows);
      setValidationErrors(validationErrors);
      setDuplicateErrors(duplicateErrors);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const safeApiPost = async (url: string, body: any): Promise<any> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { json = null; }
      if (!res.ok) {
        const msg = json?.error || json?.message || text.slice(0, 200) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json;
    } catch (e: any) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') throw new Error('Request timed out');
      throw e;
    } finally {
      abortRef.current = null;
    }
  };

  const commit = async () => {
    setUploading(true);

    const validationErrorRows = new Set(validationErrors.map(e => e.row));
    const duplicateErrorRows = new Set(duplicateErrors.map(e => e.row));
    const skipRows = new Set([...validationErrorRows, ...duplicateErrorRows]);

    let ok = 0, fail = 0;
    const errors: { row: number; msg: string }[] = [];
    const payload = [];
    for (const [index, r] of parsed.entries()) {
      const originalRowNum = index + 2;
      if (skipRows.has(originalRowNum)) continue;
      const o: Record<string, any> = {};
      fields.forEach((f) => {
        if (f.type === 'number') {
          o[f.key] = f.min != null ? toNonNegativeNum(r[f.key]) : toTrimmedNum(r[f.key]);
        } else {
          o[f.key] = trimVal(r[f.key]) || null;
        }
      });
      o._csvRow = originalRowNum;
      payload.push(o);
    }

    const total = payload.length;

    const hasOpeningReading = fields.some((f) => f.key === 'opening_reading');
    const hasClosingReading = fields.some((f) => f.key === 'closing_reading');
    const hasNozzleName = fields.some((f) => f.key === 'nozzle_name');
    if (hasOpeningReading && hasClosingReading && hasNozzleName) {
      const lastClosingByNozzle = new Map<string, number>();
      for (const row of payload) {
        const nozzle = String(row.nozzle_name ?? '');
        if (!nozzle) continue;
        if (row.closing_reading == null) continue;
        const prevClosing = lastClosingByNozzle.get(nozzle);
        if (prevClosing !== undefined && (row.opening_reading == null)) {
          row.opening_reading = prevClosing;
        }
        lastClosingByNozzle.set(nozzle, Number(row.closing_reading));
      }
    }

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      const chunkIdx = Math.floor(i / CHUNK_SIZE) + 1;
      const totalChunks = Math.ceil(total / CHUNK_SIZE);
      setProgressText(totalChunks > 1 ? `Uploading chunk ${chunkIdx}/${totalChunks} (${chunk.length} records)...` : `Uploading ${total} records...`);
      try {
        const res = await safeApiPost(endpoint, chunk);
        if (res && typeof res === 'object') {
          if (Array.isArray(res)) {
            if (res.length > 0 && res[0] && typeof res[0] === 'object' && '_csvRow' in res[0]) {
              const succeeded = new Set(res.map((r: any) => Number(r._csvRow)));
              for (const row of chunk) {
                if (succeeded.has(Number(row._csvRow))) ok++;
                else { fail++; errors.push({ row: Number(row._csvRow), msg: 'Server did not return this record' }); }
              }
            } else {
              ok += chunk.length;
            }
          } else if (typeof res.ok === 'number' && Array.isArray(res.results)) {
            ok += typeof res.ok === 'number' ? res.ok : 0;
            fail += typeof res.fail === 'number' ? res.fail : 0;
            let resultIdx = 0;
            for (const r of res.results) {
              const csvRow = r._csvRow || (chunk[resultIdx]?._csvRow) || 0;
              if (r.error) errors.push({ row: Number(csvRow), msg: String(r.error) });
              resultIdx++;
            }
          } else if (typeof res.ok === 'number' && typeof res.fail === 'number') {
            ok += res.ok;
            fail += res.fail;
          } else {
            ok += chunk.length;
          }
        } else {
          ok += chunk.length;
        }
      } catch (e: any) {
        const msg = e?.message || e?.error || `Chunk ${chunkIdx} failed`;
        fail += chunk.length;
        for (const r of chunk) errors.push({ row: Number(r._csvRow), msg });
      }
    }
    setProgressText('');
    const validationErrorCount = validationErrorRows.size;
    const duplicateCount = duplicateErrorRows.size;
    setResult({
      ok,
      fail,
      duplicates: duplicateCount,
      validationErrors: validationErrorCount,
      errors: errors.length > 0 ? errors.map((e) => `Row ${e.row}: ${e.msg}`) : undefined,
    });
    setUploading(false);
    setStep(3);
  };

  const reset = () => {
    if (step !== 1 && parsed.length > 0 && !window.confirm('Discard current data and start over? All parsed records and validation results will be lost.')) return;
    setStep(1);
    setParsed([]);
    setValidationErrors([]);
    setDuplicateErrors([]);
    setResult(null);
    setFileName('');
  };

  const hasIssues = validationErrors.length + duplicateErrors.length > 0;
  const allIssues = [...validationErrors, ...duplicateErrors];

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
              <p className="text-sm text-slate-500">
                {parsed.length} rows parsed •
                {validationErrors.length} validation issue{validationErrors.length !== 1 ? 's' : ''} •
                {duplicateErrors.length} duplicate issue{duplicateErrors.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button onClick={reset} className="text-sm text-slate-500 hover:underline">Start over</button>
          </div>
          {hasIssues && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
              <div className="flex items-center justify-between gap-2 text-amber-700 text-sm font-medium mb-1">
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Issues found — fix these rows before committing</span>
                <button onClick={downloadErrors} className="inline-flex items-center gap-1 text-xs font-normal text-amber-600 hover:text-amber-800 underline"><FileDown className="w-3 h-3" /> Download errors</button>
              </div>
              <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                {allIssues.slice(0, MAX_VISIBLE_ERRORS).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.msg}</li>
                ))}
                {allIssues.length > MAX_VISIBLE_ERRORS && <li className="text-slate-400">...and {allIssues.length - MAX_VISIBLE_ERRORS} more</li>}
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
            <button onClick={reset} disabled={uploading} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button onClick={commit} disabled={hasIssues || parsed.length === 0 || uploading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {uploading ? 'Uploading...' : `Commit ${parsed.length} Records`}
            </button>
          </div>
          {uploading && progressText && <p className="text-xs text-slate-400 text-right mt-2">{progressText}</p>}
        </Card>
      )}

      {step === 3 && result && (
        <Card className="p-8 text-center">
          {result.fail > 0 ? (
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          ) : (
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          )}
          <h3 className="text-lg font-semibold text-slate-800">Upload complete</h3>
          <p className="text-sm text-slate-500 mt-1">
            {result.ok} records processed successfully{
              result.fail > 0 ? `, ${result.fail} failed` : ''
            }{
              result.duplicates > 0 ? `, ${result.duplicates} duplicates skipped` : ''
            }{
              result.validationErrors > 0 ? `, ${result.validationErrors} validation errors` : ''
            }
          </p>
          {result.errors && result.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-left max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-amber-700 mb-1">Errors:</p>
              <ul className="text-xs text-amber-700 space-y-0.5">
                {result.errors.slice(0, MAX_VISIBLE_ERRORS).map((err, i) => <li key={i}>{err}</li>)}
                {result.errors.length > MAX_VISIBLE_ERRORS && <li className="text-slate-400">...and {result.errors.length - MAX_VISIBLE_ERRORS} more</li>}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-center gap-3 mt-5">
            {(hasIssues || (result.errors && result.errors.length > 0)) && (
              <button onClick={downloadErrors} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <FileDown className="w-4 h-4" /> Download Error Report
              </button>
            )}
            <button onClick={reset} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Upload Another File</button>
          </div>
        </Card>
      )}
    </div>
  );
}
