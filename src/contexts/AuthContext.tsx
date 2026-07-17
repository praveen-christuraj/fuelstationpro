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
    return new Set(DEFAULT_DATA_ENTRY_KEYS);
  } catch {
    return new Set(DEFAULT_DATA_ENTRY_KEYS);
  }
}

/** Attempt to bootstrap the first admin user — called immediately on auth state change */
async function tryBootstrap(accessToken: string): Promise<void> {
  try {
    const res = await fetch('/api/admin/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    if (body.promoted) {
      console.log('[Bootstrap] ✅ You are now admin! Refreshing session...');
      await supabase.auth.refreshSession();
    } else if (body.error) {
      console.warn('[Bootstrap] API returned error:', body.error);
    } else {
      console.log('[Bootstrap] Admin already exists — no promotion needed');
    }
  } catch (err) {
    console.warn('[Bootstrap] Fetch failed (expected if running locally without API):', err);
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
      setAllowedPageKeys(new Set(DEFAULT_DATA_ENTRY_KEYS));
      return;
    }
    const keys = await fetchPermissions(role);
    setAllowedPageKeys(keys);
  }, [role]);

  const hasPageAccess = useCallback((path: string): boolean => {
    if (isAdmin) return true;
    const entry = pageByPath[path];
    if (!entry) return true;
    return allowedPageKeys.has(entry.key);
  }, [isAdmin, allowedPageKeys]);

  /** Shared handler — runs on initial load AND every auth state change */
  const handleAuthEvent = useCallback((session: Session | null) => {
    setSession(session);
    setUser(session?.user ?? null);
    setLoading(false);

    // If user is NOT admin and we haven't tried bootstrapping yet, try it NOW
    if (
      session?.access_token &&
      session?.user?.user_metadata?.role !== 'admin' &&
      !bootstrapAttempted.current
    ) {
      bootstrapAttempted.current = true;
      tryBootstrap(session.access_token);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Initial load — get existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) handleAuthEvent(session);
    }).catch((error) => {
      console.error('Error initializing auth session:', error);
      if (isMounted) setLoading(false);
    });

    // Subscribe to future auth changes (login, token refresh, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (isMounted) handleAuthEvent(session);
    });

    return () => { isMounted = false; subscription.unsubscribe(); };
  }, [handleAuthEvent]);

  // Fetch permissions whenever role changes
  useEffect(() => {
    if (!loading && user) {
      if (isAdmin) {
        setAllowedPageKeys(EMPTY_SET);
      } else {
        fetchPermissions(role).then(setAllowedPageKeys);
      }
    }
  }, [loading, user, isAdmin, role]);

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
