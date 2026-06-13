import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Fuel, LayoutDashboard, Database, Truck, Gauge, ClipboardList, Wallet, BarChart3, Upload, BookOpen, LogOut, Menu, X, ChevronDown, Boxes, Settings2, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from './ui/Modal';

interface NavItem { to?: string; label: string; icon: any; }
interface NavGroup { label: string; icon: any; items: NavItem[]; }

const groups: NavGroup[] = [
  { label: 'Overview', icon: LayoutDashboard, items: [ { to: '/', label: 'Dashboard', icon: LayoutDashboard } ] },
  { label: 'Master Setup', icon: Settings2, items: [
    { to: '/master/products', label: 'Products', icon: Boxes },
    { to: '/master/price-history', label: 'Price History', icon: BarChart3 },
    { to: '/master/tanks', label: 'Tanks & Calibration', icon: Database },
    { to: '/master/dispensers', label: 'Dispensers', icon: Gauge },
    { to: '/master/nozzles', label: 'Nozzles', icon: Gauge },
    { to: '/master/meters', label: 'Meters', icon: Gauge },
    { to: '/master/operators', label: 'Operators', icon: ClipboardList },
    { to: '/master/shifts', label: 'Shifts', icon: ClipboardList },
    { to: '/master/bank-accounts', label: 'Bank Accounts', icon: Wallet },
    { to: '/master/suppliers', label: 'Suppliers', icon: Truck },
  ]},
  { label: 'Operations', icon: Truck, items: [
    { to: '/ops/tanker-unloading', label: 'Tanker Unloading', icon: Truck },
    { to: '/ops/dip-readings', label: 'Dip Readings', icon: Database },
    { to: '/ops/dip-volume', label: 'Dip-to-Volume', icon: Database },
    { to: '/ops/stock', label: 'Stock In / Out', icon: Boxes },
    { to: '/ops/sales', label: 'Daily Sales Entry', icon: ClipboardList },
    { to: '/ops/loss-gain', label: 'Loss / Gain Analysis', icon: BarChart3 },
  ]},
  { label: 'Finance', icon: Wallet, items: [
    { to: '/finance/credit-sales', label: 'Credit Sales', icon: ClipboardList },
    { to: '/finance/management', label: 'Finance Management', icon: Wallet },
  ]},
  { label: 'Reports', icon: BarChart3, items: [ { to: '/reports', label: 'Advanced Reports', icon: BarChart3 } ] },
  { label: 'Bulk Upload', icon: Upload, items: [
    { to: '/bulk/sales', label: 'Sales Upload', icon: Upload },
    { to: '/bulk/daily-sales', label: 'Daily Sales Upload', icon: Upload },
    { to: '/bulk/tank-data', label: 'Tank Data Upload', icon: Upload },
    { to: '/bulk/calibration', label: 'Calibration Upload', icon: Upload },
    { to: '/bulk/dip-readings', label: 'Dip Readings Upload', icon: Upload },
    { to: '/bulk/inventory', label: 'Inventory Upload', icon: Upload },
    { to: '/bulk/credit-sales', label: 'Credit Sales Upload', icon: Upload },
    { to: '/bulk/tanker-unloading', label: 'Tanker Unloading Upload', icon: Upload },
  ]},
  { label: 'Documentation', icon: BookOpen, items: [
    { to: '/docs/project-plan', label: 'Project Plan', icon: FileText },
    { to: '/docs/backend', label: 'Backend & DB Design', icon: Database },
    { to: '/docs/android', label: 'Android Guide', icon: BookOpen },
    { to: '/docs/testing', label: 'Testing & Go Live', icon: ClipboardList },
  ]},
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ Overview: true, 'Master Setup': true, Operations: true, Finance: false, Reports: false, 'Bulk Upload': false, Documentation: false });
  const [confirmLogout, setConfirmLogout] = useState(false);

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
            <div className="text-[10px] text-slate-400">Administrator</div>
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
