function requiredText(value, label) {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${label} is required`);
  return v;
}

function optionalText(value) {
  const v = String(value ?? '').trim();
  return v || null;
}

function requiredPositiveNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} must be greater than 0`);
  return n;
}

function optionalNumber(value, label) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number`);
  return n;
}

async function buildTankMap(rows, supabase) {
  const tankNames = [...new Set(rows.map((row) => String(row?.tank_name ?? '').trim()).filter(Boolean))];
  const tankMap = new Map();
  if (tankNames.length === 0) return tankMap;

  const { data, error } = await supabase.from('tanks').select('name, product_name').in('name', tankNames);
  if (error) throw error;
  for (const tank of data || []) tankMap.set(tank.name, tank);
  return tankMap;
}

export async function normalizeStockMovementRows(rows, supabase) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) throw new Error('At least one stock movement row is required');

  const tankMap = await buildTankMap(list, supabase);

  return list.map((row, index) => {
    const rowLabel = list.length > 1 ? `Row ${index + 1}: ` : '';
    const movementDate = requiredText(row?.movement_date, `${rowLabel}Movement date`);
    const movementType = requiredText(row?.movement_type, `${rowLabel}Movement type`).toUpperCase();
    const tankName = requiredText(row?.tank_name, `${rowLabel}Tank`);
    const productName = requiredText(row?.product_name, `${rowLabel}Product`);
    const volume = requiredPositiveNumber(row?.volume, `${rowLabel}Volume`);
    const reason = optionalText(row?.reason);

    if (!['IN', 'OUT'].includes(movementType)) {
      throw new Error(`${rowLabel}Movement type must be IN or OUT`);
    }

    const tank = tankMap.get(tankName);
    if (tank?.product_name && tank.product_name !== productName) {
      throw new Error(`${rowLabel}Selected tank does not match the chosen product`);
    }

    return {
      movement_date: movementDate,
      movement_type: movementType,
      tank_name: tankName,
      product_name: productName,
      volume,
      reason,
    };
  });
}

export async function normalizeTankerUnloadingRows(rows, supabase) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) throw new Error('At least one unloading row is required');

  const tankMap = await buildTankMap(list, supabase);

  return list.map((row, index) => {
    const rowLabel = list.length > 1 ? `Row ${index + 1}: ` : '';
    const unloadDate = requiredText(row?.unload_date, `${rowLabel}Unload date`);
    const supplierName = requiredText(row?.supplier_name, `${rowLabel}Supplier`);
    const tankName = requiredText(row?.tank_name, `${rowLabel}Tank`);
    const productName = requiredText(row?.product_name, `${rowLabel}Product`);
    const declaredVolume = requiredPositiveNumber(row?.declared_volume, `${rowLabel}Declared volume`);
    const receivedVolume = requiredPositiveNumber(row?.received_volume, `${rowLabel}Received volume`);
    const invoiceNo = optionalText(row?.invoice_no);
    const temperature = optionalNumber(row?.temperature, `${rowLabel}Temperature`);

    const tank = tankMap.get(tankName);
    if (tank?.product_name && tank.product_name !== productName) {
      throw new Error(`${rowLabel}Selected tank does not match the chosen product`);
    }

    return {
      unload_date: unloadDate,
      supplier_name: supplierName,
      tank_name: tankName,
      product_name: productName,
      invoice_no: invoiceNo,
      declared_volume: declaredVolume,
      received_volume: receivedVolume,
      temperature,
    };
  });
}
