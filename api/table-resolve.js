export const TABLE_ALIASES = {
  finance: 'finance_transactions',
};

export function resolveTable(resource) {
  const normalized = resource?.replace(/-/g, '_');
  return TABLE_ALIASES[normalized] || normalized;
}
