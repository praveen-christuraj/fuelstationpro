/** Central page registry — single source of truth for route metadata, nav, and RBAC permissions */
export interface PageEntry {
  key: string;
  label: string;
  path: string;
  group: string;
  icon: string;
  /** Default-enabled for data_entry role on first run */
  defaultForDataEntry?: boolean;
}

export const PAGE_REGISTRY: PageEntry[] = [
  // ── Overview ──
  { key: 'dashboard',               label: 'Dashboard',                path: '/',                            group: 'Overview',     icon: 'LayoutDashboard' },

  // ── Master Setup ──
  { key: 'master_products',         label: 'Products',                 path: '/master/products',             group: 'Master Setup', icon: 'Boxes' },
  { key: 'master_price_history',    label: 'Price History',            path: '/master/price-history',        group: 'Master Setup', icon: 'BarChart3' },
  { key: 'master_tanks',            label: 'Tanks & Calibration',      path: '/master/tanks',                group: 'Master Setup', icon: 'Database' },
  { key: 'master_dispensers',       label: 'Dispensers',               path: '/master/dispensers',           group: 'Master Setup', icon: 'Gauge' },
  { key: 'master_nozzles',          label: 'Nozzles',                  path: '/master/nozzles',              group: 'Master Setup', icon: 'Gauge' },
  { key: 'master_meters',           label: 'Meters',                   path: '/master/meters',               group: 'Master Setup', icon: 'Gauge' },
  { key: 'master_operators',        label: 'Operators',                path: '/master/operators',            group: 'Master Setup', icon: 'ClipboardList' },
  { key: 'master_shifts',           label: 'Shifts',                   path: '/master/shifts',               group: 'Master Setup', icon: 'ClipboardList' },
  { key: 'master_bank_accounts',    label: 'Bank Accounts',            path: '/master/bank-accounts',        group: 'Master Setup', icon: 'Wallet' },
  { key: 'master_suppliers',        label: 'Suppliers',                path: '/master/suppliers',            group: 'Master Setup', icon: 'Truck' },

  // ── Operations ──
  { key: 'ops_tanker_unloading',    label: 'Tanker Unloading',         path: '/ops/tanker-unloading',        group: 'Operations',   icon: 'Truck',        defaultForDataEntry: true },
  { key: 'ops_dip_readings',        label: 'Dip Readings',             path: '/ops/dip-readings',            group: 'Operations',   icon: 'Database',     defaultForDataEntry: true },
  { key: 'ops_dip_volume',          label: 'Dip-to-Volume',            path: '/ops/dip-volume',              group: 'Operations',   icon: 'Database' },
  { key: 'ops_stock',               label: 'Stock In / Out',           path: '/ops/stock',                   group: 'Operations',   icon: 'Boxes' },
  { key: 'ops_sales',               label: 'Daily Sales Entry',        path: '/ops/sales',                   group: 'Operations',   icon: 'ClipboardList', defaultForDataEntry: true },
  { key: 'ops_loss_gain',           label: 'Loss / Gain Analysis',     path: '/ops/loss-gain',               group: 'Operations',   icon: 'BarChart3' },

  // ── Finance ──
  { key: 'finance_credit_sales',    label: 'Credit Sales',             path: '/finance/credit-sales',        group: 'Finance',      icon: 'ClipboardList' },
  { key: 'finance_management',      label: 'Finance Management',       path: '/finance/management',          group: 'Finance',      icon: 'Wallet' },

  // ── Reports ──
  { key: 'reports_hub',             label: 'Report Hub',               path: '/reports',                     group: 'Reports',      icon: 'BarChart3' },
  { key: 'reports_daily_sales',     label: 'Daily Sales Report',       path: '/reports/daily-sales',         group: 'Reports',      icon: 'ClipboardList' },
  { key: 'reports_tanker_unloading',label: 'Tanker Unloading Report',  path: '/reports/tanker-unloading',    group: 'Reports',      icon: 'Truck' },
  { key: 'reports_price_history',   label: 'Price History Report',     path: '/reports/price-history',       group: 'Reports',      icon: 'TrendingUp' },
  { key: 'reports_finance',          label: 'Finance Report',           path: '/reports/finance',             group: 'Reports',      icon: 'Wallet' },
  { key: 'reports_credit_sales',     label: 'Credit Sales Report',      path: '/reports/credit-sales',        group: 'Reports',      icon: 'CreditCard' },

  // ── Bulk Upload ──
  { key: 'bulk_daily_sales',        label: 'Daily Sales Upload',       path: '/bulk/daily-sales',            group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_tank_data',          label: 'Tank Data Upload',         path: '/bulk/tank-data',              group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_calibration',        label: 'Calibration Upload',       path: '/bulk/calibration',            group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_dip_readings',       label: 'Dip Readings Upload',      path: '/bulk/dip-readings',           group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_inventory',          label: 'Inventory Upload',         path: '/bulk/inventory',              group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_credit_sales',       label: 'Credit Sales Upload',      path: '/bulk/credit-sales',           group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_tanker_unloading',   label: 'Tanker Unloading Upload',  path: '/bulk/tanker-unloading',       group: 'Bulk Upload',  icon: 'Upload' },
  { key: 'bulk_price_history',      label: 'Price History Upload',     path: '/bulk/price-history',          group: 'Bulk Upload',  icon: 'Upload' },

  // ── Documentation ──
  { key: 'docs_project_plan',       label: 'Project Plan',             path: '/docs/project-plan',           group: 'Documentation', icon: 'FileText' },
  { key: 'docs_backend',            label: 'Backend & DB Design',      path: '/docs/backend',                group: 'Documentation', icon: 'Database' },
  { key: 'docs_android',            label: 'Android Guide',            path: '/docs/android',                group: 'Documentation', icon: 'BookOpen' },
  { key: 'docs_testing',            label: 'Testing & Go Live',        path: '/docs/testing',                group: 'Documentation', icon: 'ClipboardList' },

  // ── Admin (only visible to admin role) ──
  { key: 'admin_users',             label: 'User Management',          path: '/admin/users',                 group: 'Admin',        icon: 'ClipboardList' },
  { key: 'admin_permissions',       label: 'Role Permissions',         path: '/admin/permissions',           group: 'Admin',        icon: 'Settings2' },
];

// ── Lookup helpers ──

/** Map of path → PageEntry for O(1) lookups */
export const pageByPath: Record<string, PageEntry | undefined> =
  Object.fromEntries(PAGE_REGISTRY.map((p) => [p.path, p]));

/** Page keys that are default-enabled for the data_entry role */
export const DEFAULT_DATA_ENTRY_KEYS: string[] = PAGE_REGISTRY
  .filter((p) => p.defaultForDataEntry)
  .map((p) => p.key);

/** Ordered group labels (preserves the order from PAGE_REGISTRY) */
export const GROUP_ORDER: string[] = [...new Set(PAGE_REGISTRY.map((p) => p.group))];

/** Get all PageEntry items belonging to a group */
export const pagesByGroup = (group: string): PageEntry[] =>
  PAGE_REGISTRY.filter((p) => p.group === group);
