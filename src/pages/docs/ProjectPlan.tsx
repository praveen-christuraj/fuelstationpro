import { CheckCircle2, Circle, Clock } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const phases = [
  { name: 'Phase 1 — Backend Planning & DB Design', status: 'done', items: ['Define entity-relationship model', 'Design Supabase schema (12 tables)', 'Set up RLS & auth', 'Seed master data'] },
  { name: 'Phase 2 — Web Module (Live on Vercel)', status: 'done', items: ['Auth (email + Google)', 'Master setup pages (soft-coded)', 'Operations: unloading, dip-volume, sales', 'Finance & advanced reports', 'Bulk upload wizards'] },
  { name: 'Phase 3 — Android Guide', status: 'progress', items: ['Kotlin (Jetpack Compose) reference', 'React Native Expo reference', 'Shared Supabase client', 'Offline-first sync strategy'] },
  { name: 'Phase 4 — Testing & Go Live', status: 'todo', items: ['Unit & integration tests', 'UAT with station staff', 'Data migration & cutover', 'Production monitoring'] },
];

export default function ProjectPlan() {
  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold text-slate-800">Project Plan</h1><p className="text-sm text-slate-400 mt-0.5">End-to-end delivery roadmap for the Fuel Station Management System</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {[['Modules', '6'], ['DB Tables', '12'], ['API Routes', '16'], ['Platforms', 'Web + Android']].map(([l, v]) => <Card key={l} className="p-4"><div className="text-xs text-slate-400">{l}</div><div className="text-lg font-bold text-slate-800 mt-0.5">{v}</div></Card>)}
      </div>
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
