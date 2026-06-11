import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const checklist = [
  { group: 'Focused Automated Checks', badge: 'Implemented', color: 'green', items: ['Calibration validation rules', 'Finance table alias resolution', 'Sales server-side normalization', 'Stock and unloading integrity rules', 'Loss/gain reconciliation math'] },
  { group: 'Manual / Integration Coverage', badge: 'Recommended', color: 'amber', items: ['Supabase API round-trips in deployed environment', 'Auth flows (email + Google)', 'CSV import to DB to dashboard refresh', 'Cross-module data consistency checks'] },
  { group: 'UAT (Station Staff)', badge: 'Pending', color: 'slate', items: ['Shift handover sales entry', 'Tanker unloading recording', 'Daily closing and report export', 'Mobile responsiveness on Android browsers'] },
  { group: 'Go-Live Readiness', badge: 'Pending', color: 'slate', items: ['Production env vars set on Vercel', 'Database backups enabled', 'RLS policies verified', 'Monitoring and error alerts', 'Rollback plan documented'] },
];

export default function Testing() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-slate-800">Testing & Go Live</h1><p className="text-sm text-slate-400 mt-0.5">Implemented regression checks plus the remaining manual and rollout work before production launch</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[['Automated Tests', '8'], ['Runner', 'node:test'], ['Modules', '6'], ['Status', 'In Progress']].map(([l, v]) => <Card key={l} className="p-4"><div className="text-xs text-slate-400">{l}</div><div className="text-lg font-bold text-slate-800 mt-0.5">{v}</div></Card>)}
      </div>
      <Card className="p-5 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">This repository now contains focused regression tests around the hardened backend flows. It does not yet have full end-to-end coverage or production sign-off, so treat the items below as a mix of implemented checks and remaining rollout tasks.</p>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {checklist.map((c) => (
          <Card key={c.group}><CardHeader title={c.group} action={<Badge color={c.color as 'green' | 'amber' | 'slate'}>{c.badge}</Badge>} /><div className="p-5 space-y-2.5">{c.items.map((it) => <div key={it} className="flex items-center gap-2.5 text-sm text-slate-600"><CheckCircle2 className={`w-4 h-4 shrink-0 ${c.color === 'green' ? 'text-emerald-500' : c.color === 'amber' ? 'text-amber-500' : 'text-slate-300'}`} /> {it}</div>)}</div></Card>
        ))}
      </div>
      <Card className="p-6 bg-gradient-to-br from-blue-600 to-blue-700 text-white">
        <h3 className="text-lg font-bold">Go-Live Cutover Steps</h3>
        <ol className="mt-3 space-y-2 text-sm text-blue-50">
          <li>1. Freeze legacy data entry &amp; export final dataset</li>
          <li>2. Run bulk imports for tanks, inventory &amp; opening balances</li>
          <li>3. Verify dashboard KPIs match closing reports</li>
          <li>4. Enable production auth &amp; onboard operators</li>
          <li>5. Monitor first 3 shifts closely, then sign off</li>
        </ol>
      </Card>
    </div>
  );
}
