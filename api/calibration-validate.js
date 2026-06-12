export function validateChart(points, tankCapacity) {
  const errors = [];

  if (!Array.isArray(points) || points.length < 2) {
    errors.push('At least 2 calibration points are required');
    return { valid: false, errors };
  }

  const usesDipMM = points.some((p) => p && p.dip_mm != null && p.dip_mm !== '');
  const usesDipCM = points.some((p) => p && p.dip_cm != null && p.dip_cm !== '');
  const dipLabel = usesDipMM || !usesDipCM ? 'dip_mm' : 'dip_cm';

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dip = dipLabel === 'dip_mm'
      ? Number(p.dip_mm)
      : Number(p.dip_cm) * 10;
    const vol = Number(p.volume_liters);

    if (isNaN(dip) || !isFinite(dip) || dip < 0) {
      errors.push(`Row ${i + 1}: ${dipLabel} must be a non-negative number`);
    }
    if (isNaN(vol) || !isFinite(vol) || vol < 0) {
      errors.push(`Row ${i + 1}: volume_liters must be a non-negative number`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  const normalized = points.map((p) => ({
    dip_mm: dipLabel === 'dip_mm' ? Number(p.dip_mm) : Number(p.dip_cm) * 10,
    volume_liters: Number(p.volume_liters),
  }));
  points.length = 0;
  points.push(...normalized);

  for (let i = 1; i < points.length; i++) {
    if (points[i].dip_mm <= points[i - 1].dip_mm) {
      errors.push(`Row ${i + 1}: ${dipLabel} must be strictly greater than row ${i} (${points[i - 1].dip_mm} >= ${points[i].dip_mm})`);
    }
    if (points[i].volume_liters < points[i - 1].volume_liters) {
      errors.push(`Row ${i + 1}: volume_liters must not decrease as dip increases (${points[i - 1].volume_liters} > ${points[i].volume_liters})`);
    }
  }

  const dips = points.map((p) => p.dip_mm);
  if (new Set(dips).size !== dips.length) {
    errors.push(`Duplicate ${dipLabel} values are not allowed`);
  }

  if (tankCapacity != null && points[points.length - 1].volume_liters > tankCapacity * 1.05) {
    errors.push(`Last volume (${points[points.length - 1].volume_liters}L) exceeds tank capacity (${tankCapacity}L) by more than 5%`);
  }

  return { valid: errors.length === 0, errors };
}
