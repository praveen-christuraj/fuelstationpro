import supabase from './db-client.js';
import { validateChart } from './calibration-validate.js';
import { normalizeSalesRows } from './sales-validate.js';
import { normalizeStockMovementRows } from './stock-validate.js';
import { resolveTable } from './table-resolve.js';
import { applyCorsHeaders, isAllowedResource, isOriginAllowed } from './runtime-config.js';
import { authenticateRequest } from './auth.js';

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024;
const TXN_TABLES = [
  'tanker_unloading', 'tanker_unloading_headers', 'tanker_unloading_lines',
  'daily_sales_entries', 'daily_sales_nozzle_readings', 'daily_sales_testing',
  'dip_readings', 'cash_deposits',
  'stock_movements', 'sales', 'credit_sales', 'finance_transactions',
  'price_history',
];

const REFERENCE_MAP = {
  products: [
    { table: 'tanks', column: 'product_name', label: 'tanks' },
    { table: 'nozzles', column: 'product_name', label: 'nozzles' },
    { table: 'price_history', column: 'product_name', label: 'price history records' },
    { table: 'tanker_unloading', column: 'product_name', label: 'tanker unloading records' },
    { table: 'stock_movements', column: 'product_name', label: 'stock movements' },
    { table: 'sales', column: 'product_name', label: 'sales records' },
    { table: 'credit_sales', column: 'product_name', label: 'credit sales' },
    { table: 'buffer_tanks', column: 'product_name', label: 'buffer tank records' },
    { table: 'tanker_unloading_lines', column: 'product_name', label: 'tanker unloading lines' },
    { table: 'daily_sales_nozzle_readings', column: 'product_name', label: 'daily sales nozzle readings' },
    { table: 'daily_sales_testing', column: 'product_name', label: 'daily sales testing records' },
  ],
  tanks: [
    { table: 'nozzles', column: 'tank_name', label: 'nozzles' },
    { table: 'tank_calibration', column: 'tank_id', isId: true, label: 'calibration charts' },
    { table: 'tanker_unloading', column: 'tank_name', label: 'tanker unloading records' },
    { table: 'tanker_unloading_lines', column: 'tank_name', label: 'tanker unloading lines' },
    { table: 'stock_movements', column: 'tank_name', label: 'stock movements' },
    { table: 'daily_sales_nozzle_readings', column: 'tank_name', label: 'daily sales nozzle readings' },
    { table: 'dip_readings', column: 'tank_name', label: 'dip readings' },
    { table: 'daily_sales_testing', column: 'tank_name', label: 'daily sales testing records' },
  ],
  dispensers: [
    { table: 'nozzles', column: 'dispenser_name', label: 'nozzles' },
    { table: 'daily_sales_entries', column: 'dispenser_name', label: 'daily sales entries' },
    { table: 'daily_sales_nozzle_readings', column: 'dispenser_name', label: 'daily sales nozzle readings' },
  ],
  nozzles: [
    { table: 'meters', column: 'nozzle_name', label: 'meters' },
    { table: 'sales', column: 'nozzle_name', label: 'sales records' },
    { table: 'daily_sales_nozzle_readings', column: 'nozzle_name', label: 'daily sales nozzle readings' },
    { table: 'daily_sales_testing', column: 'nozzle_name', label: 'daily sales testing records' },
  ],
  operators: [
    { table: 'sales', column: 'operator_name', label: 'sales records' },
    { table: 'daily_sales_entries', column: 'operator_name', label: 'daily sales entries' },
  ],
  shifts: [
    { table: 'sales', column: 'shift_name', label: 'sales records' },
    { table: 'daily_sales_entries', column: 'shift_name', label: 'daily sales entries' },
  ],
  suppliers: [
    { table: 'tanker_unloading', column: 'supplier_name', label: 'tanker unloading records' },
    { table: 'tanker_unloading_headers', column: 'supplier_name', label: 'tanker unloading headers' },
  ],
  bank_accounts: [
    { table: 'finance_transactions', column: 'bank_account', label: 'finance transactions' },
  ],
};

async function beforeDeleteCheck(dbTable, id, supabase) {
  const record = await safeSingle(
    supabase.from(dbTable).select('*').eq('id', id),
    'Record not found'
  );

  if (record.active === true || record.active === 1) {
    throw new Error('Cannot delete an active record. Set it to inactive first.');
  }
  if (record.status && ['Active', 'Operational'].includes(record.status)) {
    throw new Error(`Cannot delete a record with status "${record.status}". Change status first.`);
  }

  const refs = REFERENCE_MAP[dbTable];
  if (refs) {
    for (const ref of refs) {
      const refValue = ref.isId ? id : record[ref.column];
      if (refValue == null || refValue === '') continue;
      const { count, error: countErr } = await supabase
        .from(ref.table)
        .select('*', { count: 'exact', head: true })
        .eq(ref.column, refValue);
      if (countErr) throw countErr;
      if (count > 0) {
        throw new Error(`Cannot delete this ${dbTable.slice(0, -1)} because it is referenced by ${count} ${ref.label}. Remove those references first.`);
      }
    }
  }
}

const UNIQUE_FIELDS = {
  products: ['name', 'code'],
  tanks: ['name', 'code'],
  dispensers: ['name', 'code'],
  nozzles: ['name', 'code'],
  operators: ['name', 'emp_code'],
  shifts: ['name'],
  suppliers: ['name'],
  meters: ['serial_no'],
  bank_accounts: ['account_no'],
};

async function checkDuplicateFields(dbTable, body, supabase, excludeId) {
  const fields = UNIQUE_FIELDS[dbTable];
  if (!fields) return;
  for (const field of fields) {
    const value = body[field];
    if (value == null || String(value).trim() === '') continue;
    let query = supabase.from(dbTable).select('id').eq(field, String(value).trim());
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    if (data) throw new Error(`${dbTable.slice(0, -1)} with ${field} "${value}" already exists`);
  }
}

const FIELD_VALIDATIONS = {
  products: {
    current_price: (v) => v == null || v === '' || Number(v) >= 0 || 'Price must be 0 or greater',
  },
  tanks: {
    capacity: (v) => v != null && v !== '' && Number(v) > 0 || 'Capacity must be greater than 0',
    dead_stock: (v, body) => {
      if (v == null || v === '') return true;
      if (Number(v) < 0) return 'Dead stock must be 0 or greater';
      if (body.capacity != null && body.capacity !== '' && Number(v) >= Number(body.capacity)) return 'Dead stock must be less than capacity';
      return true;
    },
    current_volume: (v, body) => {
      if (v == null || v === '') return true;
      if (body.capacity != null && body.capacity !== '' && Number(v) > Number(body.capacity)) return 'Current volume must not exceed capacity';
      if (body.dead_stock != null && body.dead_stock !== '' && Number(v) < Number(body.dead_stock)) return 'Current volume must not be below dead stock level';
      return true;
    },
    diameter: (v) => v == null || v === '' || (Number(v) >= 50 && Number(v) <= 500) || 'Diameter must be between 50 and 500 cm',
  },
  operators: {
    phone: (v) => !v || /^\+?[\d\s-]{7,15}$/.test(String(v)) || 'Invalid phone number format (7-15 digits with optional +)',
  },
  suppliers: {
    phone: (v) => !v || /^\+?[\d\s-]{7,15}$/.test(String(v)) || 'Invalid phone number format',
    gst_no: (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d[A-Z\d]$/.test(String(v).toUpperCase()) || 'Invalid GST number format (e.g., 22AAAAA0000A1Z5)',
  },
  bank_accounts: {
    account_no: (v) => v == null || v === '' || String(v).length >= 6 || 'Account number must be at least 6 characters',
    ifsc: (v) => !v || /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(v)) || 'Invalid IFSC code format (e.g., SBIN0001234)',
  },
  meters: {
    opening_reading: (v) => v == null || v === '' || Number(v) >= 0 || 'Opening reading must be 0 or greater',
    current_reading: (v, body) => v == null || v === '' || body.opening_reading == null || body.opening_reading === '' || Number(v) >= Number(body.opening_reading) || 'Current reading must be >= opening reading',
  },
  credit_sales: {
    sale_date: (v) => v != null && String(v).trim() !== '' || 'Sale date is required',
    customer_name: (v) => v != null && String(v).trim() !== '' || 'Customer name is required',
    amount: (v) => v != null && v !== '' && Number(v) > 0 || 'Amount must be greater than 0',
  },
  finance_transactions: {
    txn_date: (v) => v != null && String(v).trim() !== '' || 'Transaction date is required',
    txn_type: (v) => !v || ['Expense', 'Deposit'].includes(v) || 'Invalid transaction type (use Expense or Deposit)',
    amount: (v) => v == null || v === '' || Number(v) >= 0 || 'Amount must be 0 or greater',
  },
};

function validateFields(dbTable, body, rows) {
  const validations = FIELD_VALIDATIONS[dbTable];
  if (!validations) return;
  const items = rows || [body];
  for (const item of items) {
    for (const [field, validator] of Object.entries(validations)) {
      const result = validator(item[field], item);
      if (result !== true && typeof result === 'string') {
        throw new Error(result);
      }
    }
  }
}

const CROSS_REFERENCE_TABLES = {
  tanks: [
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
  nozzles: [
    { field: 'dispenser_name', refTable: 'dispensers', refField: 'name', label: 'Dispenser' },
    { field: 'tank_name', refTable: 'tanks', refField: 'name', label: 'Tank' },
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
  credit_sales: [
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
  price_history: [
    { field: 'product_name', refTable: 'products', refField: 'name', label: 'Product' },
  ],
  cash_deposits: [
    { field: 'bank_account_id', refTable: 'bank_accounts', refField: 'id', label: 'Bank Account' },
  ],
  finance_transactions: [
    { field: 'bank_account', refTable: 'bank_accounts', refField: 'bank_name', label: 'Bank Account' },
  ],
};

async function checkCrossReferences(dbTable, body, rows, supabase) {
  const refs = CROSS_REFERENCE_TABLES[dbTable];
  if (!refs) return;
  const items = rows || [body];
  for (const ref of refs) {
    const values = [...new Set(items.map((item) => String(item[ref.field] ?? '').trim()).filter(Boolean))];
    if (values.length === 0) continue;
    const { data, error } = await supabase.from(ref.refTable).select(ref.refField).in(ref.refField, values);
    if (error) throw error;
    const found = new Set((data || []).map((r) => r[ref.refField]));
    for (const val of values) {
      if (!found.has(val)) throw new Error(`${ref.label} not found: ${val}`);
    }
  }
}

function parsePath(url) {
  const parts = new URL(url, 'http://localhost').pathname.replace('/api/', '').split('/').filter(Boolean);
  return parts;
}

function getFilters(url) {
  const params = new URL(url, 'http://localhost').searchParams;
  const filters = {};
  const pagination = {
    page: 1,
    pageSize: 20,
    search: '',
    hasPagination: false,
  };
  
  for (const [key, value] of params.entries()) {
    if (key === 'page') {
      pagination.page = Math.max(1, parseInt(value) || 1);
      pagination.hasPagination = true;
    } else if (key === 'pageSize') {
      pagination.pageSize = Math.max(1, Math.min(100, parseInt(value) || 20));
      pagination.hasPagination = true;
    } else if (key === 'search') {
      pagination.search = value;
    } else if (key && value !== '') {
      filters[key] = value;
    }
  }
  
  return { filters, pagination };
}

export default async function handler(req, res) {
  applyCorsHeaders(req, res);
  if (!isOriginAllowed(req.headers.origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const parts = parsePath(req.url);
  const resource = parts[0];

  try {
    if (req.method === 'POST' || req.method === 'PUT') {
      const rawSize = Number(req.headers['content-length'] || 0);
      if (rawSize > MAX_PAYLOAD_SIZE) {
        return res.status(413).json({ error: `Payload too large (${rawSize} bytes). Maximum is ${MAX_PAYLOAD_SIZE / 1024 / 1024}MB.` });
      }
    }
    if (resource && !isAllowedResource(resource)) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (parts[0] === 'tanks' && parts[2] === 'calibration' && parts[1]) {
      return await handleCalibration(req, res, parts[1]);
    }
    if (parts[0] === 'calibration' && parts[1] === 'import' && req.method === 'POST') {
      return await handleCalibrationImport(req, res);
    }
    if (parts[0] === 'tanker-unloading' && parts[1] === 'batches') {
      return await handleTankerUnloadingBatches(req, res);
    }
    if (parts[0] === 'tanker-unloading' && parts[1] === 'import' && req.method === 'POST') {
      return await handleTankerUnloadingImport(req, res);
    }
    if (parts[0] === 'tanker-unloading' && parts[1] === 'undo' && req.method === 'POST') {
      return await handleTankerUnloadingUndo(req, res);
    }
    if (parts[0] === 'daily-sales' && parts[1] === 'import' && req.method === 'POST') {
      return await handleDailySalesImport(req, res);
    }
    if (parts[0] === 'daily-sales' && parts[1] === 'undo' && req.method === 'POST') {
      return await handleDailySalesUndo(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'GET') {
      return await handleDailySalesList(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'POST') {
      return await handleDailySalesCreate(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'PUT') {
      return await handleDailySalesUpdate(req, res);
    }
    if (parts[0] === 'daily-sales' && req.method === 'DELETE') {
      return await handleDailySalesDelete(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'POST') {
      return await handleDipReadingCreate(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'PUT') {
      return await handleDipReadingUpdate(req, res);
    }
    if (parts[0] === 'dip-readings' && req.method === 'DELETE') {
      return await handleDipReadingDelete(req, res);
    }
    if (parts[0] === 'buffer-transfer' && req.method === 'POST') {
      return await handleBufferTransfer(req, res);
    }
    if (parts[0] === 'cash-deposits' && req.method === 'POST') {
      return await handleCashDepositCreate(req, res);
    }
    if (parts[0] === 'admin' && parts[1] === 'bootstrap-check') {
      return await handleAdminBootstrapCheck(req, res, auth);
    }
    if (parts[0] === 'admin' && parts[1] === 'bootstrap') {
      return await handleAdminBootstrap(req, res, auth);
    }
    if (parts[0] === 'admin' && parts[1] === 'users') {
      return await handleAdminUsers(req, res, auth);
    }
    if (parts[0] === 'sales' && req.method === 'POST') {
      return await handleSalesCreate(req, res);
    }
    if (parts[0] === 'sales' && req.method === 'PUT') {
      return await handleSalesUpdate(req, res);
    }
    if (parts[0] === 'stock-movements' && parts[1] === 'undo' && req.method === 'POST') {
      return await handleStockMovementUndo(req, res);
    }
    if (parts[0] === 'stock-movements' && req.method === 'POST') {
      return await handleStockMovementCreate(req, res);
    }
    if (parts[0] === 'stock-movements' && req.method === 'PUT') {
      return await handleStockMovementUpdate(req, res);
    }
    if (parts[0] === 'stock-movements' && req.method === 'DELETE') {
      return await handleStockMovementDelete(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'POST') {
      return await handleTankerUnloadingCreateV2(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'PUT') {
      return await handleTankerUnloadingUpdateV2(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'DELETE') {
      return await handleTankerUnloadingDeleteV2(req, res);
    }
    if (parts[0] === 'tanker-unloading' && req.method === 'GET') {
      return await handleTankerUnloadingListV2(req, res);
    }
    // ── Finance Management & Credit Sales endpoints ──
    if (parts[0] === 'credit-sales' && parts[1] === 'pending' && req.method === 'GET') {
      return await handleCreditSalesPending(req, res);
    }
    if (parts[0] === 'credit-sales' && parts[1] === 'settle' && req.method === 'POST') {
      return await handleCreditSalesSettle(req, res);
    }
    if (parts[0] === 'credit-sales' && parts[1] === 'report' && req.method === 'GET') {
      return await handleCreditSalesReport(req, res);
    }
    if (parts[0] === 'finance' && parts[1] === 'summary' && req.method === 'GET') {
      return await handleFinanceSummary(req, res);
    }
    if (parts[0] === 'finance' && parts[1] === 'ledger' && req.method === 'GET') {
      return await handleFinanceLedger(req, res);
    }
    if (parts[0] === 'finance' && parts[1] === 'bulk' && req.method === 'POST') {
      return await handleFinanceBulk(req, res);
    }

    const dbTable = resolveTable(parts[0]);
    if (!dbTable) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      const { filters, pagination } = getFilters(req.url);
      const { page, pageSize, search, hasPagination } = pagination;
      const orderCol = TXN_TABLES.includes(dbTable) ? 'id' : 'id';
      const orderDir = TXN_TABLES.includes(dbTable) ? { ascending: false } : { ascending: true };
      
      if (hasPagination) {
        let query = supabase.from(dbTable).select('*', { count: 'exact' });
        for (const [key, value] of Object.entries(filters)) {
          query = query.eq(key, value);
        }
        if (search) {
          const searchableFields = ['name', 'code', 'product_name', 'supplier_name', 'operator_name', 'shift_name', 'dispenser_name', 'tank_name', 'nozzle_name'];
          const searchConditions = searchableFields.map((f) => `${f}.ilike.%${search}%`).join(',');
          query = query.or(searchConditions);
        }
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.order(orderCol, orderDir).range(from, to);
        const { data, error, count } = await query;
        if (error) throw error;
        if (dbTable === 'tanks') {
          const reconciled = await Promise.all((data || []).map(async (tank) => {
            const vol = await reconcileTankCurrentVolume(tank.name);
            return { ...tank, current_volume: vol };
          }));
          return res.status(200).json({ data: reconciled, total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
        }
        if (dbTable === 'buffer_tanks') {
          const reconciled = await Promise.all((data || []).map(async (bt) => {
            const vol = await reconcileBufferVolume(bt.product_name);
            return { ...bt, volume: vol };
          }));
          return res.status(200).json({ data: reconciled, total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
        }
        return res.status(200).json({ data: data || [], total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
      }
      
      let query = supabase.from(dbTable).select('*');
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query.order(orderCol, orderDir);
      if (error) throw error;
      if (dbTable === 'tanks') {
        const reconciled = await Promise.all((data || []).map(async (tank) => {
          const vol = await reconcileTankCurrentVolume(tank.name);
          return { ...tank, current_volume: vol };
        }));
        return res.status(200).json(reconciled);
      }
      if (dbTable === 'buffer_tanks') {
        const reconciled = await Promise.all((data || []).map(async (bt) => {
          const vol = await reconcileBufferVolume(bt.product_name);
          return { ...bt, volume: vol };
        }));
        return res.status(200).json(reconciled);
      }
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      if (req.body == null) return res.status(400).json({ error: 'Request body is required' });
      const rows = Array.isArray(req.body) ? req.body : [req.body];
      const isBatch = rows.length > 1;
      if (isBatch) {
        // Phase 1: Pre-validate ALL rows first without writing anything
        const preValidated = [];
        const validationResults = [];
        let hasValidationErrors = false;
        
        for (const row of rows) {
          const csvRow = row._csvRow || 0;
          try {
            const rowClean = { ...row };
            delete rowClean._csvRow;
            const rowErrors = [];
            const validations = FIELD_VALIDATIONS[dbTable];
            if (validations) {
              for (const [field, validator] of Object.entries(validations)) {
                const result = validator(rowClean[field], rowClean);
                if (result !== true && typeof result === 'string') rowErrors.push(result);
              }
            }
            if (rowErrors.length > 0) {
              hasValidationErrors = true;
              validationResults.push({ _csvRow: csvRow, error: rowErrors.join('; ') });
              continue;
            }
            const refs = CROSS_REFERENCE_TABLES[dbTable];
            if (refs) {
              let refError = false;
              for (const ref of refs) {
                const val = String(rowClean[ref.field] ?? '').trim();
                if (!val) continue;
                const { data: refData, error: refErr } = await supabase.from(ref.refTable).select(ref.refField).eq(ref.refField, val).limit(1).maybeSingle();
                if (refErr) { refError = true; hasValidationErrors = true; validationResults.push({ _csvRow: csvRow, error: `Reference check failed: ${refErr.message}` }); break; }
                if (!refData) { refError = true; hasValidationErrors = true; validationResults.push({ _csvRow: csvRow, error: `${ref.label} not found: ${val}` }); break; }
              }
              if (refError) continue;
            }
            let normalizedRow = rowClean;
            if (dbTable === 'price_history') {
              normalizedRow = await normalizePriceHistoryRow(rowClean);
            }
            await checkDuplicateFields(dbTable, normalizedRow, supabase);
            // All validations passed for this row
            preValidated.push({ csvRow, normalizedRow });
            validationResults.push({ _csvRow: csvRow, status: 'prevalidated' });
          } catch (e) {
            hasValidationErrors = true;
            validationResults.push({ _csvRow: csvRow, error: String(e?.message || e) });
          }
        }
        
        // If any row failed validation, return all errors without writing anything
        if (hasValidationErrors) {
          const allResults = [];
          let idx = 0;
          for (const row of rows) {
            const csvRow = row._csvRow || 0;
            if (idx < validationResults.length && validationResults[idx]._csvRow === csvRow) {
              const res = validationResults[idx];
              if (res.error) {
                allResults.push(res);
              } else {
                allResults.push({ _csvRow: csvRow, error: 'Some rows in this batch failed validation — no data was saved' });
              }
              idx++;
            }
          }
          return res.status(400).json({ ok: 0, fail: rows.length, results: allResults, message: 'Validation failed. No data was saved.' });
        }

        // Phase 2: All rows are valid — now insert them all, with rollback if needed
        let ok = 0, fail = 0;
        const finalResults = [];
        const insertedRecords = []; // To track what we need to rollback on failure

        try {
          for (const { csvRow, normalizedRow } of preValidated) {
            const { data, error: insErr } = await supabase.from(dbTable).insert(normalizedRow).select().single();
            if (insErr) throw new Error(insErr.message);
            insertedRecords.push({ id: data.id, productName: data?.product_name }); // For price history sync and rollback
            ok++;
            finalResults.push({ _csvRow: csvRow, ...(data || {}) });
          }

          // All inserts succeeded — now perform any side effects (like syncing prices)
          if (dbTable === 'price_history') {
            // Batch pre-validation couldn't see other rows in same batch, so all old_prices
            // would be 0 or stale. Recalculate the full price chain per product.
            const affectedProducts = [...new Set(preValidated.map(r => r.normalizedRow.product_name).filter(Boolean))];
            for (const productName of affectedProducts) {
              await recalcPriceHistoryChain(productName);
              await syncProductCurrentPrice(productName);
            }
          } else {
            for (const rec of insertedRecords) {
              if (rec.productName) {
                await syncProductCurrentPrice(rec.productName);
              }
            }
          }
        } catch (writeErr) {
          // Rollback: delete all inserted records
          for (const rec of insertedRecords) {
            try {
              await supabase.from(dbTable).delete().eq('id', rec.id);
            } catch (_) { /* best-effort cleanup */ }
          }
          // Return error for all rows
          const rollbackMsg = `Rolled back: ${writeErr.message}`;
          for (const row of rows) {
            finalResults.push({ _csvRow: row._csvRow || 0, error: rollbackMsg });
          }
          ok = 0;
          fail = rows.length;
          return res.status(400).json({ ok, fail, results: finalResults, message: 'Write failed. All data for this batch rolled back.' });
        }

        // All done successfully!
        const status = ok === 0 && finalResults.length > 0 ? 400 : 201;
        return res.status(status).json({ ok, fail, results: finalResults });
      } else {
        const singleRow = rows[0] || {};
        const csvRow = singleRow._csvRow || 0;
        const rowClean = { ...singleRow };
        delete rowClean._csvRow;
        validateFields(dbTable, rowClean, [rowClean]);
        await checkCrossReferences(dbTable, rowClean, [rowClean], supabase);
        let normalizedRow = rowClean;
        if (dbTable === 'price_history') {
          normalizedRow = await normalizePriceHistoryRow(rowClean);
        }
        await checkDuplicateFields(dbTable, normalizedRow, supabase);
        const { data, error } = await supabase.from(dbTable).insert(normalizedRow).select().single();
        if (error) throw error;
        if (dbTable === 'price_history' && data) {
          const productName = data?.product_name;
          if (productName) await recalcPriceHistoryChain(productName);
          await syncProductCurrentPrice(productName);
        }
        return res.status(201).json({ ...data, _csvRow: csvRow });
      }
    }
    if (req.method === 'PUT') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID is required' });
      let { id: _id, ...rest } = req.body;
      validateFields(dbTable, rest);
      await checkCrossReferences(dbTable, rest, null, supabase);
      if (dbTable === 'price_history') {
        rest = await normalizePriceHistoryRow(rest, id);
      }
      await checkDuplicateFields(dbTable, rest, supabase, id);
      const { data: beforeUpdate } = dbTable === 'price_history'
        ? await supabase.from(dbTable).select('product_name').eq('id', id).maybeSingle()
        : { data: null };
      const { data, error } = await supabase.from(dbTable).update(rest).eq('id', id).select().single();
      if (error) throw error;
      if (dbTable === 'price_history') {
        const affectedProduct = beforeUpdate?.product_name || data?.product_name;
        if (affectedProduct) await recalcPriceHistoryChain(affectedProduct);
        await syncProductCurrentPrice(beforeUpdate?.product_name);
        await syncProductCurrentPrice(data?.product_name);
      }
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'ID is required' });
      const { data: beforeDelete } = dbTable === 'price_history'
        ? await supabase.from(dbTable).select('product_name').eq('id', id).maybeSingle()
        : { data: null };
      await beforeDeleteCheck(dbTable, id, supabase);
      const { error } = await supabase.from(dbTable).delete().eq('id', id);
      if (error) throw error;
      if (dbTable === 'price_history') {
        const productName = beforeDelete?.product_name;
        if (productName) await recalcPriceHistoryChain(productName);
        await syncProductCurrentPrice(productName);
      }
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    const message = err?.message || err?.error || 'Internal server error';
    const status = err?.statusCode || 500;
    const detail = err?.detail || null;
    const hint = err?.hint || null;
    res.status(status).json({
      error: message,
      ...(detail ? { detail } : {}),
      ...(hint ? { hint } : {}),
    });
  }
}

async function handleCalibration(req, res, tankId) {
  const tid = Number(tankId);
  if (isNaN(tid)) return res.status(400).json({ error: 'Invalid tank ID' });

  const tank = await safeSingle(
    supabase.from('tanks').select('id, capacity').eq('id', tid),
    'Tank not found'
  );

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('tank_calibration')
      .select('id, dip_mm, volume_liters')
      .eq('tank_id', tid)
      .order('dip_mm', { ascending: true });
    if (error) throw error;
    return res.status(200).json({ tank_id: tid, points: data || [], count: data?.length || 0 });
  }

  if (req.method === 'PUT') {
    const { points } = req.body || {};
    const validation = validateChart(points, tank.capacity);
    if (!validation.valid) return res.status(400).json({ error: validation.errors.join('; ') });

    const { data: existingRows, error: existingErr } = await supabase
      .from('tank_calibration')
      .select('tank_id, dip_mm, volume_liters')
      .eq('tank_id', tid)
      .order('dip_mm', { ascending: true });
    if (existingErr) throw existingErr;

    const { error: delErr } = await supabase.from('tank_calibration').delete().eq('tank_id', tid);
    if (delErr) throw delErr;

    const rows = points.map((p) => ({ tank_id: tid, dip_mm: Number(p.dip_mm), volume_liters: Number(p.volume_liters) }));
    const { data, error: insErr } = await supabase.from('tank_calibration').insert(rows).select();
    if (insErr) {
      const restoreRows = (existingRows || []).map((row) => ({
        tank_id: row.tank_id,
        dip_mm: Number(row.dip_mm),
        volume_liters: Number(row.volume_liters),
      }));
      const restoreResult = restoreRows.length
        ? await supabase.from('tank_calibration').insert(restoreRows)
        : { error: null };
      if (restoreResult.error) {
        throw new Error(`Calibration replace failed and restore also failed: ${insErr.message}; restore: ${restoreResult.error.message}`);
      }
      throw new Error(`Calibration replace failed. Previous chart was restored. ${insErr.message}`);
    }
    return res.status(200).json({ tank_id: tid, points: data, count: data.length, updated_at: new Date().toISOString() });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('tank_calibration').delete().eq('tank_id', tid);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function handleAdminBootstrapCheck(req, res, auth) {
  // No auth guard — returns status info for debugging
  try {
    const { data: allUsers, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const adminCount = (allUsers?.users || []).filter(
      (u) => u.user_metadata?.role === 'admin'
    ).length;
    return res.status(200).json({
      your_role: auth.user?.user_metadata?.role || 'data_entry',
      your_id: auth.user?.id,
      your_email: auth.user?.email,
      admin_count: adminCount,
      total_users: (allUsers?.users || []).length,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Check failed' });
  }
}

async function handleAdminBootstrap(req, res, auth) {
  // POST only — no auth required, this is for first-user setup
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { data: allUsers, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;
    const hasAdmin = (allUsers?.users || []).some(
      (u) => u.user_metadata?.role === 'admin'
    );
    if (hasAdmin) {
      return res.status(200).json({ promoted: false, role: auth.user?.user_metadata?.role || 'data_entry' });
    }
    // No admin exists — promote this user
    const { data, error } = await supabase.auth.admin.updateUserById(auth.user.id, {
      user_metadata: { ...(auth.user?.user_metadata || {}), role: 'admin' },
    });
    if (error) throw error;
    return res.status(200).json({ promoted: true, role: 'admin' });
  } catch (err) {
    console.error('Bootstrap error:', err);
    return res.status(400).json({ error: err?.message || 'Bootstrap failed' });
  }
}

async function handleAdminUsers(req, res, auth) {
  // Only admins can manage users
  const role = auth.user?.user_metadata?.role || 'data_entry';
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Only administrators can manage users' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.auth.admin.listUsers();
      if (error) throw error;
      const safeUsers = (data?.users || []).map((u) => ({
        id: u.id,
        email: u.email,
        role: u.user_metadata?.role || 'data_entry',
        display_name: u.user_metadata?.display_name || '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
      }));
      return res.status(200).json(safeUsers);
    }

    if (req.method === 'POST') {
      const { email, password, role: userRole, display_name } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (!password) return res.status(400).json({ error: 'Password is required' });
      const validRoles = ['admin', 'data_entry'];
      const assignRole = validRoles.includes(userRole) ? userRole : 'data_entry';
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: assignRole, display_name: display_name || '' },
      });
      if (error) throw error;
      return res.status(201).json({
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'data_entry',
        display_name: data.user.user_metadata?.display_name || '',
      });
    }

    if (req.method === 'PUT') {
      const { id, role: newRole, display_name } = req.body || {};
      if (!id) return res.status(400).json({ error: 'User ID is required' });
      if (!newRole) return res.status(400).json({ error: 'Role is required' });
      const validRoles = ['admin', 'data_entry'];
      if (!validRoles.includes(newRole)) {
        return res.status(400).json({ error: 'Role must be admin or data_entry' });
      }
      // Build metadata update — preserve any existing fields
      const { data: existingUser, error: fetchErr } = await supabase.auth.admin.getUserById(id);
      if (fetchErr) throw fetchErr;
      const existingMeta = existingUser?.user?.user_metadata || {};
      const { data, error } = await supabase.auth.admin.updateUserById(id, {
        user_metadata: { ...existingMeta, role: newRole, ...(display_name ? { display_name } : {}) },
      });
      if (error) throw error;
      return res.status(200).json({
        id: data.user.id,
        email: data.user.email,
        role: data.user.user_metadata?.role || 'data_entry',
        display_name: data.user.user_metadata?.display_name || '',
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'User ID is required' });
      if (id === auth.user.id) {
        return res.status(400).json({ error: 'You cannot delete your own account' });
      }
      const { error } = await supabase.auth.admin.deleteUser(id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin users error:', err);
    const message = err?.message || err?.error || 'Internal server error';
    return res.status(400).json({ error: message });
  }
}

async function handleSalesCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const normalizedRows = await normalizeSalesRows(rows, supabase);
  const { data, error } = await supabase.from('sales').insert(normalizedRows).select();
  if (error) throw error;
  return res.status(201).json(data);
}

async function handleSalesUpdate(req, res) {
  const { id, ...rest } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const [normalized] = await normalizeSalesRows([rest], supabase);
  const { data, error } = await supabase.from('sales').update(normalized).eq('id', id).select().single();
  if (error) throw error;
  return res.status(200).json(data);
}

async function handleStockMovementCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const isBatch = rows.length > 1;
  if (!isBatch) {
    const row = rows[0] || {};
    const csvRow = row._csvRow || 0;
    const cleanRow = { ...row };
    delete cleanRow._csvRow;
    const [normalized] = await normalizeStockMovementRows([cleanRow], supabase);
    const { data, error } = await supabase.from('stock_movements').insert(normalized).select();
    if (error) throw error;
    if (data?.[0]) {
      const signedVolume = String(data[0].movement_type || '').toUpperCase() === 'IN' ? Number(data[0].volume || 0) : -Number(data[0].volume || 0);
      await adjustTankCurrentVolumeForSalesDelta(data[0].tank_name, data[0].movement_date, signedVolume);
    }
    return res.status(201).json(data);
  }

  // Pre-validate all rows before any writes
  const normalizedRows = [];
  const validationResults = [];
  let hasErrors = false;
  for (const row of rows) {
    const csvRow = row._csvRow || 0;
    const cleanRow = { ...row };
    delete cleanRow._csvRow;
    try {
      const [normalized] = await normalizeStockMovementRows([cleanRow], supabase);
      normalizedRows.push({ csvRow, normalized });
    } catch (e) {
      hasErrors = true;
      validationResults.push({ _csvRow: csvRow, error: String(e?.message || e) });
    }
  }

  if (hasErrors) {
    // Tag passing rows with a rejection message
    const allResults = [];
    let idx = 0;
    for (const row of rows) {
      const csvRow = row._csvRow || 0;
      if (idx < normalizedRows.length && normalizedRows[idx].csvRow === csvRow) {
        allResults.push({ _csvRow: csvRow, error: 'Some rows in this batch failed validation — no data was saved' });
        idx++;
      } else {
        allResults.push(validationResults.shift());
      }
    }
    return res.status(400).json({ ok: 0, fail: rows.length, results: allResults, message: 'Validation failed. No data was saved.' });
  }

  // All valid — write everything
  let ok = 0, fail = 0;
  const finalResults = [];
  const createdMovements = [];
  try {
    for (const { csvRow, normalized } of normalizedRows) {
      const { data, error: insErr } = await supabase.from('stock_movements').insert(normalized).select();
      if (insErr) throw new Error(insErr.message);
      if (data?.[0]) {
        const signedVolume = String(data[0].movement_type || '').toUpperCase() === 'IN' ? Number(data[0].volume || 0) : -Number(data[0].volume || 0);
        await adjustTankCurrentVolumeForSalesDelta(data[0].tank_name, data[0].movement_date, signedVolume);
      }
      createdMovements.push({ csvRow, data: data?.[0] || {} });
      ok++;
      finalResults.push({ _csvRow: csvRow, entry_id: (data?.[0] || {}).id, ...(data?.[0] || {}) });
    }
  } catch (writeErr) {
    // Roll back all created movements
    for (const m of createdMovements) {
      try {
        const signedVolume = String(m.data.movement_type || '').toUpperCase() === 'IN' ? -Number(m.data.volume || 0) : Number(m.data.volume || 0);
        await adjustTankCurrentVolumeForSalesDelta(m.data.tank_name, m.data.movement_date, signedVolume);
        await supabase.from('stock_movements').delete().eq('id', m.data.id);
      } catch (_) { /* best-effort */ }
    }
    finalResults.length = 0;
    for (const { csvRow } of normalizedRows) {
      finalResults.push({ _csvRow: csvRow, error: `Rolled back: ${writeErr.message}` });
    }
    return res.status(400).json({ ok: 0, fail: rows.length, results: finalResults, message: 'Write failed. All data for this chunk rolled back.' });
  }

  return res.status(201).json({ ok, fail, results: finalResults });
}

async function handleStockMovementUndo(req, res) {
  const { entry_ids } = req.body || {};
  const ids = Array.isArray(entry_ids) ? entry_ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'entry_ids array is required' });
  let ok = 0, fail = 0;
  const results = [];
  for (const id of ids) {
    try {
      const { data: existing, error: existErr } = await supabase.from('stock_movements').select('*').eq('id', Number(id)).single();
      if (existErr) throw new Error(`Stock movement ${id} not found`);
      const signedVolume = String(existing.movement_type || '').toUpperCase() === 'IN'
        ? -Number(existing.volume || 0)
        : Number(existing.volume || 0);
      await adjustTankCurrentVolumeForSalesDelta(existing.tank_name, existing.movement_date, signedVolume);
      const { error: delErr } = await supabase.from('stock_movements').delete().eq('id', existing.id);
      if (delErr) throw delErr;
      ok++;
      results.push({ entry_id: Number(id), status: 'deleted' });
    } catch (e) {
      fail++;
      results.push({ entry_id: Number(id), error: String(e?.message || e) });
    }
  }
  return res.status(ok === 0 ? 400 : 200).json({ ok, fail, results });
}

async function handleStockMovementUpdate(req, res) {
  const { id, ...rest } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const existing = await safeSingle(
    supabase.from('stock_movements').select('*').eq('id', id),
    'Stock movement not found'
  );
  const [normalized] = await normalizeStockMovementRows([rest], supabase);
  const { data, error } = await supabase.from('stock_movements').update(normalized).eq('id', id).select().single();
  if (error) throw error;
  const oldSignedVolume = String(existing.movement_type || '').toUpperCase() === 'IN' ? Number(existing.volume || 0) : -Number(existing.volume || 0);
  const newSignedVolume = String(data.movement_type || '').toUpperCase() === 'IN' ? Number(data.volume || 0) : -Number(data.volume || 0);
  if (existing.tank_name === data.tank_name && String(existing.movement_date || '') === String(data.movement_date || '')) {
    await adjustTankCurrentVolumeForSalesDelta(data.tank_name, data.movement_date, newSignedVolume - oldSignedVolume);
  } else {
    await adjustTankCurrentVolumeForSalesDelta(existing.tank_name, existing.movement_date, -oldSignedVolume);
    await adjustTankCurrentVolumeForSalesDelta(data.tank_name, data.movement_date, newSignedVolume);
  }
  return res.status(200).json(data);
}

async function handleStockMovementDelete(req, res) {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'ID is required' });
  const { data: existing, error: existingErr } = await supabase.from('stock_movements').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;
  const { error } = await supabase.from('stock_movements').delete().eq('id', id);
  if (error) throw error;
  const signedVolume = String(existing.movement_type || '').toUpperCase() === 'IN' ? Number(existing.volume || 0) : -Number(existing.volume || 0);
  await adjustTankCurrentVolumeForSalesDelta(existing.tank_name, existing.movement_date, -signedVolume);
  return res.status(200).json({ ok: true });
}

async function handleTankerUnloadingListV2(req, res) {
  const { filters, pagination } = getFilters(req.url);
  const { page, pageSize, search, hasPagination } = pagination;

  const selectFields = 'id, header_id, product_name, tank_name, tanker_qty, dip_before_mm, dip_after_mm, volume_before_liters, volume_after_liters, received_volume, variance, created_at, tanker_unloading_headers ( id, unload_date, tanker_number, supplier_name, waybill_no, invoice_no, temperature )';
  
  let query = hasPagination
    ? supabase.from('tanker_unloading_lines').select(selectFields, { count: 'exact' }).order('id', { ascending: false })
    : supabase.from('tanker_unloading_lines').select(selectFields).order('id', { ascending: false });

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'unload_date_from') {
      query = query.gte('tanker_unloading_headers.unload_date', value);
    } else if (key === 'unload_date_to') {
      query = query.lte('tanker_unloading_headers.unload_date', value);
    } else if (key === 'tanker_number' || key === 'supplier_name' || key === 'product_name' || key === 'tank_name') {
      query = query.eq(key, value);
    }
  }

  if (search) {
    query = query.or(`product_name.ilike.%${search}%,tank_name.ilike.%${search}%,tanker_unloading_headers.tanker_number.ilike.%${search}%,tanker_unloading_headers.supplier_name.ilike.%${search}%`);
  }

  if (hasPagination) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) throw error;
    const lines = (data || []).map((l) => ({
      id: l.id,
      header_id: l.header_id,
      unload_date: l.tanker_unloading_headers?.unload_date,
      tanker_number: l.tanker_unloading_headers?.tanker_number,
      supplier_name: l.tanker_unloading_headers?.supplier_name,
      waybill_no: l.tanker_unloading_headers?.waybill_no,
      invoice_no: l.tanker_unloading_headers?.invoice_no,
      temperature: l.tanker_unloading_headers?.temperature,
      product_name: l.product_name,
      tank_name: l.tank_name,
      declared_volume: l.tanker_qty,
      tanker_qty: l.tanker_qty,
      dip_before_mm: l.dip_before_mm,
      dip_after_mm: l.dip_after_mm,
      volume_before_liters: l.volume_before_liters,
      volume_after_liters: l.volume_after_liters,
      received_volume: l.received_volume,
      variance: l.variance,
      created_at: l.created_at,
    }));
    return res.status(200).json({ data: lines, total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
  }

  const { data, error } = await query;
  if (error) throw error;
  const lines = (data || []).map((l) => ({
    id: l.id,
    header_id: l.header_id,
    unload_date: l.tanker_unloading_headers?.unload_date,
    tanker_number: l.tanker_unloading_headers?.tanker_number,
    supplier_name: l.tanker_unloading_headers?.supplier_name,
    waybill_no: l.tanker_unloading_headers?.waybill_no,
    invoice_no: l.tanker_unloading_headers?.invoice_no,
    temperature: l.tanker_unloading_headers?.temperature,
    product_name: l.product_name,
    tank_name: l.tank_name,
    declared_volume: l.tanker_qty,
    tanker_qty: l.tanker_qty,
    dip_before_mm: l.dip_before_mm,
    dip_after_mm: l.dip_after_mm,
    volume_before_liters: l.volume_before_liters,
    volume_after_liters: l.volume_after_liters,
    received_volume: l.received_volume,
    variance: l.variance,
    created_at: l.created_at,
  }));
  return res.status(200).json(lines);
}

async function handleTankerUnloadingBatches(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { filters, pagination } = getFilters(req.url);
  const { page, pageSize, search, hasPagination } = pagination;

  const selectFields = 'id, unload_date, tanker_number, supplier_name, waybill_no, invoice_no, temperature, created_at, tanker_unloading_lines ( id, product_name, tank_name, tanker_qty, dip_before_mm, dip_after_mm, volume_before_liters, volume_after_liters, received_volume, variance, created_at )';
  
  let query = hasPagination
    ? supabase.from('tanker_unloading_headers').select(selectFields, { count: 'exact' }).order('id', { ascending: false })
    : supabase.from('tanker_unloading_headers').select(selectFields).order('id', { ascending: false });

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'unload_date_from') {
      query = query.gte('unload_date', value);
    } else if (key === 'unload_date_to') {
      query = query.lte('unload_date', value);
    } else {
      query = query.eq(key, value);
    }
  }

  if (search) {
    query = query.or(`unload_date.ilike.%${search}%,tanker_number.ilike.%${search}%,supplier_name.ilike.%${search}%,waybill_no.ilike.%${search}%`);
  }

  if (hasPagination) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) throw error;
    const batches = (data || []).map((h) => {
      const lines = Array.isArray(h.tanker_unloading_lines) ? h.tanker_unloading_lines : [];
      const totalTankerQty = lines.reduce((s, l) => s + Number(l.tanker_qty || 0), 0);
      const totalReceived = lines.reduce((s, l) => s + Number(l.received_volume || 0), 0);
      return { ...h, totals: { tanker_qty: totalTankerQty, received_volume: totalReceived, variance: totalReceived - totalTankerQty } };
    });
    return res.status(200).json({ data: batches, total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
  }

  const { data, error } = await query;
  if (error) throw error;
  const batches = (data || []).map((h) => {
    const lines = Array.isArray(h.tanker_unloading_lines) ? h.tanker_unloading_lines : [];
    const totalTankerQty = lines.reduce((s, l) => s + Number(l.tanker_qty || 0), 0);
    const totalReceived = lines.reduce((s, l) => s + Number(l.received_volume || 0), 0);
    return { ...h, totals: { tanker_qty: totalTankerQty, received_volume: totalReceived, variance: totalReceived - totalTankerQty } };
  });
  return res.status(200).json(batches);
}

function createError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function safeSingle(query, notFoundMessage) {
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw createError(404, notFoundMessage || 'Record not found');
  return data;
}

function requireText(value, label) {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${label} is required`);
  return v;
}

function optionalText(value) {
  const v = String(value ?? '').trim();
  return v || null;
}

function requireNonNegativeNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be 0 or greater`);
  return n;
}

function optionalNumber(value, label) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number`);
  return n;
}

async function resolvePriceBeforeOrOnDate(productName, effectiveDate, excludeId = null) {
  let query = supabase
    .from('price_history')
    .select('id, new_price')
    .eq('product_name', productName)
    .lte('effective_date', effectiveDate)
    .order('effective_date', { ascending: false })
    .order('id', { ascending: false });
  if (excludeId) query = query.neq('id', excludeId);
  const { data: priceRow, error: priceErr } = await query.limit(1).maybeSingle();
  if (priceErr) throw priceErr;
  if (priceRow) return Number(priceRow.new_price || 0);

  return 0;
}

async function normalizePriceHistoryRow(row, excludeId = null) {
  const productName = requireText(row?.product_name, 'Product');
  const effectiveDate = requireText(row?.effective_date, 'Effective date');
  const newPrice = requireNonNegativeNumber(row?.new_price, 'New price');
  const oldPrice = await resolvePriceBeforeOrOnDate(productName, effectiveDate, excludeId);
  return {
    product_name: productName,
    old_price: oldPrice,
    new_price: newPrice,
    effective_date: effectiveDate,
    changed_by: optionalText(row?.changed_by),
    remarks: optionalText(row?.remarks),
  };
}

async function syncProductCurrentPrice(productName) {
  if (!productName) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data: latestActivePrice, error: latestErr } = await supabase
    .from('price_history')
    .select('new_price')
    .eq('product_name', productName)
    .lte('effective_date', today)
    .order('effective_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) throw latestErr;
  // Always update: set to latest price or 0 if no entries remain (fixes stale current_price)
  const { error: updErr } = await supabase.from('products').update({ current_price: Number(latestActivePrice?.new_price || 0) }).eq('name', productName);
  if (updErr) throw updErr;
}

// Recalculate old_price chain for a product's price history so each entry's old_price
// equals the previous entry's new_price (by chronological order).
// Fixes bug where batch-imported rows all got old_price = 0.
async function recalcPriceHistoryChain(productName) {
  const { data: entries, error: entriesErr } = await supabase
    .from('price_history')
    .select('id, old_price, new_price, effective_date')
    .eq('product_name', productName)
    .order('effective_date', { ascending: true })
    .order('id', { ascending: true });
  if (entriesErr) throw entriesErr;

  let prevNewPrice = 0; // first chronological entry has no prior price
  for (const entry of entries || []) {
    const correctOld = prevNewPrice;
    const currentOld = Number(entry.old_price || 0);
    if (Math.abs(currentOld - correctOld) > 0.001) {
      const { error: updErr } = await supabase
        .from('price_history')
        .update({ old_price: correctOld })
        .eq('id', entry.id);
      if (updErr) throw updErr;
    }
    prevNewPrice = Number(entry.new_price || 0);
  }
}

async function loadEffectivePriceMap(productNames, targetDate) {
  const uniqueNames = [...new Set((productNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
  const priceMap = new Map();
  if (uniqueNames.length === 0) return priceMap;

  const { data: historyRows, error: historyErr } = await supabase
    .from('price_history')
    .select('id, product_name, old_price, new_price, effective_date')
    .in('product_name', uniqueNames)
    .order('product_name', { ascending: true })
    .order('effective_date', { ascending: true })
    .order('id', { ascending: true });
  if (historyErr) throw historyErr;

  const historyByProduct = new Map();
  for (const row of historyRows || []) {
    const productName = String(row.product_name || '').trim();
    if (!productName) continue;
    if (!historyByProduct.has(productName)) historyByProduct.set(productName, []);
    historyByProduct.get(productName).push(row);
  }

  for (const productName of uniqueNames) {
    const history = historyByProduct.get(productName) || [];
    if (history.length === 0) {
      throw new Error(`No price history found for product "${productName}". Please set a price first before entering sales.`);
    }

    // Normalize both dates to YYYY-MM-DD for reliable comparison
    const target = String(targetDate || '').slice(0, 10);

    // Walk through history to find the last applicable price
    let resolvedPrice = null;
    for (const row of history) {
      const rawDate = row.effective_date;
      const effDate = rawDate instanceof Date
        ? rawDate.toISOString().slice(0, 10)
        : String(rawDate || '').slice(0, 10);
      if (effDate > target) break;
      resolvedPrice = Number(row.new_price);
    }

    // If all effective_dates are after the target date, fall back to the first record's new_price
    // (old_price would be 0 after recalcPriceHistoryChain, which is never the intended price)
    if (resolvedPrice == null) {
      const firstRow = history[0];
      resolvedPrice = firstRow.new_price != null ? Number(firstRow.new_price) : null;
    }

    if (resolvedPrice == null || !Number.isFinite(resolvedPrice)) {
      throw new Error(`No valid price found for product "${productName}" on or before ${targetDate}. Please update the price first before entering sales.`);
    }

    priceMap.set(productName, resolvedPrice);
  }

  return priceMap;
}

function interpolateVolume(points, dipMM) {
  const d = Number(dipMM);
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(d)) return null;
  const sorted = [...points]
    .map((p) => ({ dip_mm: Number(p.dip_mm), volume_liters: Number(p.volume_liters) }))
    .filter((p) => Number.isFinite(p.dip_mm) && Number.isFinite(p.volume_liters))
    .sort((a, b) => a.dip_mm - b.dip_mm);
  if (sorted.length < 2) return null;
  if (d <= sorted[0].dip_mm) return sorted[0].volume_liters;
  if (d >= sorted[sorted.length - 1].dip_mm) return sorted[sorted.length - 1].volume_liters;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (d >= a.dip_mm && d <= b.dip_mm) {
      const frac = (d - a.dip_mm) / (b.dip_mm - a.dip_mm || 1);
      return a.volume_liters + frac * (b.volume_liters - a.volume_liters);
    }
  }
  return null;
}

async function loadCalibrationPointsByTankName(tankName) {
  const tank = await safeSingle(
    supabase.from('tanks').select('id, name, product_name').eq('name', tankName),
    `Tank not found: ${tankName}`
  );
  const { data: points, error } = await supabase.from('tank_calibration').select('dip_mm, volume_liters').eq('tank_id', tank.id).order('dip_mm', { ascending: true });
  if (error) throw error;
  return { tank, points: points || [] };
}

async function normalizeTankerUnloadingCompartments(compartments) {
  const list = Array.isArray(compartments) ? compartments : [];
  if (list.length === 0) throw new Error('At least one compartment is required');
  const allProductNames = [...new Set(list.map((c) => String(c?.product_name ?? '').trim()).filter(Boolean))];
  const productMap = new Map();
  if (allProductNames.length > 0) {
    const { data: products, error: prodErr } = await supabase.from('products').select('name').in('name', allProductNames);
    if (prodErr) throw prodErr;
    for (const p of products || []) productMap.set(p.name, true);
  }
  const normalizedLines = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i] || {};
    const label = `Compartment ${i + 1}: `;
    const productName = requireText(c.product_name, `${label}Product`);
    const tankName = requireText(c.tank_name, `${label}Tank`);
    const tankerQty = requireNonNegativeNumber(c.tanker_qty, `${label}Tanker qty`);
    const dipBefore = requireNonNegativeNumber(c.dip_before_mm, `${label}Dip before (mm)`);
    const dipAfter = requireNonNegativeNumber(c.dip_after_mm, `${label}Dip after (mm)`);
    if (!productMap.has(productName)) {
      throw new Error(`${label}Product not found: ${productName}`);
    }
    const { tank, points } = await loadCalibrationPointsByTankName(tankName);
    if (tank.product_name && tank.product_name !== productName) {
      throw new Error(`${label}Selected tank does not match the chosen product`);
    }
    const volBefore = interpolateVolume(points, dipBefore);
    const volAfter = interpolateVolume(points, dipAfter);
    if (volBefore == null || volAfter == null) {
      throw new Error(`${label}No calibration data available to compute volume for the selected tank`);
    }
    const received = Number(volAfter) - Number(volBefore);
    const variance = received - tankerQty;
    normalizedLines.push({
      product_name: productName,
      tank_name: tankName,
      tanker_qty: tankerQty,
      dip_before_mm: dipBefore,
      dip_after_mm: dipAfter,
      volume_before_liters: volBefore,
      volume_after_liters: volAfter,
      received_volume: received,
      variance,
    });
  }
  return normalizedLines;
}

async function handleTankerUnloadingCreateV2(req, res) {
  const body = req.body || {};
  const unloadDate = requireText(body.unload_date, 'Unload date');
  const tankerNumber = requireText(body.tanker_number, 'Tanker number');
  const supplierName = optionalText(body.supplier_name);
  const waybillNo = optionalText(body.waybill_no);
  const invoiceNo = optionalText(body.invoice_no);
  const temperature = optionalNumber(body.temperature, 'Temperature');
  const normalizedLines = await normalizeTankerUnloadingCompartments(body.compartments);

  const { data: header, error: headerErr } = await supabase
    .from('tanker_unloading_headers')
    .insert([{ unload_date: unloadDate, tanker_number: tankerNumber, supplier_name: supplierName, waybill_no: waybillNo, invoice_no: invoiceNo, temperature }])
    .select()
    .single();
  if (headerErr) throw headerErr;

  const linesToInsert = normalizedLines.map((l) => ({ header_id: header.id, ...l }));
  const { data: insertedLines, error: linesErr } = await supabase.from('tanker_unloading_lines').insert(linesToInsert).select();
  if (linesErr) {
    await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);
    throw linesErr;
  }

  try {
    const tankUpdates = await Promise.all(normalizedLines.map(async (line) => {
      const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', line.tank_name).single();
      if (tErr) throw tErr;
      const nextVol = Number(tankRow.current_volume || 0) + Number(line.received_volume || 0);
      return supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tankRow.id);
    }));
    await Promise.all(tankUpdates);
  } catch (volErr) {
    await supabase.from('tanker_unloading_lines').delete().eq('header_id', header.id);
    await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);
    throw new Error(`Tank volume update failed, unloading entry rolled back: ${volErr.message}`);
  }

  return res.status(201).json({ header, lines: insertedLines || [] });
}

async function handleTankerUnloadingUpdateV2(req, res) {
  const body = req.body || {};
  const headerId = Number(body.id);
  if (!headerId) return res.status(400).json({ error: 'Unloading ID is required' });

  const { data: existingHeader, error: existingHeaderErr } = await supabase
    .from('tanker_unloading_headers')
    .select('id, unload_date, tanker_number, supplier_name, waybill_no, invoice_no, temperature, tanker_unloading_lines ( id, product_name, tank_name, tanker_qty, dip_before_mm, dip_after_mm, volume_before_liters, volume_after_liters, received_volume, variance )')
    .eq('id', headerId)
    .single();
  if (existingHeaderErr) throw existingHeaderErr;

  const unloadDate = requireText(body.unload_date, 'Unload date');
  const tankerNumber = requireText(body.tanker_number, 'Tanker number');
  const supplierName = optionalText(body.supplier_name);
  const waybillNo = optionalText(body.waybill_no);
  const invoiceNo = optionalText(body.invoice_no);
  const temperature = optionalNumber(body.temperature, 'Temperature');
  const normalizedLines = await normalizeTankerUnloadingCompartments(body.compartments);

  const oldTankVolumes = sumByKey(existingHeader.tanker_unloading_lines || [], 'tank_name', 'received_volume');
  const newTankVolumes = sumByKey(normalizedLines, 'tank_name', 'received_volume');

  const { error: headerErr } = await supabase
    .from('tanker_unloading_headers')
    .update({ unload_date: unloadDate, tanker_number: tankerNumber, supplier_name: supplierName, waybill_no: waybillNo, invoice_no: invoiceNo, temperature })
    .eq('id', headerId);
  if (headerErr) throw headerErr;

  const { error: delErr } = await supabase.from('tanker_unloading_lines').delete().eq('header_id', headerId);
  if (delErr) throw delErr;
  const { data: insertedLines, error: insErr } = await supabase
    .from('tanker_unloading_lines')
    .insert(normalizedLines.map((line) => ({ header_id: headerId, ...line })))
    .select();
  if (insErr) throw insErr;

  const oldAdjustments = [...oldTankVolumes.keys()].map(async (tankName) => {
    await adjustTankCurrentVolumeForSalesDelta(tankName, existingHeader.unload_date, -Number(oldTankVolumes.get(tankName) || 0));
  });
  const newAdjustments = [...newTankVolumes.keys()].map(async (tankName) => {
    await adjustTankCurrentVolumeForSalesDelta(tankName, unloadDate, Number(newTankVolumes.get(tankName) || 0));
  });
  await Promise.all([...oldAdjustments, ...newAdjustments]);

  return res.status(200).json({ id: headerId, lines: insertedLines || [] });
}

async function handleTankerUnloadingDeleteV2(req, res) {
  const body = req.body || {};
  const headerId = Number(body.id);
  if (!headerId) return res.status(400).json({ error: 'Unloading ID is required' });

  const { data: existingHeader, error: existingHeaderErr } = await supabase
    .from('tanker_unloading_headers')
    .select('id, unload_date, tanker_unloading_lines ( id, tank_name, received_volume )')
    .eq('id', headerId)
    .single();
  if (existingHeaderErr) throw existingHeaderErr;

  const oldTankVolumes = sumByKey(existingHeader.tanker_unloading_lines || [], 'tank_name', 'received_volume');
  const { error: delLinesErr } = await supabase.from('tanker_unloading_lines').delete().eq('header_id', headerId);
  if (delLinesErr) throw delLinesErr;
  const { error: delHeaderErr } = await supabase.from('tanker_unloading_headers').delete().eq('id', headerId);
  if (delHeaderErr) throw delHeaderErr;

  const adjustments = [...oldTankVolumes.entries()].map(async ([tankName, volume]) => {
    await adjustTankCurrentVolumeForSalesDelta(tankName, existingHeader.unload_date, -Number(volume || 0));
  });
  await Promise.all(adjustments);

  return res.status(200).json({ ok: true });
}

async function handleDailySalesList(req, res) {
  const { filters, pagination } = getFilters(req.url);
  let { page, pageSize, search, hasPagination } = pagination;

  // Allow higher page sizes for report endpoint (chart aggregations need broader data)
  if (hasPagination) {
    pageSize = Math.max(1, Math.min(5000, parseInt(String(pageSize)) || 20));
  }

  const selectFields = 'id, sale_date, shift_name, operator_name, dispenser_name, cash_amount, online_amount, credit_amount, total_submitted, total_sales_amount, variance, status, created_at, daily_sales_nozzle_readings ( id, nozzle_name, dispenser_name, tank_name, product_name, opening_reading, closing_reading, volume, unit_price, amount ), daily_sales_testing ( id, nozzle_name, tank_name, product_name, volume, unit_price, amount, remarks )';
  
  let query = hasPagination
    ? supabase.from('daily_sales_entries').select(selectFields, { count: 'exact' }).order('id', { ascending: false })
    : supabase.from('daily_sales_entries').select(selectFields).order('id', { ascending: false });

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'sale_date_from') {
      query = query.gte('sale_date', value);
    } else if (key === 'sale_date_to') {
      query = query.lte('sale_date', value);
    } else {
      query = query.eq(key, value);
    }
  }

  if (search) {
    query = query.or(`sale_date.ilike.%${search}%,shift_name.ilike.%${search}%,operator_name.ilike.%${search}%,dispenser_name.ilike.%${search}%`);
  }

  if (hasPagination) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error) throw error;
    return res.status(200).json({ data: data || [], total: count || 0, page, pageSize, totalPages: Math.ceil((count || 0) / pageSize) });
  }

  const { data, error } = await query;
  if (error) throw error;
  return res.status(200).json(data || []);
}

async function handleDailySalesCreate(req, res) {
  const entryId = await createDailySalesEntry(req.body || {});
  return res.status(201).json({ entry_id: entryId });
}

async function handleDailySalesUpdate(req, res) {
  const body = req.body || {};
  const entryId = Number(body.id);
  if (!entryId) return res.status(400).json({ error: 'Sales entry ID is required' });
  const updatedId = await updateDailySalesEntry(entryId, body);
  return res.status(200).json({ entry_id: updatedId });
}

async function handleDailySalesDelete(req, res) {
  const body = req.body || {};
  const entryId = Number(body.id);
  if (!entryId) return res.status(400).json({ error: 'Sales entry ID is required' });
  await deleteDailySalesEntry(entryId);
  return res.status(200).json({ ok: true });
}

async function loadDailySalesEntryById(entryId) {
  const { data, error } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, shift_name, operator_name, dispenser_name, cash_amount, online_amount, credit_amount, total_submitted, total_sales_amount, variance, status, daily_sales_nozzle_readings ( id, nozzle_name, dispenser_name, tank_name, product_name, opening_reading, closing_reading, volume, unit_price, amount ), daily_sales_testing ( id, nozzle_name, tank_name, product_name, volume, unit_price, amount, remarks )')
    .eq('id', entryId)
    .single();
  if (error) throw error;
  return data;
}

function isLaterSalesEntry(a, b) {
  if (String(a.sale_date || '') > String(b.sale_date || '')) return true;
  if (String(a.sale_date || '') < String(b.sale_date || '')) return false;
  return Number(a.id || 0) > Number(b.id || 0);
}

async function ensureDailySalesEntryMutable(entry) {
  const { data: dispenserEntries, error } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, dispenser_name')
    .eq('dispenser_name', entry.dispenser_name);
  if (error) throw error;
  const later = (dispenserEntries || []).find((row) => Number(row.id || 0) !== Number(entry.id || 0) && isLaterSalesEntry(row, entry));
  if (later) {
    throw new Error(`This sales entry cannot be changed because a later sales entry already exists for dispenser ${entry.dispenser_name}. Only the latest entry for each dispenser can be edited or deleted.`);
  }
}

async function syncMetersForNozzles(nozzleNames) {
  const uniqueNozzles = [...new Set((nozzleNames || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (uniqueNozzles.length === 0) return;
  const { data: meterRows, error: meterErr } = await supabase
    .from('meters')
    .select('id, nozzle_name, opening_reading, current_reading')
    .in('nozzle_name', uniqueNozzles);
  if (meterErr) throw meterErr;
  const meterMap = new Map((meterRows || []).map((m) => [m.nozzle_name, m]));
  const { data: entries, error: entryErr } = await supabase
    .from('daily_sales_entries')
    .select('id, sale_date, daily_sales_nozzle_readings ( nozzle_name, closing_reading )')
    .order('sale_date', { ascending: false })
    .order('id', { ascending: false });
  if (entryErr) throw entryErr;

  for (const nozzleName of uniqueNozzles) {
    const meter = meterMap.get(nozzleName);
    if (!meter) continue;
    let resolvedReading = Number(meter.opening_reading || 0);
    for (const entry of entries || []) {
      const match = (entry.daily_sales_nozzle_readings || []).find((row) => row.nozzle_name === nozzleName);
      if (match) {
        resolvedReading = Number(match.closing_reading || 0);
        break;
      }
    }
    const { error: updErr } = await supabase.from('meters').update({ current_reading: resolvedReading }).eq('id', meter.id);
    if (updErr) throw updErr;
  }
}

async function hasClosingDipOnOrAfter(tankName, saleDate) {
  if (!tankName || !saleDate) return false;
  const { data, error } = await supabase
    .from('dip_readings')
    .select('id')
    .eq('tank_name', tankName)
    .eq('reading_type', 'closing')
    .gte('reading_date', saleDate)
    .order('reading_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function adjustTankCurrentVolumeForSalesDelta(tankName, saleDate, deltaVolume) {
  const delta = Number(deltaVolume || 0);
  if (!tankName || Math.abs(delta) < 0.000001) return;
  if (await hasClosingDipOnOrAfter(tankName, saleDate)) return;
  const tankRow = await safeSingle(
    supabase.from('tanks').select('id, current_volume').eq('name', tankName),
    `Tank not found: ${tankName}`
  );
  const nextVol = Number(tankRow.current_volume || 0) + delta;
  if (nextVol < -0.000001) {
    throw new Error(`Tank volume cannot go negative while correcting sales for tank ${tankName}`);
  }
  const { error: updErr } = await supabase.from('tanks').update({ current_volume: Math.max(0, nextVol) }).eq('id', tankRow.id);
  if (updErr) throw updErr;
}

async function adjustBufferVolumeByProduct(productName, deltaVolume) {
  const delta = Number(deltaVolume || 0);
  if (!productName || Math.abs(delta) < 0.000001) return;
  const { data: existing, error: bErr } = await supabase
    .from('buffer_tanks')
    .select('id, volume')
    .eq('product_name', productName)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!existing) {
    if (delta < 0) {
      throw new Error(`Buffer stock is not available to reverse testing volume for product ${productName}`);
    }
    const { error: insErr } = await supabase.from('buffer_tanks').insert([{ product_name: productName, volume: delta }]);
    if (insErr) throw insErr;
    return;
  }
  const next = Number(existing.volume || 0) + delta;
  if (next < -0.000001) {
    throw new Error(`Buffer stock is not sufficient to reduce testing volume for product ${productName}`);
  }
  const { error: updErr } = await supabase
    .from('buffer_tanks')
    .update({ volume: Math.max(0, next), updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  if (updErr) throw updErr;
}

function sumByKey(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows || []) {
    const key = String(row?.[keyField] || '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + Number(row?.[valueField] || 0));
  }
  return map;
}

async function reconcileTankCurrentVolume(tankName) {
  const { data: latestDip } = await supabase
    .from('dip_readings')
    .select('volume_liters, reading_date')
    .eq('tank_name', tankName)
    .eq('reading_type', 'closing')
    .order('reading_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: unloads }, { data: readings }, { data: moves }] = await Promise.all([
    supabase
      .from('tanker_unloading_lines')
      .select('received_volume, tanker_unloading_headers(unload_date)')
      .eq('tank_name', tankName),
    supabase
      .from('daily_sales_nozzle_readings')
      .select('volume, daily_sales_entries(sale_date)')
      .eq('tank_name', tankName),
    supabase
      .from('stock_movements')
      .select('volume, movement_type, movement_date')
      .eq('tank_name', tankName),
  ]);

  const dipDate = latestDip?.reading_date;

  const received = (unloads || [])
    .filter((r) => !dipDate || r.tanker_unloading_headers?.unload_date > dipDate)
    .reduce((s, r) => s + Number(r.received_volume || 0), 0);

  const sold = (readings || [])
    .filter((r) => !dipDate || r.daily_sales_entries?.sale_date > dipDate)
    .reduce((s, r) => s + Number(r.volume || 0), 0);

  const moveIn = (moves || [])
    .filter((m) => m.movement_type === 'IN' && (!dipDate || m.movement_date > dipDate))
    .reduce((s, m) => s + Number(m.volume || 0), 0);

  const moveOut = (moves || [])
    .filter((m) => m.movement_type === 'OUT' && (!dipDate || m.movement_date > dipDate))
    .reduce((s, m) => s + Number(m.volume || 0), 0);

  const base = latestDip ? Number(latestDip.volume_liters || 0) : 0;

  return Math.max(0, base + received - sold + moveIn - moveOut);
}

async function reconcileBufferVolume(productName) {
  const [{ data: testing }, { data: transfers }] = await Promise.all([
    supabase
      .from('daily_sales_testing')
      .select('volume')
      .eq('product_name', productName),
    supabase
      .from('stock_movements')
      .select('volume')
      .eq('product_name', productName)
      .eq('reason', 'Testing Transfer')
      .eq('movement_type', 'IN'),
  ]);
  const added = (testing || []).reduce((s, r) => s + Number(r.volume || 0), 0);
  const removed = (transfers || []).reduce((s, m) => s + Number(m.volume || 0), 0);
  return Math.max(0, added - removed);
}

async function createDailySalesEntry(payload, opts = {}) {
  const body = payload || {};
  const saleDate = requireText(body.sale_date, 'Sale date');
  const shiftName = requireText(body.shift_name, 'Shift');
  const operatorName = requireText(body.operator_name, 'Operator');
  const dispenserName = requireText(body.dispenser_name, 'Dispenser');
  const cashAmount = optionalNumber(body.cash_amount, 'Cash amount') ?? 0;
  const onlineAmount = optionalNumber(body.online_amount, 'Online amount') ?? 0;
  const creditAmount = optionalNumber(body.credit_amount, 'Credit amount') ?? 0;
  const nozzleReadings = Array.isArray(body.nozzle_readings) ? body.nozzle_readings : [];
  const testingVolumes = Array.isArray(body.testing_volumes) ? body.testing_volumes : [];
  if (nozzleReadings.length === 0) throw new Error('At least one nozzle reading is required');

  const { data: dispenserRow, error: dispenserErr } = await supabase
    .from('dispensers')
    .select('name, status')
    .eq('name', dispenserName)
    .maybeSingle();
  if (dispenserErr) throw dispenserErr;
  if (!dispenserRow) throw new Error(`Dispenser not found: ${dispenserName}`);
  if (dispenserRow.status && !['Operational', 'Active'].includes(String(dispenserRow.status))) {
    throw new Error(`Dispenser is not available for sales entry: ${dispenserName}`);
  }

  const { data: operatorRow, error: operatorErr } = await supabase
    .from('operators')
    .select('name, active')
    .eq('name', operatorName)
    .maybeSingle();
  if (operatorErr) throw operatorErr;
  if (!operatorRow) throw new Error(`Operator not found: ${operatorName}`);
  if (operatorRow.active === false) throw new Error(`Operator is inactive: ${operatorName}`);

  const { data: shiftRow, error: shiftErr } = await supabase
    .from('shifts')
    .select('name')
    .eq('name', shiftName)
    .maybeSingle();
  if (shiftErr) throw shiftErr;
  if (!shiftRow) throw new Error(`Shift not found: ${shiftName}`);

  const { data: existingDispenserEntry, error: existingDispenserErr } = await supabase
    .from('daily_sales_entries')
    .select('id, operator_name')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('dispenser_name', dispenserName)
    .maybeSingle();
  if (existingDispenserErr) throw existingDispenserErr;
  if (existingDispenserEntry) {
    throw new Error(`Sales entry already exists for ${saleDate}, ${shiftName}, dispenser ${dispenserName}`);
  }

  const { data: existingOperatorEntry, error: existingOperatorErr } = await supabase
    .from('daily_sales_entries')
    .select('id, dispenser_name')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('operator_name', operatorName)
    .maybeSingle();
  if (existingOperatorErr) throw existingOperatorErr;
  if (existingOperatorEntry) {
    throw new Error(`Operator ${operatorName} is already assigned to dispenser ${existingOperatorEntry.dispenser_name || 'another dispenser'} for ${shiftName} on ${saleDate}`);
  }

  const nozzleNames = nozzleReadings.map((r) => String(r?.nozzle_name ?? '').trim()).filter(Boolean);
  if (new Set(nozzleNames).size !== nozzleNames.length) {
    throw new Error('Each nozzle can be entered only once in a sales entry');
  }

  const { data: nozzleRows, error: nozErr } = await supabase
    .from('nozzles')
    .select('name, dispenser_name, tank_name, product_name, status')
    .eq('dispenser_name', dispenserName);
  if (nozErr) throw nozErr;
  const nozzleMap = new Map((nozzleRows || []).map((n) => [n.name, n]));
  const activeNozzles = (nozzleRows || []).filter((n) => n.status === 'Active' || n.status == null);
  if (activeNozzles.length === 0) {
    throw new Error(`No active nozzles found for dispenser ${dispenserName}`);
  }

  const activeNozzleNames = activeNozzles.map((n) => n.name);
  if (!opts.skipCoverageCheck) {
    const missingNozzles = activeNozzleNames.filter((name) => !nozzleNames.includes(name));
    if (missingNozzles.length > 0) {
      throw new Error(`Enter closing reading for all active nozzles of ${dispenserName}: ${missingNozzles.join(', ')}`);
    }
  }
  const invalidNozzles = nozzleNames.filter((name) => !activeNozzleNames.includes(name));
  if (invalidNozzles.length > 0) {
    throw new Error(`Only active nozzles of dispenser ${dispenserName} can be entered: ${invalidNozzles.join(', ')}`);
  }

  const { data: meterRows, error: mErr } = await supabase
    .from('meters')
    .select('id, nozzle_name, current_reading')
    .in('nozzle_name', activeNozzleNames);
  if (mErr) throw mErr;
  const meterMap = new Map((meterRows || []).map((m) => [m.nozzle_name, m]));

  const productNames = [...new Set((nozzleRows || []).map((n) => String(n.product_name || '').trim()).filter(Boolean))];
  const priceMap = await loadEffectivePriceMap(productNames, saleDate);

  // Build testing entries and volume map (validated before nozzle calculation)
  const normalizedTesting = [];
  const testingByNozzle = new Map();
  for (let i = 0; i < testingVolumes.length; i++) {
    const t = testingVolumes[i] || {};
    const label = `Testing row ${i + 1}: `;
    const nozzleName = requireText(t.nozzle_name, `${label}Nozzle`);
    const volume = requireNonNegativeNumber(t.volume, `${label}Volume`);
    const remarks = optionalText(t.remarks);
    if (volume === 0) continue; // skip zero-volume testing entries
    const noz = nozzleMap.get(nozzleName);
    if (!noz || noz.dispenser_name !== dispenserName) {
      throw new Error(`${label}Nozzle does not belong to dispenser ${dispenserName}: ${nozzleName}`);
    }
    if (!nozzleReadings.some((r) => String(r?.nozzle_name ?? '').trim() === nozzleName)) {
      throw new Error(`${label}Testing nozzle ${nozzleName} has no matching nozzle reading in this entry`);
    }
    testingByNozzle.set(nozzleName, (testingByNozzle.get(nozzleName) || 0) + volume);
    const resolvedProduct = noz.product_name;
    const resolvedTank = noz.tank_name || null;
    const price = Number(priceMap.get(resolvedProduct) ?? 0);
    const amount = Math.round(volume * price * 100) / 100;
    normalizedTesting.push({
      nozzle_name: nozzleName,
      tank_name: resolvedTank,
      product_name: resolvedProduct,
      volume,
      unit_price: price,
      amount,
      remarks,
    });
  }

  // Nozzle readings loop: compute net volume by subtracting testing per nozzle
  // This avoids intermediate-rounding discrepancies from deducting testing at the monetary level
  const normalizedReadings = [];
  let rawTotal = 0;
  for (let i = 0; i < nozzleReadings.length; i++) {
    const r = nozzleReadings[i] || {};
    const label = `Nozzle row ${i + 1}: `;
    const nozzleName = requireText(r.nozzle_name, `${label}Nozzle`);
    const closing = requireNonNegativeNumber(r.closing_reading, `${label}Closing reading`);
    const nozzle = nozzleMap.get(nozzleName);
    if (!nozzle) throw new Error(`${label}Nozzle not found: ${nozzleName}`);
    const meter = meterMap.get(nozzleName);
    if (!meter) throw new Error(`${label}Meter not found for nozzle: ${nozzleName}`);
    const opening = Number(meter.current_reading || 0);
    if (closing < opening) throw new Error(`${label}Closing reading must be >= opening reading`);
    const grossVolume = closing - opening;
    const unitPrice = Number(priceMap.get(nozzle.product_name) ?? 0);
    const testingVol = testingByNozzle.get(nozzleName) || 0;
    if (testingVol > grossVolume) {
      throw new Error(`${label}Testing volume (${testingVol}) cannot exceed dispensed volume (${grossVolume})`);
    }
    const netVolume = grossVolume - testingVol;
    const amount = Math.round(netVolume * unitPrice * 100) / 100;
    rawTotal += amount;
    normalizedReadings.push({
      nozzle_name: nozzleName,
      dispenser_name: dispenserName,
      tank_name: nozzle.tank_name || null,
      product_name: nozzle.product_name,
      opening_reading: opening,
      closing_reading: closing,
      volume: grossVolume,
      unit_price: unitPrice,
      amount,
    });
  }

  const totalSalesAmount = Math.round(rawTotal * 100) / 100;
  const totalSubmitted = Math.round((Number(cashAmount) + Number(onlineAmount) + Number(creditAmount)) * 100) / 100;
  const variance = Math.round((totalSubmitted - totalSalesAmount) * 100) / 100;

  const { data: entry, error: eErr } = await supabase
    .from('daily_sales_entries')
    .insert([{
      sale_date: saleDate,
      shift_name: shiftName,
      operator_name: operatorName,
      dispenser_name: dispenserName,
      cash_amount: cashAmount,
      online_amount: onlineAmount,
      credit_amount: creditAmount,
      total_submitted: totalSubmitted,
      total_sales_amount: totalSalesAmount,
      variance,
      status: 'submitted',
    }])
    .select()
    .single();
  if (eErr) throw eErr;

  const { error: rInsErr } = await supabase
    .from('daily_sales_nozzle_readings')
    .insert(normalizedReadings.map((r) => ({ sales_entry_id: entry.id, ...r })));
  if (rInsErr) {
    await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
    throw rInsErr;
  }

  if (normalizedTesting.length > 0) {
    const { error: tInsErr } = await supabase
      .from('daily_sales_testing')
      .insert(normalizedTesting.map((t) => ({ sales_entry_id: entry.id, ...t })));
    if (tInsErr) {
      await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
      throw tInsErr;
    }
  }

  // Capture pre-state for rollback before applying side effects
  const preMeterState = normalizedReadings.map((r) => {
    const meter = meterMap.get(r.nozzle_name);
    return { meterId: meter.id, previousReading: Number(meter.current_reading || 0) };
  });
  const preTankState = [];
  for (const r of normalizedReadings) {
    if (r.tank_name) {
      const { data: tr, error: te } = await supabase.from('tanks').select('id, current_volume').eq('name', r.tank_name).single();
      if (te) throw te;
      preTankState.push({ tankId: tr.id, previousVolume: Number(tr.current_volume || 0) });
    }
  }
  const preBufferState = [];
  for (const t of normalizedTesting) {
    const { data: br, error: be } = await supabase.from('buffer_tanks').select('id, volume').eq('product_name', t.product_name).maybeSingle();
    if (be) throw be;
    preBufferState.push({ productName: t.product_name, id: br?.id || null, previousVolume: Number(br?.volume || 0) });
  }

  try {
    const meterUpdates = normalizedReadings.map(async (r) => {
      const meter = meterMap.get(r.nozzle_name);
      const { error: updMeterErr } = await supabase.from('meters').update({ current_reading: r.closing_reading }).eq('id', meter.id);
      if (updMeterErr) throw updMeterErr;
      if (r.tank_name) {
        const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', r.tank_name).single();
        if (tErr) throw tErr;
        const nextVol = Math.max(0, Number(tankRow.current_volume || 0) - Number(r.volume || 0));
        const { error: updTankErr } = await supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tankRow.id);
        if (updTankErr) throw updTankErr;
      }
    });
    await Promise.all(meterUpdates);

    const bufferUpdates = normalizedTesting.map(async (t) => {
      const { data: existing, error: bErr } = await supabase.from('buffer_tanks').select('id, volume').eq('product_name', t.product_name).maybeSingle();
      if (bErr) throw bErr;
      if (!existing) {
        const { error: insErr } = await supabase.from('buffer_tanks').insert([{ product_name: t.product_name, volume: Number(t.volume || 0) }]);
        if (insErr) throw insErr;
      } else {
        const next = Number(existing.volume || 0) + Number(t.volume || 0);
        const { error: updErr } = await supabase.from('buffer_tanks').update({ volume: next, updated_at: new Date().toISOString() }).eq('id', existing.id);
        if (updErr) throw updErr;
      }
    });
    await Promise.all(bufferUpdates);
  } catch (updateErr) {
    await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', entry.id);
    await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entry.id);
    await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
    throw new Error(`Meter/tank/buffer update failed, sales entry rolled back: ${updateErr.message}`);
  }

  return { entryId: entry.id, rollback: { preMeterState, preTankState, preBufferState } };
}

async function updateDailySalesEntry(entryId, payload) {
  const existing = await loadDailySalesEntryById(entryId);
  await ensureDailySalesEntryMutable(existing);

  const body = payload || {};
  const saleDate = existing.sale_date;
  const dispenserName = existing.dispenser_name;
  const shiftName = requireText(body.shift_name ?? existing.shift_name, 'Shift');
  const operatorName = requireText(body.operator_name ?? existing.operator_name, 'Operator');
  const cashAmount = optionalNumber(body.cash_amount, 'Cash amount') ?? 0;
  const onlineAmount = optionalNumber(body.online_amount, 'Online amount') ?? 0;
  const creditAmount = optionalNumber(body.credit_amount, 'Credit amount') ?? 0;
  const nozzleReadings = Array.isArray(body.nozzle_readings) ? body.nozzle_readings : [];
  const testingVolumes = Array.isArray(body.testing_volumes) ? body.testing_volumes : [];
  if (nozzleReadings.length === 0) throw new Error('At least one nozzle reading is required');

  if ((body.sale_date && String(body.sale_date) !== String(existing.sale_date)) || (body.dispenser_name && String(body.dispenser_name) !== String(existing.dispenser_name))) {
    throw new Error('For safety, date and dispenser cannot be changed after a sales entry is created. Delete and recreate the entry if those values were entered incorrectly.');
  }

  const { data: operatorRow, error: operatorErr } = await supabase
    .from('operators')
    .select('name, active')
    .eq('name', operatorName)
    .maybeSingle();
  if (operatorErr) throw operatorErr;
  if (!operatorRow) throw new Error(`Operator not found: ${operatorName}`);
  if (operatorRow.active === false) throw new Error(`Operator is inactive: ${operatorName}`);

  const { data: shiftRow, error: shiftErr } = await supabase
    .from('shifts')
    .select('name')
    .eq('name', shiftName)
    .maybeSingle();
  if (shiftErr) throw shiftErr;
  if (!shiftRow) throw new Error(`Shift not found: ${shiftName}`);

  const { data: existingDispenserEntry, error: existingDispenserErr } = await supabase
    .from('daily_sales_entries')
    .select('id')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('dispenser_name', dispenserName)
    .neq('id', entryId)
    .maybeSingle();
  if (existingDispenserErr) throw existingDispenserErr;
  if (existingDispenserEntry) {
    throw new Error(`Sales entry already exists for ${saleDate}, ${shiftName}, dispenser ${dispenserName}`);
  }

  const { data: existingOperatorEntry, error: existingOperatorErr } = await supabase
    .from('daily_sales_entries')
    .select('id, dispenser_name')
    .eq('sale_date', saleDate)
    .eq('shift_name', shiftName)
    .eq('operator_name', operatorName)
    .neq('id', entryId)
    .maybeSingle();
  if (existingOperatorErr) throw existingOperatorErr;
  if (existingOperatorEntry) {
    throw new Error(`Operator ${operatorName} is already assigned to dispenser ${existingOperatorEntry.dispenser_name || 'another dispenser'} for ${shiftName} on ${saleDate}`);
  }

  const openingByNozzle = new Map((existing.daily_sales_nozzle_readings || []).map((row) => [row.nozzle_name, Number(row.opening_reading || 0)]));
  const oldReadingsByNozzle = new Map((existing.daily_sales_nozzle_readings || []).map((row) => [row.nozzle_name, row]));
  const nozzleNames = nozzleReadings.map((r) => String(r?.nozzle_name ?? '').trim()).filter(Boolean);
  const expectedNozzleNames = [...openingByNozzle.keys()];
  if (new Set(nozzleNames).size !== nozzleNames.length) {
    throw new Error('Each nozzle can be entered only once in a sales entry');
  }
  const missingNozzles = expectedNozzleNames.filter((name) => !nozzleNames.includes(name));
  if (missingNozzles.length > 0) {
    throw new Error(`Enter closing reading for all existing nozzles of ${dispenserName}: ${missingNozzles.join(', ')}`);
  }
  const invalidNozzles = nozzleNames.filter((name) => !openingByNozzle.has(name));
  if (invalidNozzles.length > 0) {
    throw new Error(`Only the original dispenser nozzles can be corrected for this entry: ${invalidNozzles.join(', ')}`);
  }

  const { data: nozzleRows, error: nozErr } = await supabase
    .from('nozzles')
    .select('name, dispenser_name, tank_name, product_name, status')
    .eq('dispenser_name', dispenserName);
  if (nozErr) throw nozErr;
  const nozzleMap = new Map((nozzleRows || []).map((n) => [n.name, n]));

  const productNames = [...new Set((nozzleRows || []).map((n) => String(n.product_name || '').trim()).filter(Boolean))];
  const priceMap = await loadEffectivePriceMap(productNames, saleDate);

  // Build testing entries and volume map (validated before nozzle calculation)
  const normalizedTesting = [];
  const testingByNozzle = new Map();
  for (let i = 0; i < testingVolumes.length; i++) {
    const t = testingVolumes[i] || {};
    const label = `Testing row ${i + 1}: `;
    const nozzleName = requireText(t.nozzle_name, `${label}Nozzle`);
    const volume = requireNonNegativeNumber(t.volume, `${label}Volume`);
    const remarks = optionalText(t.remarks);
    if (volume === 0) continue; // skip zero-volume testing entries
    if (!openingByNozzle.has(nozzleName)) {
      throw new Error(`${label}Only the original entry nozzles can be corrected: ${nozzleName}`);
    }
    const noz = nozzleMap.get(nozzleName);
    if (!noz || noz.dispenser_name !== dispenserName) {
      throw new Error(`${label}Nozzle does not belong to dispenser ${dispenserName}: ${nozzleName}`);
    }
    if (!nozzleReadings.some((r) => String(r?.nozzle_name ?? '').trim() === nozzleName)) {
      throw new Error(`${label}Testing nozzle ${nozzleName} has no matching nozzle reading in this update`);
    }
    testingByNozzle.set(nozzleName, (testingByNozzle.get(nozzleName) || 0) + volume);
    const resolvedProduct = noz.product_name;
    const resolvedTank = noz.tank_name || null;
    const price = Number(priceMap.get(resolvedProduct) ?? 0);
    const amount = Math.round(volume * price * 100) / 100;
    normalizedTesting.push({
      nozzle_name: nozzleName,
      tank_name: resolvedTank,
      product_name: resolvedProduct,
      volume,
      unit_price: price,
      amount,
      remarks,
    });
  }

  // Nozzle readings loop: compute net amount per nozzle (testing subtracted before pricing)
  const normalizedReadings = [];
  let rawTotal = 0;
  for (let i = 0; i < nozzleReadings.length; i++) {
    const r = nozzleReadings[i] || {};
    const label = `Nozzle row ${i + 1}: `;
    const nozzleName = requireText(r.nozzle_name, `${label}Nozzle`);
    const closing = requireNonNegativeNumber(r.closing_reading, `${label}Closing reading`);
    const nozzle = nozzleMap.get(nozzleName);
    if (!nozzle) throw new Error(`${label}Nozzle not found: ${nozzleName}`);
    const opening = Number(openingByNozzle.get(nozzleName) || 0);
    if (closing < opening) throw new Error(`${label}Closing reading must be >= opening reading`);
    const grossVolume = closing - opening;
    const unitPrice = Number(priceMap.get(nozzle.product_name) ?? 0);
    const testingVol = testingByNozzle.get(nozzleName) || 0;
    if (testingVol > grossVolume) {
      throw new Error(`${label}Testing volume (${testingVol}) cannot exceed dispensed volume (${grossVolume})`);
    }
    const netVolume = grossVolume - testingVol;
    const amount = Math.round(netVolume * unitPrice * 100) / 100;
    rawTotal += amount;
    normalizedReadings.push({
      nozzle_name: nozzleName,
      dispenser_name: dispenserName,
      tank_name: nozzle.tank_name || null,
      product_name: nozzle.product_name,
      opening_reading: opening,
      closing_reading: closing,
      volume: grossVolume,
      unit_price: unitPrice,
      amount,
    });
  }

  const totalSalesAmount = Math.round(rawTotal * 100) / 100;
  const totalSubmitted = Math.round((Number(cashAmount) + Number(onlineAmount) + Number(creditAmount)) * 100) / 100;
  const variance = Math.round((totalSubmitted - totalSalesAmount) * 100) / 100;

  const oldTankVolumes = sumByKey(existing.daily_sales_nozzle_readings || [], 'tank_name', 'volume');
  const newTankVolumes = sumByKey(normalizedReadings, 'tank_name', 'volume');
  const oldTestingByProduct = sumByKey(existing.daily_sales_testing || [], 'product_name', 'volume');
  const newTestingByProduct = sumByKey(normalizedTesting, 'product_name', 'volume');
  for (const productName of new Set([...oldTestingByProduct.keys(), ...newTestingByProduct.keys()])) {
    const delta = Number(newTestingByProduct.get(productName) || 0) - Number(oldTestingByProduct.get(productName) || 0);
    if (delta < 0) {
      await adjustBufferVolumeByProduct(productName, 0);
      const { data: bufferRow, error: bufferErr } = await supabase.from('buffer_tanks').select('volume').eq('product_name', productName).maybeSingle();
      if (bufferErr) throw bufferErr;
      if (Number(bufferRow?.volume || 0) + delta < -0.000001) {
        throw new Error(`Buffer stock is not sufficient to reduce testing volume for product ${productName}`);
      }
    }
  }

  const { error: headerErr } = await supabase
    .from('daily_sales_entries')
    .update({
      shift_name: shiftName,
      operator_name: operatorName,
      cash_amount: cashAmount,
      online_amount: onlineAmount,
      credit_amount: creditAmount,
      total_submitted: totalSubmitted,
      total_sales_amount: totalSalesAmount,
      variance,
    })
    .eq('id', entryId);
  if (headerErr) throw headerErr;

  const { error: delTestingErr } = await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', entryId);
  if (delTestingErr) throw delTestingErr;
  const { error: delReadErr } = await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entryId);
  if (delReadErr) throw delReadErr;
  const { error: insReadErr } = await supabase
    .from('daily_sales_nozzle_readings')
    .insert(normalizedReadings.map((row) => ({ sales_entry_id: entryId, ...row })));
  if (insReadErr) throw insReadErr;
  if (normalizedTesting.length > 0) {
    const { error: insTestErr } = await supabase
      .from('daily_sales_testing')
      .insert(normalizedTesting.map((row) => ({ sales_entry_id: entryId, ...row })));
    if (insTestErr) throw insTestErr;
  }

  const tankAdjustments = [...new Set([...oldTankVolumes.keys(), ...newTankVolumes.keys()])].map(async (tankName) => {
    const delta = Number(oldTankVolumes.get(tankName) || 0) - Number(newTankVolumes.get(tankName) || 0);
    await adjustTankCurrentVolumeForSalesDelta(tankName, saleDate, delta);
  });
  const bufferAdjustments = [...new Set([...oldTestingByProduct.keys(), ...newTestingByProduct.keys()])].map(async (productName) => {
    const delta = Number(newTestingByProduct.get(productName) || 0) - Number(oldTestingByProduct.get(productName) || 0);
    await adjustBufferVolumeByProduct(productName, delta);
  });
  await Promise.all([...tankAdjustments, ...bufferAdjustments]);
  await syncMetersForNozzles((existing.daily_sales_nozzle_readings || []).map((row) => row.nozzle_name));

  return entryId;
}

async function deleteDailySalesEntry(entryId) {
  const existing = await loadDailySalesEntryById(entryId);
  await ensureDailySalesEntryMutable(existing);

  const oldTankVolumes = sumByKey(existing.daily_sales_nozzle_readings || [], 'tank_name', 'volume');
  const oldTestingByProduct = sumByKey(existing.daily_sales_testing || [], 'product_name', 'volume');
  for (const [productName, volume] of oldTestingByProduct.entries()) {
    const { data: bufferRow, error: bufferErr } = await supabase.from('buffer_tanks').select('volume').eq('product_name', productName).maybeSingle();
    if (bufferErr) throw bufferErr;
    if (Number(bufferRow?.volume || 0) - Number(volume || 0) < -0.000001) {
      throw new Error(`Buffer stock is not sufficient to delete this entry because testing volume has already been used for product ${productName}`);
    }
  }

  const tankAdjustments = [...oldTankVolumes.entries()].map(async ([tankName, volume]) => {
    await adjustTankCurrentVolumeForSalesDelta(tankName, existing.sale_date, Number(volume || 0));
  });
  const bufferAdjustments = [...oldTestingByProduct.entries()].map(async ([productName, volume]) => {
    await adjustBufferVolumeByProduct(productName, -Number(volume || 0));
  });
  await Promise.all([...tankAdjustments, ...bufferAdjustments]);
  try {
    await syncMetersForNozzles((existing.daily_sales_nozzle_readings || []).map((row) => row.nozzle_name));
  } catch (_) { /* best-effort meter sync — failure doesn't block deletion */ }

  const { error: delTestingErr } = await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', entryId);
  if (delTestingErr) throw delTestingErr;
  const { error: delReadErr } = await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entryId);
  if (delReadErr) throw delReadErr;
  const { error: delEntryErr } = await supabase.from('daily_sales_entries').delete().eq('id', entryId);
  if (delEntryErr) throw delEntryErr;
}

async function handleDailySalesUndo(req, res) {
  const { entry_ids } = req.body || {};
  const ids = Array.isArray(entry_ids) ? entry_ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'entry_ids array is required' });
  let ok = 0, fail = 0;
  const results = [];
  for (const id of ids) {
    try {
      await deleteDailySalesEntry(Number(id));
      ok++;
      results.push({ entry_id: id, status: 'deleted' });
    } catch (e) {
      fail++;
      results.push({ entry_id: id, error: String(e?.message || e) });
    }
  }
  return res.status(ok === 0 ? 400 : 200).json({ ok, fail, results });
}

async function handleDailySalesImport(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

  // Phase 1 — Group rows by (sale_date, shift, operator, dispenser)
  const groups = new Map();
  const groupCsvRows = new Map();
  for (const row of rows) {
    const saleDate = requireText(row.sale_date ?? row.date, 'Sale date');
    const shiftName = requireText(row.shift_name, 'Shift');
    const operatorName = requireText(row.operator_name, 'Operator');
    const dispenserName = requireText(row.dispenser_name, 'Dispenser');
    const key = `${saleDate}||${shiftName}||${operatorName}||${dispenserName}`;
    if (!groups.has(key)) {
      groups.set(key, { sale_date: saleDate, shift_name: shiftName, operator_name: operatorName, dispenser_name: dispenserName, cash_amount: null, online_amount: null, credit_amount: null, nozzle_readings: [], testing_volumes: [] });
      groupCsvRows.set(key, row._csvRow || 0);
    }
    const g = groups.get(key);
    const nozzleName = requireText(row.nozzle_name, 'Nozzle');
    const closing = requireNonNegativeNumber(row.closing_reading, 'Closing reading');
    const openingOverride = (row.opening_reading != null && row.opening_reading !== '')
      ? requireNonNegativeNumber(row.opening_reading, 'Opening reading')
      : null;
    g.nozzle_readings.push({ nozzle_name: nozzleName, closing_reading: closing, opening_reading: openingOverride });
    if (row.testing_volume != null && row.testing_volume !== '') {
      const tv = requireNonNegativeNumber(row.testing_volume, 'Testing volume');
      if (tv > 0) {
        g.testing_volumes.push({ nozzle_name: nozzleName, volume: tv, remarks: optionalText(row.testing_remarks) });
      }
    }
    if (row.cash_amount != null && row.cash_amount !== '' && g.cash_amount == null) g.cash_amount = Number(row.cash_amount) || 0;
    if (row.online_amount != null && row.online_amount !== '' && g.online_amount == null) g.online_amount = Number(row.online_amount) || 0;
    if (row.credit_amount != null && row.credit_amount !== '' && g.credit_amount == null) g.credit_amount = Number(row.credit_amount) || 0;
  }

  // Phase 2 — Batch-validate ALL groups before writing anything
  const allDispensers = [...new Set([...groups.values()].map((g) => g.dispenser_name))];
  const allOperators = [...new Set([...groups.values()].map((g) => g.operator_name))];
  const allShifts = [...new Set([...groups.values()].map((g) => g.shift_name))];
  const allDates = [...new Set([...groups.values()].map((g) => g.sale_date))];

  // Batch query all necessary data
  const [dispRes, opRes, shiftRes, existingRaw, nozzleRows] = await Promise.all([
    allDispensers.length ? supabase.from('dispensers').select('name, status').in('name', allDispensers) : { data: [], error: null },
    allOperators.length ? supabase.from('operators').select('name, active').in('name', allOperators) : { data: [], error: null },
    allShifts.length ? supabase.from('shifts').select('name').in('name', allShifts) : { data: [], error: null },
    (allDates.length && allDispensers.length) ? 
      supabase.from('daily_sales_entries').select('sale_date, shift_name, dispenser_name, operator_name').in('sale_date', allDates).in('dispenser_name', allDispensers) 
      : { data: [], error: null },
    allDispensers.length ? supabase.from('nozzles').select('name, dispenser_name, product_name, tank_name, status').in('dispenser_name', allDispensers) : { data: [], error: null },
  ]);
  if (dispRes.error) throw dispRes.error;
  if (opRes.error) throw opRes.error;
  if (shiftRes.error) throw shiftRes.error;
  if (existingRaw.error) throw existingRaw.error;
  if (nozzleRows.error) throw nozzleRows.error;

  const dispenserMap = new Map((dispRes.data || []).map((d) => [d.name, d]));
  const operatorMap = new Map((opRes.data || []).map((o) => [o.name, o]));
  const shiftSet = new Set((shiftRes.data || []).map((s) => s.name));

  // Get nozzles and meters
  const allNozzleNames = [...new Set((nozzleRows.data || []).map((n) => n.name).filter(Boolean))];
  const meterRes = allNozzleNames.length ? await supabase.from('meters').select('id, nozzle_name, current_reading').in('nozzle_name', allNozzleNames) : { data: [], error: null };
  if (meterRes.error) throw meterRes.error;
  const metersByNozzle = new Map((meterRes.data || []).map((m) => [m.nozzle_name, m]));
  
  // Get tanks
  const allTankNames = [...new Set((nozzleRows.data || []).map((n) => n.tank_name).filter(Boolean))];
  const tankRes = allTankNames.length ? await supabase.from('tanks').select('id, name, current_volume').in('name', allTankNames) : { data: [], error: null };
  if (tankRes.error) throw tankRes.error;
  const tanksByName = new Map((tankRes.data || []).map((t) => [t.name, t]));
  
  // Get all product names for pricing (prices resolved per-date below)
  const allProductNames = [...new Set((nozzleRows.data || []).map((n) => n.product_name).filter(Boolean))];

  // Build caches
  const nozzlesByDispenser = new Map();
  const activeNozzlesByDispenser = new Map();
  const nozzlesByName = new Map();
  for (const n of nozzleRows.data || []) {
    nozzlesByName.set(n.name, n);
    if (!nozzlesByDispenser.has(n.dispenser_name)) nozzlesByDispenser.set(n.dispenser_name, []);
    nozzlesByDispenser.get(n.dispenser_name).push(n);
  }
  for (const [disp, nozzles] of nozzlesByDispenser) {
    activeNozzlesByDispenser.set(disp, nozzles.filter((n) => n.status === 'Active' || n.status == null));
  }

  const existingByDispenser = new Map();
  const usedOperators = new Map();
  for (const e of existingRaw.data || []) {
    existingByDispenser.set(`${e.sale_date}||${e.shift_name}||${e.dispenser_name}`, e);
    const oKey = `${e.sale_date}||${e.shift_name}||${e.operator_name}`;
    if (!usedOperators.has(oKey)) usedOperators.set(oKey, e.dispenser_name);
  }

  // Per-group validation against batch-fetched data, and precompute all normalized data for write phase
  let hasErrors = false;
  const validationResults = [];
  const intraDispenserKeys = new Map();
  const intraOperatorKeys = new Map();
  const meterReadingOverrides = new Map(); // nozzle_name -> closing from earlier group in this batch, for chaining
  const priceMapsByDate = new Map(); // sale_date -> priceMap (resolved lazily per date)
  
  for (const [key, g] of groups) {
    const csvRow = groupCsvRows.get(key) || 0;
    const errs = [];
    const disp = dispenserMap.get(g.dispenser_name);
    const op = operatorMap.get(g.operator_name);
    
    if (!disp) errs.push(`Dispenser not found: ${g.dispenser_name}`);
    else if (disp.status && !['Operational', 'Active'].includes(String(disp.status))) errs.push(`Dispenser is not available for sales entry: ${g.dispenser_name}`);

    if (!op) errs.push(`Operator not found: ${g.operator_name}`);
    else if (op.active === false) errs.push(`Operator is inactive: ${g.operator_name}`);

    if (!shiftSet.has(g.shift_name)) errs.push(`Shift not found: ${g.shift_name}`);

    const dKey = `${g.sale_date}||${g.shift_name}||${g.dispenser_name}`;
    if (existingByDispenser.has(dKey)) errs.push(`Sales entry already exists for ${g.sale_date}, ${g.shift_name}, dispenser ${g.dispenser_name}`);
    if (intraDispenserKeys.has(dKey)) errs.push(`Duplicate dispenser group within this batch for ${g.sale_date}, ${g.shift_name}, dispenser ${g.dispenser_name}`);
    intraDispenserKeys.set(dKey, true);

    const oKey = `${g.sale_date}||${g.shift_name}||${g.operator_name}`;
    if (usedOperators.has(oKey)) errs.push(`Operator ${g.operator_name} is already assigned to dispenser ${usedOperators.get(oKey)} for ${g.shift_name} on ${g.sale_date}`);
    if (intraOperatorKeys.has(oKey)) errs.push(`Duplicate operator within this batch for ${g.shift_name} on ${g.sale_date}`);
    intraOperatorKeys.set(oKey, g.dispenser_name);

    const nozzleNames = g.nozzle_readings.map((r) => r.nozzle_name);
    if (new Set(nozzleNames).size !== nozzleNames.length) errs.push('Each nozzle can be entered only once in a sales entry');

    // Precompute normalized readings and testings, and do full validation
    const normalizedReadings = [];
    const normalizedTestings = [];
    let grossSalesAmount = 0;
    let testingDeduction = 0;
    
    if (errs.length === 0 && disp && op && shiftSet.has(g.shift_name)) {
      // Resolve price map for this entry's specific sale_date (not from first date of batch)
      if (!priceMapsByDate.has(g.sale_date)) {
        priceMapsByDate.set(g.sale_date, await loadEffectivePriceMap(allProductNames, g.sale_date));
      }
      const priceMap = priceMapsByDate.get(g.sale_date);
      const dispNozzles = activeNozzlesByDispenser.get(g.dispenser_name) || [];
      const dispNozzleNames = dispNozzles.map((n) => n.name);
      
      for (const r of g.nozzle_readings) {
        const nn = r.nozzle_name;
        const closing = Number(r.closing_reading || 0);
        if (!dispNozzleNames.includes(nn)) {
          errs.push(`Nozzle "${nn}" is not an active nozzle of dispenser ${g.dispenser_name}`);
        } else {
          const nozzle = nozzlesByName.get(nn);
          const meter = metersByNozzle.get(nn);
          if (!meter) errs.push(`Meter not found for nozzle: ${nn}`);
          else {
            const effectiveMeterReading = meterReadingOverrides.has(nn)
              ? meterReadingOverrides.get(nn)
              : Number(meter.current_reading || 0);
            const opening = r.opening_reading != null ? Number(r.opening_reading) : effectiveMeterReading;
            if (closing < opening) {
              errs.push(`Closing reading for ${nn} (${closing}) must be >= opening reading (${opening})`);
            } else {
              const volume = closing - opening;
              const unitPrice = Number(priceMap.get(nozzle.product_name) || 0);
              const amount = Math.round(volume * unitPrice * 100) / 100;
              grossSalesAmount += amount;
              normalizedReadings.push({
                nozzle_name: nn,
                dispenser_name: g.dispenser_name,
                tank_name: nozzle.tank_name,
                product_name: nozzle.product_name,
                opening_reading: opening,
                closing_reading: closing,
                volume,
                unit_price: unitPrice,
                amount,
              });
            }
          }
        }
      }

      // Validate testings
      for (const t of g.testing_volumes) {
        const nn = t.nozzle_name;
        const nozzle = nozzlesByName.get(nn);
        if (!nozzle || nozzle.dispenser_name !== g.dispenser_name) {
          errs.push(`Nozzle "${nn}" does not belong to dispenser ${g.dispenser_name}`);
        } else {
          const productName = nozzle.product_name;
          const unitPrice = Number(priceMap.get(productName) || 0);
          const amount = Math.round(t.volume * unitPrice * 100) / 100;
          testingDeduction += amount;
          normalizedTestings.push({
            nozzle_name: nn,
            tank_name: nozzle.tank_name,
            product_name: productName,
            volume: t.volume,
            unit_price: unitPrice,
            amount,
            remarks: t.remarks,
          });
        }
      }

      // Update meter reading overrides so next group in this batch chains correctly
      for (const nr of normalizedReadings) {
        meterReadingOverrides.set(nr.nozzle_name, Number(nr.closing_reading));
      }
    }

    if (errs.length > 0) {
      hasErrors = true;
      validationResults.push({ _csvRow: csvRow, error: errs.join('; '), sale_date: g.sale_date, shift_name: g.shift_name, operator_name: g.operator_name, dispenser_name: g.dispenser_name });
    } else {
      const cashAmount = Number(g.cash_amount || 0);
      const onlineAmount = Number(g.online_amount || 0);
      const creditAmount = Number(g.credit_amount || 0);
      const totalSubmitted = Math.round((cashAmount + onlineAmount + creditAmount) * 100) / 100;
      const totalSalesAmount = Math.round((grossSalesAmount - testingDeduction) * 100) / 100;
      const variance = Math.round((totalSubmitted - totalSalesAmount) * 100) / 100;

      validationResults.push({
        key, g, csvRow,
        normalizedReadings,
        normalizedTestings,
        entryData: {
          sale_date: g.sale_date,
          shift_name: g.shift_name,
          operator_name: g.operator_name,
          dispenser_name: g.dispenser_name,
          cash_amount: cashAmount,
          online_amount: onlineAmount,
          credit_amount: creditAmount,
          total_submitted: totalSubmitted,
          total_sales_amount: totalSalesAmount,
          variance,
          status: 'submitted',
        }
      });
    }
  }

  if (hasErrors) {
    const allResults = validationResults.map((r) => {
      if (r.error) return { _csvRow: r._csvRow, error: r.error, sale_date: r.sale_date, shift_name: r.shift_name, operator_name: r.operator_name, dispenser_name: r.dispenser_name };
      return { _csvRow: r.csvRow, error: 'Some groups in this batch failed validation — no data was saved', sale_date: r.g.sale_date, shift_name: r.g.shift_name, operator_name: r.g.operator_name, dispenser_name: r.g.dispenser_name };
    });
    return res.status(400).json({ groups: groups.size, ok: 0, fail: groups.size, results: allResults, message: 'Validation failed. No data was saved.' });
  }

  // Phase 3 — Write ALL groups with atomic per-chunk rollback
  let ok = 0;
  let fail = 0;
  const finalResults = [];
  const committed = []; // track what to roll back

  try {
    for (const r of validationResults) {
      // Capture pre-write state for rollback
      const preMeterState = r.normalizedReadings.map((nr) => {
        const meter = metersByNozzle.get(nr.nozzle_name);
        if (!meter) throw new Error(`Meter data missing for nozzle: ${nr.nozzle_name} — refresh and retry`);
        return { meterId: meter.id, previousReading: Number(meter.current_reading) };
      });
      const preTankState = [...new Set(r.normalizedReadings.map((nr) => nr.tank_name).filter(Boolean))].map((tn) => {
        const tank = tanksByName.get(tn);
        if (!tank) throw new Error(`Tank data missing: ${tn} — refresh and retry`);
        return { tankId: tank.id, previousVolume: Number(tank.current_volume) };
      });
      const preBufferState = [...new Set(r.normalizedTestings.map((nt) => nt.product_name).filter(Boolean))].map(async (pn) => {
        const { data: bufferRow } = await supabase.from('buffer_tanks').select('id, volume').eq('product_name', pn).maybeSingle();
        return { productName: pn, id: bufferRow?.id || null, previousVolume: Number(bufferRow?.volume || 0) };
      });
      const preBufferResolved = await Promise.all(preBufferState);
      
      // Write entry, readings, testings
      const { data: entry, error: entryErr } = await supabase.from('daily_sales_entries').insert(r.entryData).select().single();
      if (entryErr) throw entryErr;
      
      if (r.normalizedReadings.length > 0) {
        const { error: readingsErr } = await supabase.from('daily_sales_nozzle_readings').insert(
          r.normalizedReadings.map((nr) => ({ sales_entry_id: entry.id, ...nr }))
        );
        if (readingsErr) {
          await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
          throw readingsErr;
        }
      }
      
      if (r.normalizedTestings.length > 0) {
        const { error: testingsErr } = await supabase.from('daily_sales_testing').insert(
          r.normalizedTestings.map((nt) => ({ sales_entry_id: entry.id, ...nt }))
        );
        if (testingsErr) {
          await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', entry.id);
          await supabase.from('daily_sales_entries').delete().eq('id', entry.id);
          throw testingsErr;
        }
      }

      // Apply side effects
      for (const nr of r.normalizedReadings) {
        const meter = metersByNozzle.get(nr.nozzle_name);
        if (!meter) throw new Error(`Meter data missing for nozzle: ${nr.nozzle_name} — refresh and retry`);
        await supabase.from('meters').update({ current_reading: nr.closing_reading }).eq('id', meter.id);
        meter.current_reading = nr.closing_reading; // update in-memory so next group chains correctly
        if (nr.tank_name) {
          const tank = tanksByName.get(nr.tank_name);
          if (!tank) throw new Error(`Tank data missing: ${nr.tank_name} — refresh and retry`);
          const nextVol = Math.max(0, Number(tank.current_volume) - Number(nr.volume));
          await supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tank.id);
          tank.current_volume = nextVol; // update in-memory so next group chains correctly
        }
      }
      for (const nt of r.normalizedTestings) {
        const productName = nt.product_name;
        const { data: bufferRow } = await supabase.from('buffer_tanks').select('id, volume').eq('product_name', productName).maybeSingle();
        if (!bufferRow) {
          await supabase.from('buffer_tanks').insert([{ product_name: productName, volume: Number(nt.volume) }]);
        } else {
          const nextVol = Number(bufferRow.volume) + Number(nt.volume);
          await supabase.from('buffer_tanks').update({ volume: nextVol }).eq('id', bufferRow.id);
        }
      }

      committed.push({
        entryId: entry.id,
        rollback: { preMeterState, preTankState, preBufferState: preBufferResolved }
      });
      ok++;
      finalResults.push({ _csvRow: r.csvRow, entry_id: entry.id, sale_date: r.g.sale_date, shift_name: r.g.shift_name, operator_name: r.g.operator_name, dispenser_name: r.g.dispenser_name });
    }
  } catch (writeErr) {
    // Roll back ALL changes
    for (const c of committed) {
      try {
        await supabase.from('daily_sales_testing').delete().eq('sales_entry_id', c.entryId);
        await supabase.from('daily_sales_nozzle_readings').delete().eq('sales_entry_id', c.entryId);
        await supabase.from('daily_sales_entries').delete().eq('id', c.entryId);
        for (const ms of c.rollback.preMeterState) {
          await supabase.from('meters').update({ current_reading: ms.previousReading }).eq('id', ms.meterId);
        }
        for (const ts of c.rollback.preTankState) {
          await supabase.from('tanks').update({ current_volume: ts.previousVolume }).eq('id', ts.tankId);
        }
        for (const bs of c.rollback.preBufferState) {
          if (bs.id) {
            await supabase.from('buffer_tanks').update({ volume: bs.previousVolume }).eq('id', bs.id);
          } else {
            await supabase.from('buffer_tanks').delete().eq('product_name', bs.productName);
          }
        }
      } catch (_) { /* best-effort */ }
    }
    finalResults.length = 0;
    for (const r of validationResults) {
      finalResults.push({ _csvRow: r.csvRow, error: `Rolled back: ${writeErr.message}`, sale_date: r.g.sale_date, shift_name: r.g.shift_name, operator_name: r.g.operator_name, dispenser_name: r.g.dispenser_name });
    }
    ok = 0;
    fail = validationResults.length;
    return res.status(400).json({ groups: groups.size, ok, fail, results: finalResults, message: 'Write failed. All data rolled back.' });
  }

  // Post-write price integrity check — verify stored unit_prices match loadEffectivePriceMap
  try {
    const priceIssues = [];
    for (const r of finalResults) {
      if (r.error) continue;
      const { data: verifyReadings, error: vErr } = await supabase
        .from('daily_sales_nozzle_readings')
        .select('id, product_name, unit_price')
        .eq('sales_entry_id', r.entry_id);
      if (vErr) continue;
      const verifyPriceMap = await loadEffectivePriceMap(
        [...new Set(verifyReadings.map((vr) => vr.product_name).filter(Boolean))],
        r.sale_date
      );
      for (const vr of verifyReadings || []) {
        const expected = Number(verifyPriceMap.get(vr.product_name));
        if (expected > 0 && Math.abs(Number(vr.unit_price) - expected) > 0.01) {
          priceIssues.push(`entry #${r.entry_id} ${r.sale_date} ${vr.product_name}: stored ${vr.unit_price} != expected ${expected}`);
        }
      }
    }
    if (priceIssues.length > 0) {
      console.warn('[PRICE MISMATCH] Post-write check found discrepancies:', priceIssues.join('; '));
      finalResults.push({ warning: `Price mismatch detected for ${priceIssues.length} reading(s). Verify and re-import affected entries.`, details: priceIssues });
    }
  } catch (verifyErr) {
    console.warn('[PRICE VERIFICATION] Failed:', verifyErr.message);
  }

  return res.status(200).json({ groups: groups.size, ok, fail, results: finalResults });
}

async function handleDipReadingCreate(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

  // Phase 1 — Pre-validate all rows first
  const validated = [];
  let hasErrors = false;
  for (const row of rows) {
    const csvRow = row._csvRow || 0;
    try {
      const cleanRow = { ...row };
      delete cleanRow._csvRow;
      // Pre-validate by checking the steps of createDipReading
      const readingDate = requireText(cleanRow.reading_date, 'Reading date');
      const tankName = requireText(cleanRow.tank_name, 'Tank');
      const dipMM = requireNonNegativeNumber(cleanRow.dip_mm, 'Dip (mm)');
      const readingType = requireText(cleanRow.reading_type, 'Reading type');
      if (!['opening', 'closing', 'intermediate'].includes(readingType)) {
        throw new Error(`Reading type must be one of: opening, closing, intermediate`);
      }
      const { tank, points } = await loadCalibrationPointsByTankName(tankName);
      const vol = interpolateVolume(points, dipMM);
      if (vol == null) throw new Error('No calibration data available for this tank');
      // Check for existing entry
      const { data: existing, error: existingErr } = await supabase
        .from('dip_readings')
        .select('id')
        .eq('reading_date', readingDate)
        .eq('tank_name', tank.name)
        .eq('reading_type', readingType)
        .maybeSingle();
      if (existingErr) throw existingErr;
      // Store for phase 2
      validated.push({ csvRow, cleanRow, tank, vol, readingType, existingId: existing?.id });
    } catch (e) {
      hasErrors = true;
      validated.push({ csvRow, error: String(e?.message || e) });
    }
  }

  if (hasErrors) {
    const allResults = validated.map((v) => {
      if (v.error) return { _csvRow: v.csvRow, error: v.error };
      return { _csvRow: v.csvRow, error: 'Some rows in this batch failed validation — no data was saved' };
    });
    return res.status(400).json({ ok: 0, fail: rows.length, results: allResults, message: 'Validation failed. No data was saved.' });
  }

  // Phase 2 — Write all rows with rollback on failure
  let ok = 0;
  let fail = 0;
  const finalResults = [];
  const modified = []; // { id, oldData, tank, readingType } for rollback
  try {
    for (const v of validated) {
      const { csvRow, cleanRow, tank, vol, readingType, existingId } = v;
      let data;
      if (existingId) {
        // Save old data for rollback
        const { data: oldData, error: oldErr } = await supabase.from('dip_readings').select('*').eq('id', existingId).single();
        if (oldErr) throw oldErr;
        modified.push({ id: existingId, oldData, tank, readingType, isNew: false });
        // Update existing
        const result = await supabase
          .from('dip_readings')
          .update({ dip_mm: cleanRow.dip_mm, volume_liters: vol })
          .eq('id', existingId)
          .select()
          .single();
        if (result.error) throw result.error;
        data = result.data;
      } else {
        // Insert new
        const result = await supabase
          .from('dip_readings')
          .insert([{ 
            reading_date: cleanRow.reading_date, 
            tank_name: tank.name, 
            dip_mm: cleanRow.dip_mm, 
            volume_liters: vol, 
            reading_type: readingType 
          }])
          .select()
          .single();
        if (result.error) throw result.error;
        data = result.data;
        modified.push({ id: data.id, oldData: null, tank, readingType, isNew: true });
      }
      // Update tank current volume if closing
      if (readingType === 'closing') {
        const { error: updErr } = await supabase.from('tanks').update({ current_volume: vol }).eq('id', tank.id);
        if (updErr) throw updErr;
      }
      ok++;
      finalResults.push({ _csvRow: csvRow, id: data.id });
    }
  } catch (writeErr) {
    // Rollback all changes
    for (const m of modified) {
      try {
        if (m.isNew) {
          // Delete new entry
          await supabase.from('dip_readings').delete().eq('id', m.id);
        } else {
          // Restore old data
          await supabase.from('dip_readings').update(m.oldData).eq('id', m.id);
        }
        // If it was a closing, restore tank volume (we don't track previous volume, so just sync to latest)
        if (m.readingType === 'closing') {
          await syncTankCurrentVolumeToLatestClosing(m.tank.name);
        }
      } catch (_) { /* best-effort */ }
    }
    finalResults.length = 0;
    for (const v of validated) {
      finalResults.push({ _csvRow: v.csvRow, error: `Rolled back: ${writeErr.message}` });
    }
    ok = 0;
    fail = rows.length;
    return res.status(400).json({ ok, fail, results: finalResults, message: 'Write failed. All data for this batch rolled back.' });
  }

  const status = ok === 0 && rows.length > 0 ? 400 : 201;
  return res.status(status).json({ ok, fail, results: finalResults });
}

async function syncTankCurrentVolumeToLatestClosing(tankName) {
  if (!tankName) return;
  const { data: latestClosing, error: closeErr } = await supabase
    .from('dip_readings')
    .select('volume_liters')
    .eq('tank_name', tankName)
    .eq('reading_type', 'closing')
    .order('reading_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (closeErr) throw closeErr;
  if (!latestClosing) return;
  const { error: updErr } = await supabase.from('tanks').update({ current_volume: Number(latestClosing.volume_liters || 0) }).eq('name', tankName);
  if (updErr) throw updErr;
}

async function handleDipReadingUpdate(req, res) {
  const body = req.body || {};
  const id = Number(body.id);
  if (!id) return res.status(400).json({ error: 'Dip reading ID is required' });

  const { data: existing, error: existingErr } = await supabase.from('dip_readings').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;

  const readingDate = requireText(body.reading_date ?? existing.reading_date, 'Reading date');
  const tankName = requireText(body.tank_name ?? existing.tank_name, 'Tank');
  const dipMM = requireNonNegativeNumber(body.dip_mm, 'Dip (mm)');
  const readingType = requireText(body.reading_type ?? existing.reading_type, 'Reading type');
  if (!['opening', 'closing', 'intermediate'].includes(readingType)) {
    throw new Error(`Reading type must be one of: opening, closing, intermediate`);
  }
  const { tank, points } = await loadCalibrationPointsByTankName(tankName);
  const vol = interpolateVolume(points, dipMM);
  if (vol == null) throw new Error('No calibration data available for this tank');

  const { data: conflict, error: conflictErr } = await supabase
    .from('dip_readings')
    .select('id')
    .eq('reading_date', readingDate)
    .eq('tank_name', tank.name)
    .eq('reading_type', readingType)
    .neq('id', id)
    .maybeSingle();
  if (conflictErr) throw conflictErr;
  if (conflict) {
    throw new Error(`A ${readingType} dip already exists for ${tank.name} on ${readingDate}`);
  }

  if (existing.reading_type === 'closing' && existing.tank_name !== tank.name) {
    const { data: oldAlternate, error: altErr } = await supabase
      .from('dip_readings')
      .select('id')
      .eq('tank_name', existing.tank_name)
      .eq('reading_type', 'closing')
      .neq('id', id)
      .limit(1)
      .maybeSingle();
    if (altErr) throw altErr;
    if (!oldAlternate) {
      throw new Error(`This closing dip cannot be moved to another tank because ${existing.tank_name} would be left without any closing reference. Delete is allowed only after another closing dip exists for that tank.`);
    }
  }

  const { data, error } = await supabase
    .from('dip_readings')
    .update({ reading_date: readingDate, tank_name: tank.name, dip_mm: dipMM, volume_liters: vol, reading_type: readingType })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  if (existing.reading_type === 'closing') await syncTankCurrentVolumeToLatestClosing(existing.tank_name);
  if (readingType === 'closing') await syncTankCurrentVolumeToLatestClosing(tank.name);

  return res.status(200).json(data);
}

async function handleDipReadingDelete(req, res) {
  const body = req.body || {};
  const id = Number(body.id);
  if (!id) return res.status(400).json({ error: 'Dip reading ID is required' });

  const { data: existing, error: existingErr } = await supabase.from('dip_readings').select('*').eq('id', id).single();
  if (existingErr) throw existingErr;

  if (existing.reading_type === 'closing') {
    const { data: alternate, error: altErr } = await supabase
      .from('dip_readings')
      .select('id')
      .eq('tank_name', existing.tank_name)
      .eq('reading_type', 'closing')
      .neq('id', id)
      .limit(1)
      .maybeSingle();
    if (altErr) throw altErr;
    if (!alternate) {
      throw new Error(`This closing dip cannot be deleted because it is the only closing reference for tank ${existing.tank_name}. Edit the dip value instead, or create another closing dip first.`);
    }
  }

  const { error } = await supabase.from('dip_readings').delete().eq('id', id);
  if (error) throw error;
  if (existing.reading_type === 'closing') await syncTankCurrentVolumeToLatestClosing(existing.tank_name);

  return res.status(200).json({ ok: true });
}

async function createDipReading(payload) {
  const body = payload || {};
  const readingDate = requireText(body.reading_date, 'Reading date');
  const tankName = requireText(body.tank_name, 'Tank');
  const dipMM = requireNonNegativeNumber(body.dip_mm, 'Dip (mm)');
  const readingType = requireText(body.reading_type, 'Reading type');
  if (!['opening', 'closing', 'intermediate'].includes(readingType)) {
    throw new Error(`Reading type must be one of: opening, closing, intermediate`);
  }

  const { tank, points } = await loadCalibrationPointsByTankName(tankName);
  const vol = interpolateVolume(points, dipMM);
  if (vol == null) throw new Error('No calibration data available for this tank');

  const { data: existing, error: existingErr } = await supabase
    .from('dip_readings')
    .select('id')
    .eq('reading_date', readingDate)
    .eq('tank_name', tank.name)
    .eq('reading_type', readingType)
    .maybeSingle();
  if (existingErr) throw existingErr;

  let data;
  if (existing?.id) {
    const result = await supabase
      .from('dip_readings')
      .update({ dip_mm: dipMM, volume_liters: vol })
      .eq('id', existing.id)
      .select()
      .single();
    if (result.error) throw result.error;
    data = result.data;
  } else {
    const result = await supabase
      .from('dip_readings')
      .insert([{ reading_date: readingDate, tank_name: tank.name, dip_mm: dipMM, volume_liters: vol, reading_type: readingType }])
      .select()
      .single();
    if (result.error) throw result.error;
    data = result.data;
  }

  // Physical stock is finalized only from day closing dip.
  if (readingType === 'closing') {
    const { error: updErr } = await supabase.from('tanks').update({ current_volume: vol }).eq('id', tank.id);
    if (updErr) throw updErr;
  }

  return data;
}

async function handleCalibrationImport(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

  const byTank = new Map();
  const tankCsvRows = new Map();
  for (const row of rows) {
    const tankName = requireText(row.tank_name, 'Tank');
    const dipMM = requireNonNegativeNumber(row.dip_mm, 'Dip (mm)');
    const volume = requireNonNegativeNumber(row.volume_liters, 'Volume (L)');
    if (!byTank.has(tankName)) {
      byTank.set(tankName, []);
      tankCsvRows.set(tankName, row._csvRow || 0);
    }
    byTank.get(tankName).push({ dip_mm: dipMM, volume_liters: volume });
  }

  // Phase 1 — Pre-validate all tanks and fetch old points
  const validated = [];
  let hasErrors = false;
  for (const [tankName, points] of byTank.entries()) {
    const csvRow = tankCsvRows.get(tankName) || 0;
    try {
      const tank = await safeSingle(
        supabase.from('tanks').select('id, name, capacity').eq('name', tankName),
        `Tank not found for calibration: ${tankName}`
      );
      validateChart(points, Number(tank.capacity));
      const { data: oldPoints, error: oldErr } = await supabase
        .from('tank_calibration')
        .select('dip_mm, volume_liters')
        .eq('tank_id', tank.id);
      if (oldErr) throw oldErr;
      validated.push({ tankName, points, csvRow, tank, oldPoints });
    } catch (e) {
      hasErrors = true;
      validated.push({ tankName, csvRow, error: String(e?.message || e) });
    }
  }

  if (hasErrors) {
    const allResults = validated.map((v) => {
      if (v.error) return { _csvRow: v.csvRow, tank_name: v.tankName, error: v.error };
      return { _csvRow: v.csvRow, tank_name: v.tankName, error: 'Some tanks in this batch failed validation — no data was saved' };
    });
    return res.status(400).json({ tanks: byTank.size, ok: 0, fail: byTank.size, results: allResults, message: 'Validation failed. No data was saved.' });
  }

  // Phase 2 — Write all tanks with rollback on failure
  let ok = 0;
  let fail = 0;
  const finalResults = [];
  const modifiedTanks = []; // { tankId, oldPoints, newPoints, tankName }
  try {
    for (const v of validated) {
      const { tank, points, oldPoints, csvRow, tankName } = v;
      // Delete existing points
      const { error: delErr } = await supabase.from('tank_calibration').delete().eq('tank_id', tank.id);
      if (delErr) throw delErr;
      // Insert new points
      const toInsert = points.map((p) => ({ tank_id: tank.id, dip_mm: p.dip_mm, volume_liters: p.volume_liters }));
      const { error: insErr } = await supabase.from('tank_calibration').insert(toInsert);
      if (insErr) {
        // Attempt to restore this tank first before rolling back all
        if (oldPoints && oldPoints.length > 0) {
          await supabase.from('tank_calibration').insert(oldPoints.map((p) => ({ tank_id: tank.id, dip_mm: p.dip_mm, volume_liters: p.volume_liters })));
        }
        throw insErr;
      }
      // Track for rollback
      modifiedTanks.push({ tankId: tank.id, oldPoints });
      ok++;
      finalResults.push({ _csvRow: csvRow, tank_name: tankName, points: points.length });
    }
  } catch (writeErr) {
    // Rollback all modified tanks
    for (const mt of modifiedTanks) {
      try {
        await supabase.from('tank_calibration').delete().eq('tank_id', mt.tankId);
        if (mt.oldPoints && mt.oldPoints.length > 0) {
          await supabase.from('tank_calibration').insert(mt.oldPoints.map((p) => ({ tank_id: mt.tankId, dip_mm: p.dip_mm, volume_liters: p.volume_liters })));
        }
      } catch (_) { /* best-effort */ }
    }
    // Prepare error results
    finalResults.length = 0;
    for (const v of validated) {
      finalResults.push({ _csvRow: v.csvRow, tank_name: v.tankName, error: `Rolled back: ${writeErr.message}` });
    }
    ok = 0;
    fail = byTank.size;
    const calStatus = 400;
    return res.status(calStatus).json({ tanks: byTank.size, ok, fail, results: finalResults, message: 'Write failed. All data for this batch rolled back.' });
  }

  const calStatus = ok === 0 && byTank.size > 0 ? 400 : 200;
  return res.status(calStatus).json({ tanks: byTank.size, ok, fail, results: finalResults });
}

async function handleBufferTransfer(req, res) {
  const body = req.body || {};
  const productName = requireText(body.product_name, 'Product');
  const tankName = requireText(body.tank_name, 'Tank');
  const volume = requireNonNegativeNumber(body.volume, 'Volume');

  const buffer = await safeSingle(
    supabase.from('buffer_tanks').select('id, volume').eq('product_name', productName),
    'Buffer not found for this product'
  );

  const tankRow = await safeSingle(
    supabase.from('tanks').select('id, current_volume, product_name').eq('name', tankName),
    'Tank not found'
  );
  if (tankRow.product_name && tankRow.product_name !== productName) {
    return res.status(400).json({ error: 'Selected tank does not match the chosen product' });
  }

  const reconciledBuffer = await reconcileBufferVolume(productName);
  if (reconciledBuffer < volume) {
    await supabase.from('buffer_tanks').update({ volume: reconciledBuffer }).eq('id', buffer.id);
    return res.status(400).json({ error: 'Insufficient buffer volume' });
  }

  const { error: moveErr } = await supabase.from('stock_movements').insert([{
    movement_date: new Date().toISOString().slice(0, 10),
    movement_type: 'IN',
    tank_name: tankName,
    product_name: productName,
    volume,
    reason: 'Testing Transfer',
  }]);
  if (moveErr) throw moveErr;

  const nextBuffer = reconciledBuffer - volume;
  const { error: updBufErr } = await supabase.from('buffer_tanks').update({ volume: nextBuffer, updated_at: new Date().toISOString() }).eq('id', buffer.id);
  if (updBufErr) throw updBufErr;

  const nextTank = Number(tankRow.current_volume || 0) + volume;
  const { error: updTankErr } = await supabase.from('tanks').update({ current_volume: nextTank }).eq('id', tankRow.id);
  if (updTankErr) throw updTankErr;

  return res.status(200).json({ ok: true, buffer_volume: nextBuffer, tank_volume: nextTank });
}

async function handleCashDepositCreate(req, res) {
  const body = req.body || {};
  const depositDate = requireText(body.deposit_date, 'Deposit date');
  const amount = requireNonNegativeNumber(body.amount, 'Amount');
  const bankAccountId = body.bank_account_id ? Number(body.bank_account_id) : null;
  const reference = optionalText(body.reference);

  // Look up bank account name if an ID was provided
  let bankName = null;
  if (bankAccountId) {
    const { data: bank, error: bankErr } = await supabase
      .from('bank_accounts')
      .select('bank_name')
      .eq('id', bankAccountId)
      .maybeSingle();
    if (bankErr) throw bankErr;
    if (!bank) throw new Error(`Bank account not found (ID: ${bankAccountId})`);
    bankName = bank.bank_name;
  }

  // Write cash_deposit record
  const { data: deposit, error: depErr } = await supabase
    .from('cash_deposits')
    .insert([{ deposit_date: depositDate, bank_account_id: bankAccountId, amount, reference }])
    .select()
    .single();
  if (depErr) throw depErr;

  // Write corresponding finance_transaction record (with rollback on failure)
  const { error: finErr } = await supabase
    .from('finance_transactions')
    .insert([{
      txn_date: depositDate,
      txn_type: 'Deposit',
      category: 'Cash Deposit',
      bank_account: bankName,
      amount,
      reference,
    }]);
  if (finErr) {
    await supabase.from('cash_deposits').delete().eq('id', deposit.id);
    throw finErr;
  }

  return res.status(201).json({ cash_deposit: deposit });
}

async function handleTankerUnloadingImport(req, res) {
  const rows = Array.isArray(req.body) ? req.body : [];
  if (rows.length === 0) return res.status(400).json({ error: 'No rows provided' });

  const groups = new Map();
  for (const row of rows) {
    const unloadDate = requireText(row.unload_date, 'Unload date');
    const tankerNumber = requireText(row.tanker_number, 'Tanker number');
    const key = `${unloadDate}||${tankerNumber}`;
    if (!groups.has(key)) {
      groups.set(key, {
        unload_date: unloadDate,
        tanker_number: tankerNumber,
        supplier_name: null,
        waybill_no: null,
        invoice_no: null,
        temperature: null,
        compartments: [],
        _csvRows: [],
      });
    }
    const g = groups.get(key);
    g._csvRows.push(row._csvRow || 0);
    if (g.supplier_name == null && row.supplier_name) g.supplier_name = String(row.supplier_name).trim();
    if (g.waybill_no == null && row.waybill_no) g.waybill_no = String(row.waybill_no).trim();
    if (g.invoice_no == null && row.invoice_no) g.invoice_no = String(row.invoice_no).trim();
    if (g.temperature == null && row.temperature != null && row.temperature !== '') {
      const t = Number(row.temperature);
      if (Number.isFinite(t)) g.temperature = t;
    }
    g.compartments.push({
      product_name: requireText(row.product_name, 'Product'),
      tank_name: requireText(row.tank_name, 'Tank'),
      tanker_qty: requireNonNegativeNumber(row.tanker_qty, 'Tanker qty'),
      dip_before_mm: requireNonNegativeNumber(row.dip_before_mm, 'Dip before (mm)'),
      dip_after_mm: requireNonNegativeNumber(row.dip_after_mm, 'Dip after (mm)'),
    });
  }

  // Pre-validate all groups before writing
  const validated = [];
  let hasErrors = false;
  for (const g of groups.values()) {
    const csvRow = g._csvRows[0] || 0;
    try {
      const normalizedLines = await normalizeTankerUnloadingCompartments(g.compartments);
      validated.push({ g, csvRow, normalizedLines });
    } catch (e) {
      hasErrors = true;
      validated.push({ g, csvRow, error: String(e?.message || e) });
    }
  }

  if (hasErrors) {
    const allResults = validated.map((v) => {
      if (v.error) return { _csvRow: v.csvRow, tanker_number: v.g.tanker_number, unload_date: v.g.unload_date, error: v.error };
      return { _csvRow: v.csvRow, tanker_number: v.g.tanker_number, unload_date: v.g.unload_date, error: 'Some groups in this batch failed validation — no data was saved' };
    });
    return res.status(400).json({ groups: groups.size, ok: 0, fail: groups.size, results: allResults, message: 'Validation failed. No data was saved.' });
  }

  // All pass — write everything
  let ok = 0, fail = 0;
  const finalResults = [];
  const createdHeaders = [];
  try {
    for (const { g, csvRow, normalizedLines } of validated) {
      const { data: header, error: headerErr } = await supabase
        .from('tanker_unloading_headers')
        .insert([{
          unload_date: g.unload_date,
          tanker_number: g.tanker_number,
          supplier_name: g.supplier_name,
          waybill_no: g.waybill_no,
          invoice_no: g.invoice_no,
          temperature: g.temperature,
        }])
        .select()
        .single();
      if (headerErr) throw headerErr;

      const linesToInsert = normalizedLines.map((l) => ({ header_id: header.id, ...l }));
      const { error: linesErr } = await supabase.from('tanker_unloading_lines').insert(linesToInsert);
      if (linesErr) {
        await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);
        throw linesErr;
      }

      const tankUpdates = [];
      for (const line of normalizedLines) {
        const { data: tankRow, error: tErr } = await supabase.from('tanks').select('id, current_volume').eq('name', line.tank_name).single();
        if (tErr) throw tErr;
        const nextVol = Number(tankRow.current_volume || 0) + Number(line.received_volume || 0);
        tankUpdates.push(supabase.from('tanks').update({ current_volume: nextVol }).eq('id', tankRow.id));
      }
      await Promise.all(tankUpdates);

      createdHeaders.push({ headerId: header.id, csvRow, tankerNumber: g.tanker_number, unloadDate: g.unload_date });
      ok++;
      finalResults.push({ _csvRow: csvRow, entry_id: header.id, tanker_number: g.tanker_number, unload_date: g.unload_date, compartments: normalizedLines.length });
    }
  } catch (writeErr) {
    for (const h of createdHeaders) {
      try {
        await supabase.from('tanker_unloading_lines').delete().eq('header_id', h.headerId);
        await supabase.from('tanker_unloading_headers').delete().eq('id', h.headerId);
      } catch (_) { /* best-effort */ }
    }
    finalResults.length = 0;
    for (const v of validated) {
      finalResults.push({ _csvRow: v.csvRow, tanker_number: v.g.tanker_number, unload_date: v.g.unload_date, error: `Rolled back: ${writeErr.message}` });
    }
    return res.status(400).json({ groups: groups.size, ok: 0, fail: groups.size, results: finalResults, message: 'Write failed. All data for this chunk rolled back.' });
  }

  return res.status(200).json({ groups: groups.size, ok, fail, results: finalResults });
}

async function handleTankerUnloadingUndo(req, res) {
  const { entry_ids } = req.body || {};
  const ids = Array.isArray(entry_ids) ? entry_ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'entry_ids array is required' });
  let ok = 0, fail = 0;
  const results = [];
  for (const id of ids) {
    try {
      const { data: header, error: hErr } = await supabase
        .from('tanker_unloading_headers')
        .select('id, unload_date')
        .eq('id', Number(id))
        .single();
      if (hErr) throw new Error(`Tanker unloading header ${id} not found`);

      const { data: lines, error: lErr } = await supabase
        .from('tanker_unloading_lines')
        .select('id, tank_name, received_volume')
        .eq('header_id', header.id);
      if (lErr) throw lErr;

      await supabase.from('tanker_unloading_lines').delete().eq('header_id', header.id);
      await supabase.from('tanker_unloading_headers').delete().eq('id', header.id);

      for (const line of lines || []) {
        const { data: tankRow, error: tErr } = await supabase
          .from('tanks')
          .select('id, current_volume')
          .eq('name', line.tank_name)
          .single();
        if (tErr) throw tErr;
        const prevVol = Math.max(0, Number(tankRow.current_volume || 0) - Number(line.received_volume || 0));
        const { error: uErr } = await supabase.from('tanks').update({ current_volume: prevVol }).eq('id', tankRow.id);
        if (uErr) throw uErr;
      }

      ok++;
      results.push({ entry_id: Number(id), status: 'deleted' });
    } catch (e) {
      fail++;
      results.push({ entry_id: Number(id), error: String(e?.message || e) });
    }
  }
  return res.status(ok === 0 ? 400 : 200).json({ ok, fail, results });
}

// ═══════════════════════════════════════════════════════════════════
// Finance Management & Credit Sales — new endpoints
// ═══════════════════════════════════════════════════════════════════

/**
 * GET /api/credit-sales/pending?date_from=&date_to=
 * Returns date-wise credit amounts from daily_sales_entries that have
 * not yet been fully allocated to credit_sales records.
 */
async function handleCreditSalesPending(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const params = new URL(req.url, 'http://localhost').searchParams;
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';

  // 1. Fetch all daily_sales_entries that have credit_amount > 0
  let salesQuery = supabase
    .from('daily_sales_entries')
    .select('id, sale_date, shift_name, operator_name, dispenser_name, credit_amount, total_sales_amount')
    .gt('credit_amount', 0)
    .order('sale_date', { ascending: false })
    .order('id', { ascending: false });
  if (dateFrom) salesQuery = salesQuery.gte('sale_date', dateFrom);
  if (dateTo) salesQuery = salesQuery.lte('sale_date', dateTo);
  const { data: salesEntries, error: salesErr } = await salesQuery;
  if (salesErr) throw salesErr;

  // 2. Fetch all existing credit_sales records to see what's been allocated
  let creditQuery = supabase
    .from('credit_sales')
    .select('id, sale_date, daily_sales_entry_id, customer_name, amount, status, settled_amount');
  if (dateFrom) creditQuery = creditQuery.gte('sale_date', dateFrom);
  if (dateTo) creditQuery = creditQuery.lte('sale_date', dateTo);
  const { data: existingCredits, error: creditErr } = await creditQuery;
  if (creditErr) throw creditErr;

  // 3. Group existing credits by daily_sales_entry_id and sum allocated amounts
  const allocatedByEntry = new Map();
  for (const c of existingCredits || []) {
    if (c.daily_sales_entry_id) {
      const key = String(c.daily_sales_entry_id);
      allocatedByEntry.set(key, (allocatedByEntry.get(key) || 0) + Number(c.amount || 0));
    }
  }

  // 4. Build pending list: for each sales entry, compute remaining unallocated credit
  const pending = [];
  for (const entry of salesEntries || []) {
    const totalCredit = Number(entry.credit_amount || 0);
    const allocated = allocatedByEntry.get(String(entry.id)) || 0;
    const remaining = Math.round((totalCredit - allocated) * 100) / 100;
    if (remaining > 0.001) {
      pending.push({
        daily_sales_entry_id: entry.id,
        sale_date: entry.sale_date,
        shift_name: entry.shift_name,
        operator_name: entry.operator_name,
        dispenser_name: entry.dispenser_name,
        total_credit_amount: totalCredit,
        allocated_amount: allocated,
        pending_amount: remaining,
      });
    }
  }

  return res.status(200).json({ pending, existing: existingCredits || [] });
}

/**
 * POST /api/credit-sales/settle
 * Body: { id, settled_amount, settlement_method, settled_date }
 * Marks a credit sale as settled and creates corresponding deposit transaction.
 */
async function handleCreditSalesSettle(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { id, settled_amount, settlement_method, settled_date } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Credit sale ID is required' });
  if (!settled_amount || Number(settled_amount) <= 0) return res.status(400).json({ error: 'Settled amount must be greater than 0' });
  if (!settlement_method || !['Cash', 'Online'].includes(settlement_method)) {
    return res.status(400).json({ error: 'Settlement method must be Cash or Online' });
  }

  // Fetch the credit sale
  const { data: creditSale, error: fetchErr } = await supabase
    .from('credit_sales')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr || !creditSale) return res.status(404).json({ error: 'Credit sale not found' });

  const amount = Number(settled_amount);
  const currentSettled = Number(creditSale.settled_amount || 0);
  const totalAmount = Number(creditSale.amount || 0);
  const newTotalSettled = currentSettled + amount;

  if (newTotalSettled > totalAmount + 0.01) {
    return res.status(400).json({ error: `Settled amount (${newTotalSettled}) exceeds total amount (${totalAmount})` });
  }

  // Determine new status
  let newStatus = 'Pending';
  if (newTotalSettled >= totalAmount - 0.01) newStatus = 'Settled';
  else if (newTotalSettled > 0) newStatus = 'Partial';

  // Update credit_sales record only — no finance_transactions side-effect
  const { error: updateErr } = await supabase
    .from('credit_sales')
    .update({
      settled_amount: newTotalSettled,
      settled_date: settled_date || new Date().toISOString().slice(0, 10),
      settlement_method,
      status: newStatus,
    })
    .eq('id', id);
  if (updateErr) throw updateErr;

  return res.status(200).json({ ok: true, status: newStatus, settled_amount: newTotalSettled });
}

/**
 * GET /api/finance/summary?date_from=&date_to=
 * Returns date-wise summary: total sales, deposits, expenses, shortage.
 */
async function handleFinanceSummary(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const params = new URL(req.url, 'http://localhost').searchParams;
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';

  // 1. Fetch daily sales entries for total sales
  let salesQuery = supabase
    .from('daily_sales_entries')
    .select('sale_date, total_sales_amount, cash_amount, online_amount, credit_amount');
  if (dateFrom) salesQuery = salesQuery.gte('sale_date', dateFrom);
  if (dateTo) salesQuery = salesQuery.lte('sale_date', dateTo);
  const { data: salesEntries, error: salesErr } = await salesQuery;
  if (salesErr) throw salesErr;

  // 2. Fetch finance transactions
  let txnQuery = supabase
    .from('finance_transactions')
    .select('txn_date, txn_type, category, sub_category, amount, remarks');
  if (dateFrom) txnQuery = txnQuery.gte('txn_date', dateFrom);
  if (dateTo) txnQuery = txnQuery.lte('txn_date', dateTo);
  const { data: txns, error: txnErr } = await txnQuery;
  if (txnErr) throw txnErr;

  // 3. Group by date
  const dateMap = new Map();

  // Seed with sales data
  for (const entry of salesEntries || []) {
    const d = entry.sale_date;
    if (!dateMap.has(d)) dateMap.set(d, { date: d, total_sales: 0, cash_sales: 0, online_sales: 0, credit_sales: 0, deposits: 0, deposit_detail: {}, expenses: 0, expense_detail: {}, shortage: 0 });
    const bucket = dateMap.get(d);
    bucket.total_sales += Number(entry.total_sales_amount || 0);
    bucket.cash_sales += Number(entry.cash_amount || 0);
    bucket.online_sales += Number(entry.online_amount || 0);
    bucket.credit_sales += Number(entry.credit_amount || 0);
  }

  // Add transaction data
  for (const txn of txns || []) {
    const d = txn.txn_date;
    if (!dateMap.has(d)) dateMap.set(d, { date: d, total_sales: 0, cash_sales: 0, online_sales: 0, credit_sales: 0, deposits: 0, deposit_detail: {}, expenses: 0, expense_detail: {}, shortage: 0 });
    const bucket = dateMap.get(d);
    if (txn.txn_type === 'Deposit') {
      bucket.deposits += Number(txn.amount || 0);
      const key = txn.sub_category || txn.category || 'Other';
      bucket.deposit_detail[key] = (bucket.deposit_detail[key] || 0) + Number(txn.amount || 0);
    } else if (txn.txn_type === 'Expense') {
      bucket.expenses += Number(txn.amount || 0);
      const key = txn.sub_category || txn.category || 'Other';
      bucket.expense_detail[key] = (bucket.expense_detail[key] || 0) + Number(txn.amount || 0);
    }
  }

  // Compute shortage per date
  for (const [, bucket] of dateMap) {
    const totalInflow = bucket.cash_sales + bucket.online_sales;
    bucket.shortage = Math.round((totalInflow - bucket.deposits) * 100) / 100;
  }

  const summary = [...dateMap.values()].sort((a, b) => a.date > b.date ? -1 : 1);

  return res.status(200).json(summary);
}

/**
 * GET /api/finance/ledger?date_from=&date_to=
 * Returns ledger: opening + deposits - expenses = closing, computed cumulatively.
 */
async function handleFinanceLedger(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const params = new URL(req.url, 'http://localhost').searchParams;
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';

  // Fetch ALL finance transactions (sorted by date ascending for cumulative calc)
  let txnQuery = supabase
    .from('finance_transactions')
    .select('txn_date, txn_type, category, sub_category, amount, remarks')
    .order('txn_date', { ascending: true })
    .order('id', { ascending: true });
  if (dateFrom) txnQuery = txnQuery.gte('txn_date', dateFrom);
  if (dateTo) txnQuery = txnQuery.lte('txn_date', dateTo);
  const { data: txns, error: txnErr } = await txnQuery;
  if (txnErr) throw txnErr;

  // If dateFrom is specified, compute opening balance from all prior transactions
  let openingBalance = 0;
  if (dateFrom) {
    const { data: priorTxns, error: priorErr } = await supabase
      .from('finance_transactions')
      .select('txn_type, amount')
      .lt('txn_date', dateFrom);
    if (priorErr) throw priorErr;
    for (const t of priorTxns || []) {
      if (t.txn_type === 'Deposit') openingBalance += Number(t.amount || 0);
      else if (t.txn_type === 'Expense') openingBalance -= Number(t.amount || 0);
    }
  }

  // Group by date
  const dateMap = new Map();
  for (const txn of txns || []) {
    const d = txn.txn_date;
    if (!dateMap.has(d)) dateMap.set(d, { date: d, deposits: 0, expenses: 0, deposit_detail: {}, expense_detail: {} });
    const bucket = dateMap.get(d);
    if (txn.txn_type === 'Deposit') {
      bucket.deposits += Number(txn.amount || 0);
      const key = txn.sub_category || txn.category || 'Other';
      bucket.deposit_detail[key] = (bucket.deposit_detail[key] || 0) + Number(txn.amount || 0);
    } else if (txn.txn_type === 'Expense') {
      bucket.expenses += Number(txn.amount || 0);
      const key = txn.sub_category || txn.category || 'Other';
      bucket.expense_detail[key] = (bucket.expense_detail[key] || 0) + Number(txn.amount || 0);
    }
  }

  // Build ledger entries with running balance
  let running = openingBalance;
  const ledger = [];
  for (const [, bucket] of dateMap) {
    const opening = running;
    const closing = opening + bucket.deposits - bucket.expenses;
    running = closing;
    ledger.push({
      date: bucket.date,
      opening_balance: Math.round(opening * 100) / 100,
      deposits: Math.round(bucket.deposits * 100) / 100,
      expenses: Math.round(bucket.expenses * 100) / 100,
      closing_balance: Math.round(closing * 100) / 100,
      deposit_detail: bucket.deposit_detail,
      expense_detail: bucket.expense_detail,
    });
  }

  // If no data in range but we have an opening, show one row
  if (ledger.length === 0 && dateFrom) {
    ledger.push({
      date: dateFrom,
      opening_balance: Math.round(openingBalance * 100) / 100,
      deposits: 0,
      expenses: 0,
      closing_balance: Math.round(openingBalance * 100) / 100,
      deposit_detail: {},
      expense_detail: {},
    });
  }

  return res.status(200).json({ opening_balance: Math.round(openingBalance * 100) / 100, ledger: ledger.reverse() });
}

/**
 * POST /api/finance/bulk
 * Body: { transactions: [{ txn_date, txn_type, category, sub_category, amount, remarks }, ...] }
 * Inserts multiple finance_transactions in one call.
 */
async function handleFinanceBulk(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { transactions } = req.body || {};
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'transactions array is required' });
  }

  // Filter out rows with empty/zero amount
  const validRows = transactions.filter((t) => t.amount && Number(t.amount) > 0);
  if (validRows.length === 0) {
    return res.status(400).json({ error: 'No valid transactions (all amounts are empty or zero)' });
  }

  // Validate each row
  for (let i = 0; i < validRows.length; i++) {
    const t = validRows[i];
    if (!t.txn_date) return res.status(400).json({ error: `Row ${i + 1}: date is required` });
    if (!t.txn_type || !['Expense', 'Deposit'].includes(t.txn_type)) return res.status(400).json({ error: `Row ${i + 1}: type must be Expense or Deposit` });
    if (!t.remarks || !String(t.remarks).trim()) return res.status(400).json({ error: `Row ${i + 1}: remarks are required` });
  }

  // Insert all valid rows
  const rows = validRows.map((t) => ({
    txn_date: t.txn_date,
    txn_type: t.txn_type,
    category: t.category || '',
    sub_category: t.sub_category || '',
    amount: Number(t.amount),
    remarks: String(t.remarks).trim(),
  }));

  const { data, error } = await supabase.from('finance_transactions').insert(rows).select();
  if (error) throw error;

  return res.status(200).json({ ok: true, count: data.length, inserted: data });
}

/**
 * GET /api/credit-sales/report?date_from=&date_to=&customer=&status=
 * Returns all credit_sales records with filters for the report page.
 */
async function handleCreditSalesReport(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const params = new URL(req.url, 'http://localhost').searchParams;
  const dateFrom = params.get('date_from') || '';
  const dateTo = params.get('date_to') || '';
  const customer = params.get('customer') || '';
  const status = params.get('status') || '';

  let query = supabase
    .from('credit_sales')
    .select('*')
    .order('sale_date', { ascending: false })
    .order('id', { ascending: false });

  if (dateFrom) query = query.gte('sale_date', dateFrom);
  if (dateTo) query = query.lte('sale_date', dateTo);
  if (customer) query = query.ilike('customer_name', `%${customer}%`);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;

  return res.status(200).json(data || []);
}
