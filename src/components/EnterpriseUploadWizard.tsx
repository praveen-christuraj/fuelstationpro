import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, FileDown, CheckCircle2, AlertTriangle, XCircle, ChevronRight, Loader2, RotateCcw, Clock, BarChart3, FileText, RefreshCw } from 'lucide-react';
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

interface ChunkResult {
  ok: number;
  fail: number;
  errors: { row: number; msg: string }[];
  entryIds: number[];
}

interface UploadSession {
  id: string;
  startedAt: number;
  totalRows: number;
  chunkSize: number;
  totalChunks: number;
  processedChunks: number;
  ok: number;
  fail: number;
  errors: { row: number; msg: string }[];
  entryIds: number[];
  stage: 'idle' | 'uploading' | 'done' | 'rolling-back';
  fileName: string;
}

interface Props {
  title: string;
  description: string;
  endpoint: string;
  fields: FieldSpec[];
  templateName: string;
  undoEndpoint?: string;
  customValidate?: (row: Record<string, string>, rowNumber: number) => string[];
}

const CHUNK_SIZE = 250;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_VISIBLE_ERRORS = 200;
const SESSION_KEY = 'fuelflow_upload_session';

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

export default function EnterpriseUploadWizard({ title, description, endpoint, fields, templateName, undoEndpoint, customValidate }: Props) {
  const [stage, setStage] = useState<'upload' | 'validate' | 'import' | 'results'>('upload');
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [validationErrors, setValidationErrors] = useState<{ row: number; msg: string }[]>([]);
  const [duplicateErrors, setDuplicateErrors] = useState<{ row: number; msg: string }[]>([]);
  const [session, setSession] = useState<UploadSession | null>(null);
  const [progressText, setProgressText] = useState('');
  const [progressPct, setProgressPct] = useState(0);
  const [result, setResult] = useState<{ ok: number; fail: number; duplicates: number; validationErrors: number; errors?: string[]; entryIds: number[] } | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoResult, setUndoResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const s: UploadSession = JSON.parse(saved);
        if (s.stage === 'uploading' || s.stage === 'done') {
          setSession(s);
          if (s.stage === 'done') {
            setResult({ ok: s.ok, fail: s.fail, duplicates: 0, validationErrors: 0, errors: s.errors.length ? s.errors.map((e) => `Row ${e.row}: ${e.msg}`) : undefined, entryIds: s.entryIds });
            setStage('results');
          }
        }
      }
    } catch {}
  }, []);

  const persistSession = useCallback((updates: Partial<UploadSession>) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...updates };
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    setSession(null);
    setResult(null);
    setStage('upload');
    setParsed([]);
    setValidationErrors([]);
    setDuplicateErrors([]);
    setProgressText('');
    setProgressPct(0);
    setFileName('');
    setUndoResult(null);
    setUndoing(false);
  }, []);

  const downloadTemplate = () => {
    const headers = fields.map((f) => f.key);
    const example = [Object.fromEntries(fields.map((f) => [f.key, f.example]))];
    downloadCSV(`${templateName}_template.csv`, toCSV(example, headers));
  };

  const downloadErrors = () => {
    const allErrors = [...validationErrors, ...duplicateErrors];
    if (allErrors.length === 0 && result?.errors) {
      const rows = result.errors.map((e) => {
        const m = e.match(/^Row (\d+): (.+)$/);
        return { Row: m?.[1] || '', Error: m?.[2] || e };
      });
      downloadCSV(`${templateName}_errors.csv`, toCSV(rows));
      return;
    }
    if (allErrors.length === 0) return;
    const rows = allErrors.map((e) => ({ Row: e.row, Error: e.msg }));
    downloadCSV(`${templateName}_errors.csv`, toCSV(rows));
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const processFile = (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${MAX_FILE_SIZE / 1024 / 1024}MB limit. Please split the file and try again.`);
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
      fields.filter((f) => f.unique).forEach((f) => seenValues.set(f.key, new Map<string, number>()));

      rows.forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 2;
        let isValid = true;

        for (const f of fields) {
          const trimmed = trimVal(row[f.key]);
          if (f.required && isBlank(row[f.key])) {
            validationErrors.push({ row: rowNumber, msg: `Missing required "${f.label}"` });
            isValid = false;
          }
          if (f.type === 'number' && !isBlank(row[f.key]) && toTrimmedNum(row[f.key]) === null) {
            validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be a number, got "${trimmed}"` });
            isValid = false;
          }
          if (f.type === 'number' && f.min != null && !isBlank(row[f.key])) {
            const n = toTrimmedNum(row[f.key]);
            if (n !== null && n < f.min) {
              validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be ${f.min} or greater, got ${n}` });
              isValid = false;
            }
          }
          if (f.type === 'number' && f.max != null && !isBlank(row[f.key])) {
            const n = toTrimmedNum(row[f.key]);
            if (n !== null && n > f.max) {
              validationErrors.push({ row: rowNumber, msg: `"${f.label}" must be ${f.max} or less, got ${n}` });
              isValid = false;
            }
          }
          if (f.options && !isBlank(row[f.key]) && !f.options.includes(trimmed)) {
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
                duplicateErrors.push({ row: rowNumber, msg: `Duplicate value "${trimVal(row[f.key])}" for "${f.label}" (already at row ${seenMap.get(normalized)})` });
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
      setStage('validate');

      const sessionId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const validRows = rows.length - new Set([...validationErrors.map((e) => e.row), ...duplicateErrors.map((e) => e.row)]).size;
      const totalChunks = Math.ceil(validRows / CHUNK_SIZE);
      const newSession: UploadSession = {
        id: sessionId,
        startedAt: Date.now(),
        totalRows: validRows,
        chunkSize: CHUNK_SIZE,
        totalChunks,
        processedChunks: 0,
        ok: 0,
        fail: 0,
        errors: [],
        entryIds: [],
        stage: 'idle',
        fileName: file.name,
      };
      setSession(newSession);
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(newSession)); } catch {}
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
    if (!session) return;

    const validationErrorRows = new Set(validationErrors.map((e) => e.row));
    const duplicateErrorRows = new Set(duplicateErrors.map((e) => e.row));
    const skipRows = new Set([...validationErrorRows, ...duplicateErrorRows]);

    const payload: Record<string, any>[] = [];
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
    const totalChunks = Math.ceil(total / CHUNK_SIZE);

    setStage('import');
    setProgressPct(0);
    persistSession({ stage: 'uploading' });

    let ok = 0, fail = 0;
    const errors: { row: number; msg: string }[] = [];
    const entryIds: number[] = [];
    const startedAt = Date.now();

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = payload.slice(i, i + CHUNK_SIZE);
      const chunkIdx = Math.floor(i / CHUNK_SIZE) + 1;
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      const pct = Math.round((i / total) * 100);

      setProgressPct(pct);
      setProgressText(totalChunks > 1
        ? `Chunk ${chunkIdx}/${totalChunks} (${chunk.length} rows) — ${elapsed}s elapsed`
        : `Uploading ${total} records...`);

      try {
        const res = await safeApiPost(endpoint, chunk);
        if (res && typeof res === 'object') {
          if (typeof res.ok === 'number' && Array.isArray(res.results)) {
            ok += res.ok;
            fail += res.fail;
            let resultIdx = 0;
            for (const r of res.results) {
              const csvRow = r._csvRow || (chunk[resultIdx]?._csvRow) || 0;
              if (r.entry_id) entryIds.push(Number(r.entry_id));
              if (r.error) errors.push({ row: Number(csvRow), msg: String(r.error) });
              resultIdx++;
            }
          } else if (typeof res.ok === 'number') {
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

      persistSession({ ok, fail, errors, entryIds, processedChunks: chunkIdx });
    }

    setProgressPct(100);
    setProgressText(`Completed in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

    const validationErrorCount = validationErrorRows.size;
    const duplicateCount = duplicateErrorRows.size;
    const finalResult = {
      ok, fail, duplicates: duplicateCount, validationErrors: validationErrorCount,
      errors: errors.length > 0 ? errors.map((e) => `Row ${e.row}: ${e.msg}`) : undefined,
      entryIds,
    };

    setResult(finalResult);
    persistSession({ stage: 'done', ok, fail, errors });
    setStage('results');
  };

  const handleUndo = async () => {
    if (!result || !result.entryIds.length || !undoEndpoint) return;
    if (!window.confirm(`Undo this import? This will delete ${result.entryIds.length} entries and reverse all side effects.`)) return;

    setUndoing(true);
    setUndoResult(null);
    try {
      const res = await fetch(undoEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ entry_ids: result.entryIds }),
      });
      const data = await res.json();
      if (data.ok > 0) {
        const failedIds: number[] = [];
        if (data.results) {
          for (const r of data.results) {
            if (r.error && r.entry_id != null) failedIds.push(Number(r.entry_id));
          }
        }
        setUndoResult(`Rolled back ${data.ok} entries${data.fail > 0 ? `, ${data.fail} failed` : ''}${failedIds.length > 0 ? '. Fix errors and retry.' : ''}`);
        if (failedIds.length > 0) {
          setResult({ ...result, entryIds: failedIds, ok: 0, fail: 0 });
        } else {
          setResult({ ...result, entryIds: [], ok: 0, fail: 0 });
        }
      } else {
        setUndoResult(`Undo failed: ${data.results?.[0]?.error || 'Unknown error'}`);
      }
    } catch (e: any) {
      setUndoResult(`Undo error: ${e.message}`);
    }
    setUndoing(false);
  };

  const isDropping = dragging;
  const hasIssues = validationErrors.length + duplicateErrors.length > 0;
  const allIssues = [...validationErrors, ...duplicateErrors];

  const stageTags = [
    { key: 'upload', label: 'Upload File' },
    { key: 'validate', label: 'Review & Validate' },
    { key: 'import', label: 'Import' },
    { key: 'results', label: 'Results' },
  ];

  const stageIndex = stageTags.findIndex((s) => s.key === stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-400 mt-0.5">{description}</p>
        </div>
        {session && stage !== 'upload' && (
          <button onClick={clearSession} className="text-xs text-slate-400 hover:text-slate-600 underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Start over
          </button>
        )}
      </div>

      {/* Stage indicator */}
      <div className="flex items-center gap-1 text-xs font-medium">
        {stageTags.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs ${
              stageIndex > i ? 'bg-emerald-500 text-white' : stageIndex === i ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {stageIndex > i ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
            </span>
            <span className={stageIndex >= i ? 'text-slate-700' : 'text-slate-400'}>{s.label}</span>
            {i < stageTags.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Stage: Upload */}
      {stage === 'upload' && (
        <Card className="p-6">
          <div className="max-w-xl">
            <h3 className="font-semibold text-slate-800 mb-1">Upload your data</h3>
            <p className="text-sm text-slate-500 mb-4">Download the CSV template, fill it with your records, then upload.</p>

            <div className="mb-4">
              <table className="w-full text-xs rounded-lg border border-slate-200 overflow-hidden">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2">Column</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Required</th>
                    <th className="text-left px-3 py-2">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fields.map((f) => (
                    <tr key={f.key}>
                      <td className="px-3 py-2 font-mono text-slate-700">{f.key}</td>
                      <td className="px-3 py-2 text-slate-500">{f.type || 'text'}</td>
                      <td className="px-3 py-2">{f.required ? <span className="text-rose-600 font-medium">Yes</span> : <span className="text-slate-400">No</span>}</td>
                      <td className="px-3 py-2 text-slate-500">{f.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 mb-6">
              <FileDown className="w-4 h-4" /> Download CSV Template
            </button>

            {/* Drag-and-drop zone */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDropping ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Upload className={`w-8 h-8 mx-auto mb-2 ${isDropping ? 'text-blue-500' : 'text-slate-400'}`} />
              <p className={`text-sm mb-1 ${isDropping ? 'text-blue-600 font-medium' : 'text-slate-500'}`}>
                {isDropping ? 'Drop your file here' : 'Drag & drop your CSV file here'}
              </p>
              <p className="text-xs text-slate-400 mb-3">or click to browse</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 cursor-pointer">
                <Upload className="w-4 h-4" /> Choose File
                <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileSelect} className="hidden" />
              </label>
              <p className="text-xs text-slate-400 mt-3">Maximum file size: {MAX_FILE_SIZE / 1024 / 1024}MB</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stage: Validate */}
      {stage === 'validate' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-slate-800">Review your data</h3>
              <p className="text-sm text-slate-500">
                {fileName} &middot; {parsed.length} rows parsed &middot;
                {validationErrors.length} validation issue{validationErrors.length !== 1 ? 's' : ''} &middot;
                {duplicateErrors.length} duplicate{duplicateErrors.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {hasIssues && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
              <div className="flex items-center justify-between gap-2 text-amber-700 text-sm font-medium mb-1">
                <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Issues found — fix these rows in your CSV and re-upload</span>
                <button onClick={downloadErrors} className="inline-flex items-center gap-1 text-xs font-normal text-amber-600 hover:text-amber-800 underline">
                  <FileDown className="w-3 h-3" /> Download errors
                </button>
              </div>
              <ul className="text-xs text-amber-700 space-y-0.5 max-h-32 overflow-y-auto">
                {allIssues.slice(0, MAX_VISIBLE_ERRORS).map((e, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-amber-500 mt-0.5 shrink-0">&#9656;</span>
                    <span>Row {e.row}: {e.msg}</span>
                  </li>
                ))}
                {allIssues.length > MAX_VISIBLE_ERRORS && <li className="text-slate-400">...and {allIssues.length - MAX_VISIBLE_ERRORS} more</li>}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-80">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 whitespace-nowrap w-10">#</th>
                  {fields.map((f) => <th key={f.key} className="text-left px-3 py-2 whitespace-nowrap">{f.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {parsed.slice(0, 100).map((r, i) => {
                  const rowNum = i + 2;
                  const hasErr = validationErrors.some((e) => e.row === rowNum) || duplicateErrors.some((e) => e.row === rowNum);
                  return (
                    <tr key={i} className={hasErr ? 'bg-rose-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className={`px-3 py-2 whitespace-nowrap font-mono text-xs ${hasErr ? 'text-rose-500' : 'text-slate-400'}`}>
                        {hasErr ? <XCircle className="w-3 h-3 inline mr-1" /> : null}
                        {rowNum}
                      </td>
                      {fields.map((f) => (
                        <td key={f.key} className={`px-3 py-2 whitespace-nowrap ${hasErr ? 'text-rose-600' : 'text-slate-600'}`}>
                          {r[f.key] || <span className="text-slate-300">&mdash;</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {parsed.length > 100 && <tr><td colSpan={fields.length + 1} className="px-3 py-2 text-xs text-slate-400 text-center italic">...and {parsed.length - 100} more rows</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2 mt-5">
            <div className="text-xs text-slate-400">
              {parsed.length} rows &middot;
              {parsed.length - validationErrors.length - duplicateErrors.length} valid &middot;
              {allIssues.length} issues
            </div>
            <div className="flex gap-2">
              <button onClick={clearSession} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={commit} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                <BarChart3 className="w-4 h-4" /> Import {parsed.length - allIssues.length} Records
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Stage: Import (progress) */}
      {stage === 'import' && session && (
        <Card className="p-8 text-center">
          <div className="mb-4">
            <Loader2 className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
            <h3 className="text-lg font-semibold text-slate-800">Importing data...</h3>
            <p className="text-sm text-slate-500 mt-1">{progressText}</p>
          </div>

          {/* Progress bar */}
          <div className="max-w-md mx-auto">
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>{session.processedChunks}/{session.totalChunks} chunks</span>
              <span>{progressPct}%</span>
            </div>
          </div>

          {progressPct > 0 && (
            <div className="mt-4 flex items-center justify-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {session.ok} ok</span>
              {session.fail > 0 && <span className="flex items-center gap-1"><XCircle className="w-4 h-4 text-rose-500" /> {session.fail} failed</span>}
            </div>
          )}
        </Card>
      )}

      {/* Stage: Results */}
      {stage === 'results' && result && (
        <Card className="p-8 text-center">
          {result.fail > 0 && result.ok === 0 ? (
            <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          ) : result.fail > 0 ? (
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          ) : (
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          )}

          <h3 className="text-lg font-semibold text-slate-800">
            {result.fail > 0 && result.ok === 0 ? 'Import failed' : 'Import complete'}
          </h3>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 max-w-lg mx-auto">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
              <p className="text-2xl font-bold text-emerald-600">{result.ok}</p>
              <p className="text-xs text-emerald-600">Imported</p>
            </div>
            {result.fail > 0 && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
                <p className="text-2xl font-bold text-rose-600">{result.fail}</p>
                <p className="text-xs text-rose-600">Failed</p>
              </div>
            )}
            {result.duplicates > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-2xl font-bold text-amber-600">{result.duplicates}</p>
                <p className="text-xs text-amber-600">Duplicates</p>
              </div>
            )}
            {result.validationErrors > 0 && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                <p className="text-2xl font-bold text-orange-600">{result.validationErrors}</p>
                <p className="text-xs text-orange-600">Validation</p>
              </div>
            )}
          </div>

          {/* Errors */}
          {result.errors && result.errors.length > 0 && (
            <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-left max-h-48 overflow-y-auto">
              <p className="text-xs font-medium text-rose-700 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Errors ({result.errors.length})
              </p>
              <ul className="text-xs text-rose-700 space-y-0.5">
                {result.errors.slice(0, MAX_VISIBLE_ERRORS).map((err, i) => <li key={i}>{err}</li>)}
                {result.errors.length > MAX_VISIBLE_ERRORS && <li className="text-slate-400">...and {result.errors.length - MAX_VISIBLE_ERRORS} more</li>}
              </ul>
            </div>
          )}

          {/* Undo result */}
          {undoResult && (
            <div className={`mt-3 rounded-lg p-3 text-sm ${undoResult.includes('Successfully') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
              {undoResult}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
            {result.errors && result.errors.length > 0 && (
              <button onClick={downloadErrors} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <FileDown className="w-4 h-4" /> Download Error Report
              </button>
            )}
            {undoEndpoint && result.entryIds.length > 0 && (
              <button onClick={handleUndo} disabled={undoing} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rose-200 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                {undoing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {undoing ? 'Rolling back...' : 'Undo Import'}
              </button>
            )}
            <button onClick={clearSession} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
              Upload Another File
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}