import supabase from './db-client.js';
import { extractBearerToken } from './auth-token.js';

export async function authenticateRequest(req) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Missing Authorization bearer token',
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid or expired token',
    };
  }

  return {
    ok: true,
    user: data.user,
    token,
  };
}
