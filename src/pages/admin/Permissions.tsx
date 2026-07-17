import { useEffect, useState, useCallback } from 'react';
import { Shield, CheckCircle2, AlertTriangle, Loader2, Save } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import supabase from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PAGE_REGISTRY, GROUP_ORDER, DEFAULT_DATA_ENTRY_KEYS } from '../../lib/page-registry';

export default function Permissions() {
  const { refreshPermissions, isAdmin } = useAuth();
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Fetch current permissions for data_entry role
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('role_permissions')
        .select('page_key')
        .eq('role', 'data_entry')
        .eq('enabled', true);
      if (data && data.length > 0) {
        setEnabled(new Set(data.map((r: any) => r.page_key)));
      } else {
        // No rows yet — use defaults
        setEnabled(new Set(DEFAULT_DATA_ENTRY_KEYS));
      }
    } catch {
      setEnabled(new Set(DEFAULT_DATA_ENTRY_KEYS));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (key: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (group: string, enable: boolean) => {
    const groupKeys = PAGE_REGISTRY.filter((p) => p.group === group).map((p) => p.key);
    setEnabled((prev) => {
      const next = new Set(prev);
      for (const k of groupKeys) {
        if (enable) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Upsert: delete all existing rows for data_entry, insert current selections
      const { error: delErr } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role', 'data_entry');
      if (delErr) throw delErr;

      if (enabled.size > 0) {
        const rows = Array.from(enabled).map((page_key) => ({
          role: 'data_entry',
          page_key,
          enabled: true,
        }));
        const { error: insErr } = await supabase
          .from('role_permissions')
          .insert(rows);
        if (insErr) throw insErr;
      }

      // Refresh the sidebar live
      await refreshPermissions();
      setMessage({ type: 'ok', text: 'Permissions saved successfully.' });
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'Failed to save permissions.' });
    }
    setSaving(false);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-800">Access Denied</h2>
          <p className="text-sm text-slate-500 mt-1">Only administrators can manage permissions.</p>
        </div>
      </div>
    );
  }

  const groupsWithPages = GROUP_ORDER
    .map((g) => ({ group: g, pages: PAGE_REGISTRY.filter((p) => p.group === g) }))
    .filter((g) => g.pages.length > 0);

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Role Permissions</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Configure which pages the <strong>Data Entry</strong> role can access.
            Admins always have full access.
          </p>
        </div>
        <Shield className="w-8 h-8 text-blue-500" />
      </div>

      {loading ? (
        <Card className="p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </Card>
      ) : (
        <>
          {groupsWithPages.map(({ group, pages }) => {
            const enabledCount = pages.filter((p) => enabled.has(p.key)).length;
            const allEnabled = enabledCount === pages.length;
            return (
              <Card key={group} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700">{group}</h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">{enabledCount}/{pages.length}</span>
                    <button
                      onClick={() => toggleGroup(group, !allEnabled)}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      {allEnabled ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {pages.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={enabled.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-600">{p.label}</span>
                      <span className="text-[10px] text-slate-400 font-mono ml-auto">{p.path}</span>
                    </label>
                  ))}
                </div>
              </Card>
            );
          })}

          {/* Message */}
          {message && (
            <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg ${
              message.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {message.text}
            </div>
          )}

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
