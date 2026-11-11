"use client";
import { useRef, useState } from "react";
import { MapCtx, outToSrc, srcToOut } from "@/lib/masks";
export type RMode = "clone" | "heal" | "spot" | "remove";
/** Captures clicks and strokes on the photo while the Retouch tab is open. Coordinates leave this component in source space. */
export default function RetouchOverlay({ ctx, mode, mark, onPoint, onStroke }: { ctx: MapCtx; mode: RMode; mark: [number, number] | null; onPoint: (p: [number, number]) => void; onStroke: (pts: [number, number][]) => void }) {
  const ref = useRef<SVGSVGElement>(null); const [trail, setTrail] = useState<[number, number][]>([]);
  const toSrc = (e: { clientX: number; clientY: number }) => { const r = ref.current!.getBoundingClientRect(); return outToSrc((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, ctx); };
  const down = (e: React.PointerEvent) => {
    e.stopPropagation(); const first = toSrc(e);
    if (mode !== "remove") { onPoint(first); return; }
    const pts: [number, number][] = [first]; setTrail([first]);
    const mv = (ev: PointerEvent) => { const p = toSrc(ev), l = pts[pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.004) { pts.push(p); setTrail([...pts]); } };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); setTrail([]); onStroke(pts); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  const m = mark ? srcToOut(mark[0], mark[1], ctx) : null;
  return (<svg ref={ref} data-testid="retouch-overlay" className="absolute inset-0 h-full w-full">
    <rect width="100%" height="100%" fill="transparent" style={{ cursor: "crosshair" }} onPointerDown={down} />
    {trail.map((p, i) => { const o = srcToOut(p[0], p[1], ctx); return <circle key={i} cx={`${o[0] * 100}%`} cy={`${o[1] * 100}%`} r={5} fill="#ff4d4d" fillOpacity={0.55} style={{ pointerEvents: "none" }} />; })}
    {m && <g style={{ pointerEvents: "none" }}><circle cx={`${m[0] * 100}%`} cy={`${m[1] * 100}%`} r={9} fill="none" stroke="#5aa2ff" strokeWidth={2} /><circle cx={`${m[0] * 100}%`} cy={`${m[1] * 100}%`} r={2} fill="#5aa2ff" /></g>}
  </svg>);
}
