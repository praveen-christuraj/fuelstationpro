export function extractBearerToken(authorizationHeader) {
  const value = String(authorizationHeader || '').trim();
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}
