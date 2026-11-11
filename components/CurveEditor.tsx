"use client";
// Interactive master tone curve. Click empty space to add a point, drag to move, double-click an inner point to delete.
// Endpoints keep x fixed at 0 and 1 (they can move vertically to lift blacks or pull whites).
import { useRef, useState } from "react";
import { buildCurveLUT, clamp } from "@/lib/params";

type Pt = [number, number];
const MAX_POINTS = 12, MIN_GAP = 0.02, SIZE = 220, PAD = 8;

export default function CurveEditor({ points, onLive, onCommit }: { points: Pt[]; onLive: (p: Pt[]) => void; onCommit: (p: Pt[], label: string) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const inner = SIZE - PAD * 2;
  const X = (x: number) => PAD + x * inner, Y = (y: number) => PAD + (1 - y) * inner;
  const lut = buildCurveLUT(pts);
  const path = Array.from({ length: 64 }, (_, i) => { const t = i / 63; return `${i ? "L" : "M"}${X(t).toFixed(1)},${Y(lut[Math.round(t * 255)]).toFixed(1)}`; }).join(" ");
  const toCurve = (e: React.PointerEvent): Pt => { const r = ref.current!.getBoundingClientRect(); const k = SIZE / r.width; return [clamp(((e.clientX - r.left) * k - PAD) / inner, 0, 1), clamp(1 - ((e.clientY - r.top) * k - PAD) / inner, 0, 1)]; };
  const move = (i: number, p: Pt): Pt[] => {
    const n = pts.map((q) => [...q] as Pt); const last = n.length - 1;
    const lo = i === 0 ? 0 : n[i - 1][0] + MIN_GAP, hi = i === last ? 1 : n[i + 1][0] - MIN_GAP;
    n[i] = [i === 0 ? 0 : i === last ? 1 : clamp(p[0], lo, hi), clamp(p[1], 0, 1)]; return n;
  };
  const down = (e: React.PointerEvent) => {
    const p = toCurve(e); let best = -1, bd = 0.06; pts.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
    if (best < 0) { if (pts.length >= MAX_POINTS) return; const n = [...pts, p].sort((a, b) => a[0] - b[0]) as Pt[]; best = n.findIndex((q) => q === p); onLive(n); }
    ref.current!.setPointerCapture(e.pointerId); setDrag(best);
  };
  const onMove = (e: React.PointerEvent) => { if (drag == null) return; const n = move(drag, toCurve(e)); onLive(n); };
  const up = (e: React.PointerEvent) => { if (drag == null) return; const n = move(drag, toCurve(e)); setDrag(null); onCommit(n, "Curve: custom"); };
  const del = (i: number) => { if (i === 0 || i === pts.length - 1) return; const n = pts.filter((_, j) => j !== i); onCommit(n, "Curve: point removed"); };
  const dbl = (e: React.MouseEvent) => { const r = ref.current!.getBoundingClientRect(); const k = SIZE / r.width; const p: Pt = [clamp(((e.clientX - r.left) * k - PAD) / inner, 0, 1), clamp(1 - ((e.clientY - r.top) * k - PAD) / inner, 0, 1)]; let best = -1, bd = 0.07; pts.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } }); if (best >= 0) del(best); };
  return (
    <div>
      <svg ref={ref} data-testid="curve-editor" viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[220px] bg-bg border border-line touch-none select-none cursor-crosshair" onPointerDown={down} onPointerMove={onMove} onPointerUp={up} onDoubleClick={dbl}>
        {[0.25, 0.5, 0.75].map((g) => <g key={g}><line x1={X(g)} x2={X(g)} y1={PAD} y2={SIZE - PAD} stroke="currentColor" opacity={0.12} /><line y1={Y(g)} y2={Y(g)} x1={PAD} x2={SIZE - PAD} stroke="currentColor" opacity={0.12} /></g>)}
        <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke="currentColor" opacity={0.25} strokeDasharray="3 3" />
        <path d={path} fill="none" stroke="var(--acc, #5aa2ff)" strokeWidth={1.6} />
        {pts.map((q, i) => <circle key={i} data-testid="curve-point" cx={X(q[0])} cy={Y(q[1])} r={drag === i ? 5.5 : 4} fill="var(--acc, #5aa2ff)" stroke="#000" strokeWidth={1} />)}
      </svg>
      <div className="flex gap-1 mt-1"><button className="border border-line px-2 py-0.5 text-[11px] hover:border-acc" onClick={() => onCommit([[0, 0], [1, 1]], "Curve: reset")}>Reset</button></div>
      <p className="text-mute text-[11px] mt-1">Click to add a point, drag to move, double-click to remove. Master curve only (no per-channel).</p>
    </div>
  );
}
