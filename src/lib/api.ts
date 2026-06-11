import supabase from './supabase';

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session?.access_token) {
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return headers;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(path, {
    headers: await getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function apiPut<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || `PUT ${path} failed: ${res.status}`);
  }
  return res.json();
}

export async function apiDelete<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || e.error || `DELETE ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const fmtMoney = (n: number | null | undefined, currency = '₹') => {
  const v = Number(n || 0);
  return currency + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtNum = (n: number | null | undefined, d = 2) => {
  const v = Number(n || 0);
  return v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
};

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};
