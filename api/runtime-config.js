const ALLOWED_RESOURCES = new Set([
  'products',
  'price-history',
  'price_history',
  'tanks',
  'dispensers',
  'nozzles',
  'meters',
  'operators',
  'shifts',
  'bank-accounts',
  'bank_accounts',
  'suppliers',
  'tanker-unloading',
  'tanker_unloading',
  'stock-movements',
  'stock_movements',
  'sales',
  'credit-sales',
  'credit_sales',
  'finance',
  'finance-transactions',
  'finance_transactions',
]);

export function getRequiredServerEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}

export function isAllowedResource(resource) {
  return ALLOWED_RESOURCES.has(String(resource || '').trim());
}

export function parseAllowedOrigins(value = process.env.ALLOWED_ORIGINS) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin, allowedOriginsValue = process.env.ALLOWED_ORIGINS) {
  const allowedOrigins = parseAllowedOrigins(allowedOriginsValue);
  if (allowedOrigins.length === 0) return true;
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function resolveCorsOrigin(origin, allowedOriginsValue = process.env.ALLOWED_ORIGINS) {
  const allowedOrigins = parseAllowedOrigins(allowedOriginsValue);
  if (allowedOrigins.length === 0) return '*';
  if (!origin) return allowedOrigins[0] || null;
  return allowedOrigins.includes(origin) ? origin : null;
}

export function applyCorsHeaders(req, res) {
  const corsOrigin = resolveCorsOrigin(req.headers.origin);
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
