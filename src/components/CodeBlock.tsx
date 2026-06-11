import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function CodeBlock({ code, lang = 'text', filename }: { code: string; lang?: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="rounded-lg overflow-hidden border border-slate-800 bg-slate-900 my-3">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/60 border-b border-slate-700">
        <span className="text-xs font-mono text-slate-400">{filename || lang}</span>
        <button onClick={copy} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">{copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}</button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs leading-relaxed text-slate-200 font-mono"><code>{code}</code></pre>
    </div>
  );
}
