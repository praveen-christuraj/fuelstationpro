import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import supabase from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import { pageByPath, DEFAULT_DATA_ENTRY_KEYS } from '../lib/page-registry';

type Role = 'admin' | 'data_entry';

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: Role;
  isAdmin: boolean;
  /** Set of page keys this user is allowed to access */
  allowedPageKeys: Set<string>;
  /** Check whether the given route path is accessible to this user */
  hasPageAccess: (path: string) => boolean;
  /** Re-fetch permissions from the DB (called after admin saves changes) */
  refreshPermissions: () => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY_SET = new Set<string>();

const AuthContext = createContext<AuthCtx>({
  user: null, session: null, loading: true,
  role: 'data_entry', isAdmin: false,
  allowedPageKeys: EMPTY_SET,
  hasPageAccess: () => false,
  refreshPermissions: async () => {},
  signOut: async () => {},
});

/** Fetch allowed page keys for a given role from the role_permissions table */
async function fetchPermissions(role: Role): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('role_permissions')
      .select('page_key')
      .eq('role', role)
      .eq('enabled', true);
    if (data && data.length > 0) {
      return new Set(data.map((r: any) => r.page_key));
    }
    // Fall back to defaults when table is empty or role has no rows
    return new Set(DEFAULT_DATA_ENTRY_KEYS);
  } catch {
    return new Set(DEFAULT_DATA_ENTRY_KEYS);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowedPageKeys, setAllowedPageKeys] = useState<Set<string>>(EMPTY_SET);
  const bootstrapAttempted = useRef(false);

  const role: Role = (user?.user_metadata?.role as Role) || 'data_entry';
  const isAdmin = role === 'admin';

  /** Fetch permissions from DB for the current role */
  const refreshPermissions = useCallback(async () => {
    if (role === 'admin') {
      // Admin has access to ALL pages — no need to query
      setAllowedPageKeys(new Set(DEFAULT_DATA_ENTRY_KEYS)); // placeholder, see hasPageAccess
      return;
    }
    const keys = await fetchPermissions(role);
    setAllowedPageKeys(keys);
  }, [role]);

  const hasPageAccess = useCallback((path: string): boolean => {
    if (isAdmin) return true; // admin sees everything
    // Unknown paths (404, login) are always allowed
    const entry = pageByPath[path];
    if (!entry) return true;
    return allowedPageKeys.has(entry.key);
  }, [isAdmin, allowedPageKeys]);

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (error) {
        console.error('Error initializing auth session:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      isMounted = false;
    };
  }, []);

  // Fetch permissions whenever the role changes (e.g. after login)
  useEffect(() => {
    if (!loading && user) {
      if (isAdmin) {
        setAllowedPageKeys(EMPTY_SET); // admin bypass — not used
      } else {
        fetchPermissions(role).then(setAllowedPageKeys);
        // Auto-bootstrap: if no admin exists yet, promote this first user
        if (!bootstrapAttempted.current && session?.access_token) {
          bootstrapAttempted.current = true;
          fetch('/api/admin/bootstrap', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.promoted) {
                // Session metadata updated server-side — refresh to pick it up
                supabase.auth.refreshSession();
              }
            })
            .catch(() => {/* best-effort */});
        }
      }
    }
  }, [loading, user, isAdmin, role, session?.access_token]);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{
      user, session, loading, role, isAdmin,
      allowedPageKeys, hasPageAccess, refreshPermissions, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
