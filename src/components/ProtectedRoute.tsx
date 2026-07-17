import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Fuel } from 'lucide-react';
import { PAGE_REGISTRY } from '../lib/page-registry';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, hasPageAccess } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Fuel className="w-10 h-10 text-blue-600 animate-pulse" />
          <span className="text-slate-500 text-sm font-medium">Loading FuelFlow…</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // RBAC: redirect to first allowed page if this path is not permitted
  if (!hasPageAccess(location.pathname)) {
    const firstAllowed = PAGE_REGISTRY.find((p) => hasPageAccess(p.path));
    return <Navigate to={firstAllowed?.path || '/'} replace />;
  }

  return <>{children}</>;
}
