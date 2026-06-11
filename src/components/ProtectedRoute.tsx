import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Fuel } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <Fuel className="w-10 h-10 text-blue-600 animate-pulse" />
        <span className="text-slate-500 text-sm font-medium">Loading FuelFlow…</span>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
