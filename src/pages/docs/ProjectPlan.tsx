import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const phases = [
  { name: 'Phase 1 — Backend Planning & DB Design', status: 'done', items: ['Canonical schema aligned to 16 tables', 'Specialized validation for calibration, sales, stock, and unloading', 'Supabase auth integrated', 'Serverless API routing in place'] },
  { name: 'Phase 2 — Web Module', status: 'done', items: ['Auth (email + Google)', 'Master setup pages', 'Operations: unloading, dip-volume, stock, sales', 'Finance, reports, and bulk upload wizards'] },
  { name: 'Phase 3 — Documentation & Test Hardening', status: 'progress', items: ['Repository README updated', 'Focused regression tests added', 'In-app docs being aligned to implementation', 'Operational guidance clarified'] },
  { name: 'Phase 4 — Rollout & Production Hardening', status: 'todo', items: ['UAT with station staff', 'Supabase RLS review', 'Data migration and cutover', 'Monitoring, backups, and rollback plan'] },
];

export default function ProjectPlan() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-slate-800">Project Plan</h1><p className="text-sm text-slate-400 mt-0.5">Implementation status plus the remaining rollout roadmap for FuelFlow</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[['Modules', '6'], ['DB Tables', '16'], ['Test Scope', 'Focused'], ['Platforms', 'Web + Mobile Docs']].map(([l, v]) => <Card key={l} className="p-4"><div className="text-xs text-slate-400">{l}</div><div className="text-lg font-bold text-slate-800 mt-0.5">{v}</div></Card>)}
      </div>
      <Card className="p-5 bg-blue-50 border-blue-100">
        <p className="text-sm text-blue-800">This page mixes current implementation status with planned rollout work. Web features listed as complete exist in this repository. Android content remains reference guidance rather than an implemented mobile client.</p>
      </Card>
      <div className="relative space-y-4">
        {phases.map((p, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{p.status === 'done' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : p.status === 'progress' ? <Clock className="w-5 h-5 text-amber-500" /> : <Circle className="w-5 h-5 text-slate-300" />}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between"><h3 className="font-semibold text-slate-800">{p.name}</h3><Badge color={p.status === 'done' ? 'green' : p.status === 'progress' ? 'amber' : 'slate'}>{p.status === 'done' ? 'Complete' : p.status === 'progress' ? 'In Progress' : 'Planned'}</Badge></div>
                <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">{p.items.map((it) => <li key={it} className="flex items-center gap-2 text-sm text-slate-600"><span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> {it}</li>)}</ul>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
