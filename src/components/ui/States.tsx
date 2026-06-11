import { Loader2, AlertCircle, Inbox } from 'lucide-react';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Loader2 className="w-7 h-7 animate-spin mb-2" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-rose-500">
      <AlertCircle className="w-7 h-7 mb-2" />
      <span className="text-sm font-medium">{message}</span>
      {onRetry && <button onClick={onRetry} className="mt-3 text-xs text-blue-600 hover:underline">Retry</button>}
    </div>
  );
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Inbox className="w-8 h-8 mb-2" />
      <span className="text-sm font-medium text-slate-500">{message}</span>
      {hint && <span className="text-xs mt-1">{hint}</span>}
    </div>
  );
}
