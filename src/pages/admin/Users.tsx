import { useEffect, useState, useCallback } from 'react';
import { Users as UsersIcon, Plus, Loader2, AlertTriangle, CheckCircle2, Trash2, Shield, Mail, Calendar, UserCog } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import Modal, { ConfirmModal } from '../../components/ui/Modal';
import { useAuth } from '../../contexts/AuthContext';

interface UserRecord {
  id: string;
  email: string;
  role: 'admin' | 'data_entry';
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

type Message = { type: 'ok' | 'err'; text: string } | null;

const ROLE_OPTIONS: { value: UserRecord['role']; label: string }[] = [
  { value: 'data_entry', label: 'Data Entry' },
  { value: 'admin', label: 'Administrator' },
];

export default function AdminUsers() {
  const { session, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  // Create user modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', role: 'data_entry' as UserRecord['role'], display_name: '' });
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline role editing
  const [editingRole, setEditingRole] = useState<{ id: string; saving: boolean } | null>(null);

  const token = session?.access_token;

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch users (${res.status})`);
      }
      const data: UserRecord[] = await res.json();
      setUsers(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load users');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const createUser = async () => {
    if (!token) return;
    if (!createForm.email || !createForm.password) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(createForm),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create user');
      setUsers((prev) => [...prev, body]);
      setMessage({ type: 'ok', text: `User ${body.email} created successfully.` });
      setShowCreate(false);
      setCreateForm({ email: '', password: '', role: 'data_entry', display_name: '' });
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'Failed to create user' });
    }
    setCreating(false);
  };

  const updateRole = async (user: UserRecord, newRole: UserRecord['role']) => {
    if (!token || newRole === user.role) return;
    setEditingRole({ id: user.id, saving: true });
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: user.id, role: newRole, display_name: user.display_name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update role');
      setUsers((prev) => prev.map((u) => (u.id === body.id ? body : u)));
      setMessage({ type: 'ok', text: `Role updated for ${body.email}.` });
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'Failed to update role' });
    }
    setEditingRole(null);
  };

  const deleteUser = async () => {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete user');
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      setMessage({ type: 'ok', text: `User ${deleteTarget.email} deleted.` });
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'Failed to delete user' });
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-800">Access Denied</h2>
          <p className="text-sm text-slate-500 mt-1">Only administrators can manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">User Management</h1>
          <p className="text-sm text-slate-400 mt-0.5">Create, edit, and manage user accounts and their roles.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create User
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border ${
          message.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          {message.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <Card className="p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </Card>
      ) : error ? (
        /* Error */
        <Card className="p-8 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600 mb-3">{error}</p>
          <button onClick={fetchUsers} className="px-4 py-2 rounded-lg bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors">
            Retry
          </button>
        </Card>
      ) : users.length === 0 ? (
        /* Empty */
        <Card className="p-12 text-center">
          <UsersIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No users found.</p>
        </Card>
      ) : (
        /* User Table */
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3 hidden sm:table-cell">Created</th>
                  <th className="px-5 py-3 hidden md:table-cell">Last Login</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold shrink-0">
                          {(u.display_name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {u.display_name || u.email.split('@')[0]}
                          </div>
                          <div className="text-xs text-slate-400 truncate flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {u.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          disabled={editingRole?.id === u.id}
                          onChange={(e) => updateRole(u, e.target.value as UserRecord['role'])}
                          className={`text-xs font-medium px-2 py-1 rounded-lg border transition-colors appearance-none cursor-pointer ${
                            u.role === 'admin'
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          } disabled:opacity-60`}
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        {editingRole?.id === u.id && (
                          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      {u.last_sign_in_at ? (
                        <span className="text-xs text-slate-500">{new Date(u.last_sign_in_at).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Never</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={u.id === session?.user?.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title={u.id === session?.user?.id ? 'Cannot delete yourself' : 'Delete user'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
            {users.length} user{users.length !== 1 ? 's' : ''} total
          </div>
        </Card>
      )}

      {/* Create User Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New User">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              value={createForm.email}
              onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="user@example.com"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
            <input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Min. 6 characters"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
            <input
              type="text"
              value={createForm.display_name}
              onChange={(e) => setCreateForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="John Doe"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
            <select
              value={createForm.role}
              onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as UserRecord['role'] }))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={createUser}
              disabled={creating || !createForm.email || !createForm.password}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        onConfirm={deleteUser}
        title="Delete User"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.email}"? This action cannot be undone.` : ''}
        danger
      />
    </div>
  );
}
