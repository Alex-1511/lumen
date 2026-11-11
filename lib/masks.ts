// Local adjustment layers: a mask (+ optional luminance / colour-range limiters) and a set of adjustments.
// Masks are stored parametrically in SOURCE-normalised coordinates (0..1, top-left origin), so they stay attached
// to the picture content when the crop or straighten angle changes.
import type { EditParams } from "./params";

export type MaskType = "full" | "linear" | "radial" | "luminance" | "color" | "brush";
export interface Stroke { pts: [number, number][]; size: number; feather: number; flow: number; erase: boolean } // size: fraction of long edge
export interface LocalAdjust { exposure: number; contrast: number; highlights: number; shadows: number; temperature: number; saturation: number; clarity: number; texture: number;
  // effects inside the mask (optional so older saved projects still load)
  sharpen?: number; blur?: number; motion?: number; mosaic?: number; soft?: number; fade?: number; grain?: number }
export interface LocalLayer {
  id: string; name: string; visible: boolean; opacity: number; // opacity = mask density 0..1
  type: MaskType; invert: boolean; feather: number;             // feather 0..1
  linear: [number, number, number, number];                     // x0,y0,x1,y1 (full effect at p0 side, none at p1)
  radial: [number, number, number, number];                     // cx,cy,rx,ry
  lum: { on: boolean; lo: number; hi: number; soft: number };   // intersect: luminance range
  color: { on: boolean; hue: number; range: number; satMin: number }; // intersect: hue range (deg)
  strokes: Stroke[];
  adjust: LocalAdjust;
  source?: "user" | "ai"; note?: string;                        // provenance + honest labelling
}

export const zeroAdjust = (): LocalAdjust => ({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, saturation: 0, clarity: 0, texture: 0, sharpen: 0, blur: 0, motion: 0, mosaic: 0, soft: 0, fade: 0, grain: 0 });
export const ADJUST_KEYS = Object.keys(zeroAdjust()) as (keyof LocalAdjust)[];
export const MAX_LOCALS = 4;

export function newLayer(type: MaskType, name?: string): LocalLayer {
  return {
    id: Math.random().toString(36).slice(2, 9), name: name ?? ({ full: "Whole image", linear: "Linear gradient", radial: "Radial gradient", luminance: "Luminance range", color: "Colour range", brush: "Brush" } as const)[type],
    visible: true, opacity: 1, type, invert: false, feather: 0.5,
    linear: [0.5, 0.15, 0.5, 0.55], radial: [0.5, 0.5, 0.3, 0.3],
    lum: { on: type === "luminance", lo: 0, hi: 0.35, soft: 0.1 }, color: { on: type === "color", hue: 210, range: 35, satMin: 0.12 },
    strokes: [], adjust: zeroAdjust(), source: "user",
  };
}

/** Approximate subject/background masks: an ellipse fitted to a bounding box. Honest label: not a segmentation. */
export function subjectEllipse(box: { x: number; y: number; w: number; h: number }, invert: boolean): LocalLayer {
  const l = newLayer("radial", invert ? "Background (approx.)" : "Subject (approx.)");
  l.radial = [box.x + box.w / 2, box.y + box.h / 2, Math.max(0.05, box.w / 2 * 1.15), Math.max(0.05, box.h / 2 * 1.15)]; l.feather = 0.45; l.invert = invert;
  l.note = "Ellipse fitted to a detected bounding box. It is NOT a pixel-accurate subject mask.";
  return l;
}
/** Sky preset: top-weighted gradient intersected with a blue colour range. Heuristic. */
export function skyLayer(): LocalLayer {
  const l = newLayer("linear", "Sky (heuristic)"); l.linear = [0.5, 0.0, 0.5, 0.6]; l.color = { on: true, hue: 215, range: 45, satMin: 0.08 }; l.feather = 0.6;
  l.note = "Gradient from the top, limited to blue hues. Fails on grey, sunset or very overcast skies."; return l;
}

// ---- coordinate mapping, mirrors the shader's srcUv() ----
export interface MapCtx { srcW: number; srcH: number; crop: EditParams["crop"]; straighten: number }
export function zoomFor(ctx: MapCtx) { const a = Math.abs((ctx.straighten * Math.PI) / 180); const cw = ctx.crop.w * ctx.srcW, ch = ctx.crop.h * ctx.srcH; const ar = cw / ch; return a < 1e-6 ? 1 : Math.cos(a) + Math.max(ar, 1 / ar) * Math.sin(a); }
/** output-normalised (0..1, top-left) -> source-normalised */
export function outToSrc(u: number, v: number, ctx: MapCtx): [number, number] {
  const cw = ctx.crop.w * ctx.srcW, ch = ctx.crop.h * ctx.srcH, z = zoomFor(ctx), a = (-ctx.straighten * Math.PI) / 180;
  const px = (u - 0.5) * cw / z, py = (v - 0.5) * ch / z, c = Math.cos(a), s = Math.sin(a);
  const rx = c * px - s * py, ry = s * px + c * py;
  return [(rx + (ctx.crop.x + ctx.crop.w / 2) * ctx.srcW) / ctx.srcW, (ry + (ctx.crop.y + ctx.crop.h / 2) * ctx.srcH) / ctx.srcH];
}
/** source-normalised -> output-normalised (inverse of outToSrc) */
export function srcToOut(sx: number, sy: number, ctx: MapCtx): [number, number] {
  const cw = ctx.crop.w * ctx.srcW, ch = ctx.crop.h * ctx.srcH, z = zoomFor(ctx), a = (-ctx.straighten * Math.PI) / 180;
  const rx = sx * ctx.srcW - (ctx.crop.x + ctx.crop.w / 2) * ctx.srcW, ry = sy * ctx.srcH - (ctx.crop.y + ctx.crop.h / 2) * ctx.srcH, c = Math.cos(a), s = Math.sin(a);
  const px = c * rx + s * ry, py = -s * rx + c * ry;
  return [(px * z) / cw + 0.5, (py * z) / ch + 0.5];
}

/** CPU reference of the shader's mask value (for tests and for the overlay), excluding limiters that need pixel colour. */
export function geometryMask(l: LocalLayer, sx: number, sy: number, aspect: number): number {
  let m = 1;
  if (l.type === "linear") {
    const [x0, y0, x1, y1] = l.linear; const dx = (x1 - x0) * aspect, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
    const t = ((sx - x0) * aspect * dx + (sy - y0) * dy) / len2; // 0 at p0, 1 at p1
    const f = Math.max(0.001, l.feather); m = 1 - smooth(0.5 - f / 2, 0.5 + f / 2, t);
  } else if (l.type === "radial") {
    const [cx, cy, rx, ry] = l.radial; const d = Math.hypot((sx - cx) / Math.max(rx, 1e-3), (sy - cy) / Math.max(ry, 1e-3));
    const f = Math.max(0.001, l.feather); m = 1 - smooth(1 - f, 1, d);
  }
  return m;
}
export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };

/** Rasterise brush strokes into a mask canvas (R channel). Size is capped so painting stays interactive. */
export function rasteriseStrokes(strokes: Stroke[], srcW: number, srcH: number, canvas: HTMLCanvasElement, longEdge = 1024) {
  const sc = Math.min(1, longEdge / Math.max(srcW, srcH)); canvas.width = Math.max(1, Math.round(srcW * sc)); canvas.height = Math.max(1, Math.round(srcH * sc));
  const g = canvas.getContext("2d")!; g.fillStyle = "#000"; g.fillRect(0, 0, canvas.width, canvas.height);
  const L = Math.max(canvas.width, canvas.height);
  for (const s of strokes) {
    const r = Math.max(1, s.size * L / 2); const step = Math.max(1, r * 0.25);
    const dab = (x: number, y: number) => { const gr = g.createRadialGradient(x, y, r * (1 - s.feather), x, y, r); const c = s.erase ? "0,0,0" : "255,255,255"; gr.addColorStop(0, `rgba(${c},${s.flow})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
    for (let i = 0; i < s.pts.length; i++) {
      const [x, y] = [s.pts[i][0] * canvas.width, s.pts[i][1] * canvas.height]; dab(x, y);
      if (i > 0) { const [px, py] = [s.pts[i - 1][0] * canvas.width, s.pts[i - 1][1] * canvas.height]; const d = Math.hypot(x - px, y - py); for (let t = step; t < d; t += step) dab(px + ((x - px) * t) / d, py + ((y - py) * t) / d); }
    }
  }
}
