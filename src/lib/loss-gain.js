/**
 * @typedef {{ product_name?: string | null, received_volume?: number | string | null }} UnloadRow
 * @typedef {{ product_name?: string | null, movement_type?: string | null, volume?: number | string | null, reason?: string | null }} MoveRow
 * @typedef {{ product_name?: string | null, sale_volume?: number | string | null, testing_volume?: number | string | null }} SaleRow
 * @typedef {{ product_name?: string | null, current_volume?: number | string | null }} TankRow
 * @typedef {{ product: string, receipts: number, adjIn: number, adjOut: number, sold: number, testing: number, tankVol: number, bookStock: number, variance: number }} LossGainRow
 */

/**
 * @param {{ sales?: SaleRow[], tanks?: TankRow[], moves?: MoveRow[], unloads?: UnloadRow[] }} params
 * @returns {LossGainRow[]}
 */
export function buildLossGainRows({ sales = [], tanks = [], moves = [], unloads = [] }) {
  const byProduct = {};

  const ensure = (product) => {
    byProduct[product] = byProduct[product] || { receipts: 0, adjIn: 0, adjOut: 0, sold: 0, testing: 0 };
    return byProduct[product];
  };

  unloads.forEach((u) => {
    const key = u.product_name || 'Other';
    ensure(key).receipts += Number(u.received_volume || 0);
  });

  moves.forEach((m) => {
    const key = m.product_name || 'Other';
    const row = ensure(key);
    const reason = String(m.reason || '').trim().toLowerCase();
    const isReceiptMove = reason === 'tanker receipt';

    if (m.movement_type === 'IN') {
      if (!isReceiptMove) row.adjIn += Number(m.volume || 0);
    } else if (m.movement_type === 'OUT') {
      row.adjOut += Number(m.volume || 0);
    }
  });

  sales.forEach((s) => {
    const key = s.product_name || 'Other';
    const row = ensure(key);
    row.sold += Number(s.sale_volume || 0);
    row.testing += Number(s.testing_volume || 0);
  });

  return Object.entries(byProduct).map(([product, data]) => {
    const tankVol = tanks
      .filter((t) => t.product_name === product)
      .reduce((sum, tank) => sum + Number(tank.current_volume || 0), 0);
    const bookStock = data.receipts + data.adjIn - data.adjOut - data.sold - data.testing;
    const variance = tankVol - bookStock;

    return { product, ...data, tankVol, bookStock, variance };
  });
}
