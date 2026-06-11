import { useState } from 'react';

export function BarChart({ data, height = 200, color = '#2563eb', valueFmt }: { data: { label: string; value: number }[]; height?: number; color?: string; valueFmt?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {hover === i && (
              <div className="absolute -top-1 bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">{valueFmt ? valueFmt(d.value) : d.value}</div>
            )}
            <div className="w-full rounded-t-md transition-all duration-300" style={{ height: `${(d.value / max) * 100}%`, background: hover === i ? color : color + 'cc', minHeight: 2 }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        {data.map((d, i) => <div key={i} className="flex-1 text-center text-[10px] text-slate-400 truncate">{d.label}</div>)}
      </div>
    </div>
  );
}

export function LineChart({ data, height = 200, color = '#2563eb', valueFmt }: { data: { label: string; value: number }[]; height?: number; color?: string; valueFmt?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 600, h = height;
  const pad = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((d.value - min) / range) * (h - pad * 2);
    return { x, y, ...d };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${path} L${pts[pts.length - 1]?.x || 0},${h} L${pts[0]?.x || 0},${h} Z`;
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs><linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill={`url(#g-${color})`} />
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill="white" stroke={color} strokeWidth="2" />
            <rect x={p.x - 15} y={0} width={30} height={h} fill="transparent" />
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {data.map((d, i) => <span key={i} className="text-[10px] text-slate-400">{d.label}</span>)}
      </div>
      {hover != null && pts[hover] && (
        <div className="text-xs text-slate-600 mt-1 text-center font-medium">{pts[hover].label}: {valueFmt ? valueFmt(pts[hover].value) : pts[hover].value}</div>
      )}
    </div>
  );
}

export function DonutChart({ data, size = 180 }: { data: { label: string; value: number; color: string }[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - 16;
  const cx = size / 2, cy = size / 2;
  let acc = 0;
  const segs = data.map((d) => {
    const frac = d.value / total;
    const start = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const end = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`, color: d.color };
  });
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segs.map((s, i) => <path key={i} d={s.d} fill={s.color} />)}
        <circle cx={cx} cy={cy} r={r * 0.58} fill="white" />
      </svg>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="text-slate-400 ml-auto">{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
