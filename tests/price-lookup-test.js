import test from 'node:test';
import assert from 'node:assert/strict';

// Exact replica of loadEffectivePriceMap logic from api/index.js:626 (with Date fix)
function loadEffectivePriceMap(productNames, targetDate) {
  const uniqueNames = [...new Set((productNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
  const priceMap = new Map();
  if (uniqueNames.length === 0) return priceMap;

  // Simulated price_history data (sorted by effective_date ASC)
  const historyRows = {
    Petrol: [
      { product_name: 'Petrol', old_price: 0, new_price: 100, effective_date: '2026-06-01' },
      { product_name: 'Petrol', old_price: 100, new_price: 102.5, effective_date: '2026-06-10' },
      { product_name: 'Petrol', old_price: 102.5, new_price: 105, effective_date: '2026-06-20' },
    ],
    Diesel: [
      { product_name: 'Diesel', old_price: 0, new_price: 90, effective_date: '2026-06-05' },
    ],
  };

  const historyByProduct = new Map();
  for (const productName of uniqueNames) {
    historyByProduct.set(productName, historyRows[productName] || []);
  }

  for (const productName of uniqueNames) {
    const history = historyByProduct.get(productName) || [];
    if (history.length === 0) {
      priceMap.set(productName, 0);
      continue;
    }

    const firstRow = history[0];
    let resolvedPrice = Number(firstRow.old_price ?? 0);
    if (!Number.isFinite(resolvedPrice)) resolvedPrice = 0;

    for (const row of history) {
      const rawDate = row.effective_date;
      const effDate = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate || '');
      if (effDate > targetDate) break;
      resolvedPrice = Number(row.new_price || 0);
    }

    priceMap.set(productName, resolvedPrice);
  }

  return priceMap;
}

// Also test with potential Date-object behavior (simulates Supabase returning Date objects)
function loadEffectivePriceMapWithDateObjects(productNames, targetDate) {
  const uniqueNames = [...new Set((productNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
  const priceMap = new Map();
  if (uniqueNames.length === 0) return priceMap;

  // Simulate Supabase returning Date objects instead of strings
  const historyRows = {
    Petrol: [
      { product_name: 'Petrol', old_price: 0, new_price: 100, effective_date: new Date('2026-06-01') },
      { product_name: 'Petrol', old_price: 100, new_price: 102.5, effective_date: new Date('2026-06-10') },
      { product_name: 'Petrol', old_price: 102.5, new_price: 105, effective_date: new Date('2026-06-20') },
    ],
  };

  const historyByProduct = new Map();
  for (const productName of uniqueNames) {
    historyByProduct.set(productName, historyRows[productName] || []);
  }

  for (const productName of uniqueNames) {
    const history = historyByProduct.get(productName) || [];
    if (history.length === 0) {
      priceMap.set(productName, 0);
      continue;
    }

    const firstRow = history[0];
    let resolvedPrice = Number(firstRow.old_price ?? 0);
    if (!Number.isFinite(resolvedPrice)) resolvedPrice = 0;

    for (const row of history) {
      const rawDate = row.effective_date;
      const effDate = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate || '');
      if (effDate > targetDate) break;
      resolvedPrice = Number(row.new_price || 0);
    }

    priceMap.set(productName, resolvedPrice);
  }

  return priceMap;
}

test('loadEffectivePriceMap — date before first price uses 0', () => {
  const map = loadEffectivePriceMap(['Petrol'], '2026-05-30');
  assert.equal(map.get('Petrol'), 0, 'Before first price record should be 0');
});

test('loadEffectivePriceMap — exact first effective_date uses new_price', () => {
  const map = loadEffectivePriceMap(['Petrol'], '2026-06-01');
  assert.equal(map.get('Petrol'), 100, 'On first effective_date should use new_price=100');
});

test('loadEffectivePriceMap — between two prices uses prior new_price', () => {
  const map = loadEffectivePriceMap(['Petrol'], '2026-06-05');
  assert.equal(map.get('Petrol'), 100, 'Between June 1 and June 10 should use 100');
});

test('loadEffectivePriceMap — exact second effective_date uses second new_price', () => {
  const map = loadEffectivePriceMap(['Petrol'], '2026-06-10');
  assert.equal(map.get('Petrol'), 102.5, 'On June 10 should use new_price=102.5');
});

test('loadEffectivePriceMap — date after last effective uses last new_price', () => {
  const map = loadEffectivePriceMap(['Petrol'], '2026-06-25');
  assert.equal(map.get('Petrol'), 105, 'After June 20 should use latest new_price=105');
});

test('loadEffectivePriceMap — no records returns 0', () => {
  const map = loadEffectivePriceMap(['XPTOil'], '2026-06-15');
  assert.equal(map.get('XPTOil'), 0, 'Unknown product returns 0');
});

test('loadEffectivePriceMap — diesel exact date', () => {
  const map = loadEffectivePriceMap(['Diesel'], '2026-06-05');
  assert.equal(map.get('Diesel'), 90, 'On Diesel effective_date should use new_price=90');
});

test('loadEffectivePriceMap — diesel before date returns 0', () => {
  const map = loadEffectivePriceMap(['Diesel'], '2026-06-01');
  assert.equal(map.get('Diesel'), 0, 'Before Diesel price record returns 0');
});

// CRITICAL TEST: what if Supabase returns Date objects?
test('loadEffectivePriceMap WITH Date objects — before first price', () => {
  // With the fix, Date objects are converted via toISOString(), so this should work
  const map = loadEffectivePriceMapWithDateObjects(['Petrol'], '2026-05-30');
  assert.equal(map.get('Petrol'), 0, 'Before first price record should be 0');
});

test('loadEffectivePriceMap WITH Date objects — exact first date', () => {
  // With the fix, Date objects should now resolve correctly
  const map = loadEffectivePriceMapWithDateObjects(['Petrol'], '2026-06-01');
  assert.equal(map.get('Petrol'), 100, 'On first effective_date should use new_price=100');
});

test('loadEffectivePriceMap WITH Date objects — between dates', () => {
  const map = loadEffectivePriceMapWithDateObjects(['Petrol'], '2026-06-05');
  assert.equal(map.get('Petrol'), 100, 'Between June 1 and June 10 should use 100');
});

test('loadEffectivePriceMap WITH Date objects — second date', () => {
  const map = loadEffectivePriceMapWithDateObjects(['Petrol'], '2026-06-10');
  assert.equal(map.get('Petrol'), 102.5, 'On June 10 should use new_price=102.5');
});

test('loadEffectivePriceMap WITH Date objects — after last date', () => {
  const map = loadEffectivePriceMapWithDateObjects(['Petrol'], '2026-06-25');
  assert.equal(map.get('Petrol'), 105, 'After last should use latest new_price=105');
});
