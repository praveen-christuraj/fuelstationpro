export function interpolateVolume(points: { dip_mm: number; volume_liters: number }[], dipMM: number): number | null {
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
