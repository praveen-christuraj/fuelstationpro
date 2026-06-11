export function validateChart(points, tankCapacity) {
  const errors = [];

  if (!Array.isArray(points) || points.length < 2) {
    errors.push('At least 2 calibration points are required');
    return { valid: false, errors };
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dip = Number(p.dip_cm);
    const vol = Number(p.volume_liters);

    if (isNaN(dip) || !isFinite(dip) || dip < 0) {
      errors.push(`Row ${i + 1}: dip_cm must be a non-negative number`);
    }
    if (isNaN(vol) || !isFinite(vol) || vol < 0) {
      errors.push(`Row ${i + 1}: volume_liters must be a non-negative number`);
    }
  }
  if (errors.length > 0) return { valid: false, errors };

  for (let i = 0; i < points.length; i++) {
    p.dip_cm = Number(p.dip_cm);
    p.volume_liters = Number(p.volume_liters);
  }

  for (let i = 1; i < points.length; i++) {
    if (points[i].dip_cm <= points[i - 1].dip_cm) {
      errors.push(`Row ${i + 1}: dip_cm must be strictly greater than row ${i} (${points[i - 1].dip_cm} >= ${points[i].dip_cm})`);
    }
    if (points[i].volume_liters < points[i - 1].volume_liters) {
      errors.push(`Row ${i + 1}: volume_liters must not decrease as dip increases (${points[i - 1].volume_liters} > ${points[i].volume_liters})`);
    }
  }

  const dips = points.map((p) => p.dip_cm);
  if (new Set(dips).size !== dips.length) {
    errors.push('Duplicate dip_cm values are not allowed');
  }

  if (tankCapacity != null && points[points.length - 1].volume_liters > tankCapacity * 1.05) {
    errors.push(`Last volume (${points[points.length - 1].volume_liters}L) exceeds tank capacity (${tankCapacity}L) by more than 5%`);
  }

  return { valid: errors.length === 0, errors };
}
