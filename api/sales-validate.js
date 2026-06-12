function requiredText(value, label) {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${label} is required`);
  return v;
}

function optionalText(value) {
  const v = String(value ?? '').trim();
  return v || null;
}

function optionalNumber(value, label) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number`);
  return n;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export async function normalizeSalesRows(rows, supabase) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (list.length === 0) throw new Error('At least one sales row is required');

  const productNames = [...new Set(list.map((row) => String(row?.product_name ?? '').trim()).filter(Boolean))];
  const nozzleNames = [...new Set(list.map((row) => String(row?.nozzle_name ?? '').trim()).filter(Boolean))];

  const productMap = new Map();
  if (productNames.length > 0) {
    const { data, error } = await supabase.from('products').select('name, current_price').in('name', productNames);
    if (error) throw error;
    for (const product of data || []) productMap.set(product.name, product);
  }

  const nozzleMap = new Map();
  if (nozzleNames.length > 0) {
    const { data, error } = await supabase.from('nozzles').select('name, product_name').in('name', nozzleNames);
    if (error) throw error;
    for (const nozzle of data || []) nozzleMap.set(nozzle.name, nozzle);
  }

  return list.map((row, index) => {
    const rowLabel = list.length > 1 ? `Row ${index + 1}: ` : '';
    const saleDate = requiredText(row?.sale_date, `${rowLabel}Sale date`);
    const productName = requiredText(row?.product_name, `${rowLabel}Product`);
    const operatorName = requiredText(row?.operator_name, `${rowLabel}Operator`);
    const shiftName = requiredText(row?.shift_name, `${rowLabel}Shift`);
    const nozzleName = optionalText(row?.nozzle_name);

    const openingReading = optionalNumber(row?.opening_reading, `${rowLabel}Opening reading`);
    const closingReading = optionalNumber(row?.closing_reading, `${rowLabel}Closing reading`);
    const testingVolume = optionalNumber(row?.testing_volume, `${rowLabel}Testing volume`) ?? 0;
    const providedSaleVolume = optionalNumber(row?.sale_volume, `${rowLabel}Sale volume`);
    const providedUnitPrice = optionalNumber(row?.unit_price, `${rowLabel}Unit price`);
    const providedLossGain = optionalNumber(row?.loss_gain, `${rowLabel}Loss/gain`);

    if (testingVolume < 0) throw new Error(`${rowLabel}Testing volume cannot be negative`);
    if (openingReading != null && openingReading < 0) throw new Error(`${rowLabel}Opening reading cannot be negative`);
    if (closingReading != null && closingReading < 0) throw new Error(`${rowLabel}Closing reading cannot be negative`);

    let saleVolume = providedSaleVolume;
    if (openingReading != null || closingReading != null) {
      if (openingReading == null || closingReading == null) {
        throw new Error(`${rowLabel}Opening and closing readings must both be provided`);
      }
      if (closingReading < openingReading) {
        throw new Error(`${rowLabel}Closing reading must be greater than or equal to opening reading`);
      }
      const grossVolume = closingReading - openingReading;
      const netVolume = grossVolume - testingVolume;
      if (netVolume < 0) {
        throw new Error(`${rowLabel}Testing volume cannot exceed gross meter movement`);
      }
      saleVolume = netVolume;
    }

    if (saleVolume == null) throw new Error(`${rowLabel}Sale volume or meter readings are required`);
    if (saleVolume < 0) throw new Error(`${rowLabel}Sale volume cannot be negative`);

    let unitPrice = providedUnitPrice;
    if (unitPrice == null) {
      const product = productMap.get(productName);
      const fallbackPrice = optionalNumber(product?.current_price, `${rowLabel}Product current price`);
      unitPrice = fallbackPrice;
    }
    if (unitPrice == null) throw new Error(`${rowLabel}Unit price is required`);
    if (unitPrice < 0) throw new Error(`${rowLabel}Unit price cannot be negative`);

    if (nozzleName) {
      const nozzle = nozzleMap.get(nozzleName);
      if (nozzle?.product_name && nozzle.product_name !== productName) {
        throw new Error(`${rowLabel}Selected nozzle does not match the chosen product`);
      }
    }

    return {
      sale_date: saleDate,
      nozzle_name: nozzleName,
      product_name: productName,
      operator_name: operatorName,
      shift_name: shiftName,
      opening_reading: openingReading ?? 0,
      closing_reading: closingReading ?? 0,
      testing_volume: testingVolume,
      sale_volume: saleVolume,
      unit_price: unitPrice,
      total_amount: round2(saleVolume * unitPrice),
      loss_gain: providedLossGain ?? 0,
    };
  });
}
