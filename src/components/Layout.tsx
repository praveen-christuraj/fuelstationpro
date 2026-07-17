import { useState, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Fuel, LayoutDashboard, Database, Truck, Gauge, ClipboardList,
  Wallet, BarChart3, Upload, BookOpen, LogOut, Menu, X, ChevronDown,
  Boxes, Settings2, FileText, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PAGE_REGISTRY, GROUP_ORDER } from '../lib/page-registry';
import { ConfirmModal } from './ui/Modal';

interface NavItem { to?: string; label: string; icon: any; }
interface NavGroup { label: string; icon: any; items: NavItem[]; }

/** Map string icon names (from page-registry) to Lucide components */
const iconMap: Record<string, any> = {
  LayoutDashboard, Database, Truck, Gauge, ClipboardList,
  Wallet, BarChart3, Upload, BookOpen, Boxes, Settings2, FileText, TrendingUp,
};

/** Map group labels to their Lucide icon */
const groupIconMap: Record<string, any> = {
  'Overview': LayoutDashboard,
  'Master Setup': Settings2,
  'Operations': Truck,
  'Finance': Wallet,
  'Reports': BarChart3,
  'Bulk Upload': Upload,
  'Documentation': BookOpen,
  'Admin': Settings2,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut, hasPageAccess, role } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  /** Build nav groups from the page registry, filtered by permissions */
  const groups = useMemo<NavGroup[]>(() => {
    const allowed = PAGE_REGISTRY.filter((p) => hasPageAccess(p.path));
    const groupsMap = new Map<string, NavItem[]>();
    for (const p of allowed) {
      if (!groupsMap.has(p.group)) groupsMap.set(p.group, []);
      groupsMap.get(p.group)!.push({ to: p.path, label: p.label, icon: iconMap[p.icon] || ClipboardList });
    }
    // Preserve group order from GROUP_ORDER
    return GROUP_ORDER
      .filter((g) => groupsMap.has(g))
      .map((g) => ({ label: g, icon: groupIconMap[g] || LayoutDashboard, items: groupsMap.get(g)! }));
  }, [hasPageAccess]);

  // Collect group labels for collapse state defaults
  const defaultOpen: Record<string, boolean> = useMemo(() => {
    const o: Record<string, boolean> = {};
    for (const g of groups) o[g.label] = true;
    return o;
  }, [groups]);
  const [open, setOpen] = useState<Record<string, boolean>>(defaultOpen);

  const handleLogout = async () => { await signOut(); nav('/login'); };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40"><Fuel className="w-5 h-5 text-white" /></div>
        <div>
          <div className="text-white font-bold text-sm tracking-tight leading-none">FuelFlow</div>
          <div className="text-slate-400 text-[10px] mt-0.5">Station Management</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1">
        {groups.map((g) => (
          <div key={g.label}>
            <button onClick={() => setOpen({ ...open, [g.label]: !open[g.label] })} className="w-full flex items-center justify-between px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300">
              <span className="flex items-center gap-2"><g.icon className="w-3.5 h-3.5" /> {g.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open[g.label] ? 'rotate-180' : ''}`} />
            </button>
            {open[g.label] && (
              <div className="space-y-0.5 mt-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to!} end={it.to === '/'} onClick={() => setMobileOpen(false)} className={({ isActive }) => `flex items-center gap-2.5 pl-7 pr-2.5 py-2 rounded-lg text-sm transition ${isActive ? 'bg-blue-600 text-white font-medium shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                    <it.icon className="w-4 h-4 shrink-0" /> {it.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-3">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">{(user?.email || 'U')[0].toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user?.email}</div>
            <div className="text-[10px] text-slate-400 capitalize">{role === 'admin' ? 'Administrator' : 'Data Entry'}</div>
          </div>
          <button onClick={() => setConfirmLogout(true)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400" title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
        <ConfirmModal open={confirmLogout} onClose={() => setConfirmLogout(false)} onConfirm={handleLogout} title="Sign Out" message="Are you sure you want to sign out?" danger={false} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-slate-900 flex-col z-30">{SidebarContent}</aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900">{SidebarContent}</aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4">
          <button onClick={() => setMobileOpen(true)} className="p-2 -ml-2 text-slate-600">{mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button>
          <div className="flex items-center gap-2"><Fuel className="w-5 h-5 text-blue-600" /><span className="font-bold text-slate-800">FuelFlow</span></div>
          <div className="w-8" />
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
