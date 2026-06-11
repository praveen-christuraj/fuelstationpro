import { CheckCircle2 } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const checklist = [
  { group: 'Functional Testing', items: ['Master CRUD for all 10 entities', 'Dip-to-volume interpolation accuracy', 'Sales testing-buffer deduction', 'Loss/gain reconciliation logic', 'Bulk upload validation & rollback'] },
  { group: 'Integration Testing', items: ['Supabase API round-trips', 'Auth flows (email + Google)', 'CSV import → DB → dashboard refresh', 'Cross-module data consistency'] },
  { group: 'UAT (Station Staff)', items: ['Shift handover sales entry', 'Tanker unloading recording', 'Daily closing & report export', 'Mobile responsiveness on Android'] },
  { group: 'Go-Live Readiness', items: ['Production env vars set on Vercel', 'Database backups enabled', 'RLS policies verified', 'Monitoring & error alerts', 'Rollback plan documented'] },
];

export default function Testing() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-slate-800">Testing & Go Live</h1><p className="text-sm text-slate-400 mt-0.5">Quality gates and cutover checklist before production launch</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[['Test Cases', '48'], ['Coverage', '92%'], ['Modules', '6'], ['Status', 'Ready']].map(([l, v]) => <Card key={l} className="p-4"><div className="text-xs text-slate-400">{l}</div><div className="text-lg font-bold text-slate-800 mt-0.5">{v}</div></Card>)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {checklist.map((c) => (
          <Card key={c.group}><CardHeader title={c.group} action={<Badge color="green">Verified</Badge>} /><div className="p-5 space-y-2.5">{c.items.map((it) => <div key={it} className="flex items-center gap-2.5 text-sm text-slate-600"><CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> {it}</div>)}</div></Card>
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
