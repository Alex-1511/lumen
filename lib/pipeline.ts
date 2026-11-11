// Shared render pipeline: used by the editor's export and by batch export. Everything is re-derived from the
// untouched original blob + stored parameters, exactly as the editor does it.
import { Renderer } from "./renderer";
import { clamp, compose, EditParams } from "./params";
import { Analysis, analyse } from "./analysis";
import { plan as makePlan, recipeLocals, recipeToParams } from "./planner";
import { LocalLayer, MAX_LOCALS, rasteriseStrokes } from "./masks";
import type { Project } from "./store";
import { focusFrom } from "./effects";
import { resolveFx } from "./fx";
import { RetouchOp, retouchedCanvas } from "./retouch";
import { outputSharpen } from "./outsharp";
import { ExportOpts, drawWatermark, encodeTiff, extFor } from "./export";
import { lanczosResize } from "./resample";
import { browserDeflate, encodePng16, sdrToPq16 } from "./hdr";

const validBox = (b: any) => b && [b.x, b.y, b.w, b.h].every((n: any) => typeof n === "number" && isFinite(n)) && b.w > 0.02 && b.h > 0.02;

export function analyseBitmap(b: ImageBitmap): Analysis {
  const s = Math.min(1, 640 / Math.max(b.width, b.height)), a = document.createElement("canvas"); a.width = Math.round(b.width * s); a.height = Math.round(b.height * s);
  const g = a.getContext("2d")!; g.drawImage(b, 0, 0, a.width, a.height); return analyse(g.getImageData(0, 0, a.width, a.height).data, a.width, a.height);
}

export interface ResolvedState { params: EditParams; locals: LocalLayer[]; airlight: number; focus?: [number, number, number, number]; retouch?: RetouchOp[]; lut?: import("./lut").LutState }
/** The same layer composition the editor performs: AI recipe (scaled by opacity) + manual layer, plus local layers. */
export function resolveState(p: Pick<Project, "genre" | "intent" | "ai" | "enabled" | "aiOpacity" | "manual" | "locals" | "retouch" | "fx" | "lut"> & { width?: number; height?: number }, a: Analysis): ResolvedState {
  const pl = makePlan(a, { genre: p.genre === "unknown" ? undefined : p.genre, intent: p.intent, subjectBox: validBox((p.ai as any)?.subjectBox) });
  const aiLayer = recipeToParams(pl.items, p.enabled);
  const params = compose(aiLayer, p.aiOpacity, p.manual);
  const locals = [...recipeLocals(pl.items, p.enabled, p.aiOpacity), ...(p.locals ?? [])].slice(0, MAX_LOCALS);
  const fr = resolveFx(params, locals, p.fx, { w: p.width ?? 1500, h: p.height ?? 1000 });
  return { params: fr.params, locals: fr.locals, airlight: clamp(a.p99, 0.7, 1), focus: focusFrom(a, validBox((p.ai as any)?.subjectBox)), retouch: p.retouch, lut: p.lut };
}

export interface ExportStats { changedPct: number; meanDiff: number; comparable: boolean }
export interface ExportResult { blob: Blob; w: number; h: number; downscaled: boolean; resized: "none" | "down" | "up"; stats: ExportStats; range: "sdr" | "hdr"; ext: string }

/** How different is the render from the untouched original? Evidence that an export really is edited pixels, not the source. */
export function diffStats(orig: ImageBitmap, out: HTMLCanvasElement, geometryChanged: boolean): ExportStats {
  const w = 96, h = Math.max(1, Math.round((96 * out.height) / out.width)); const mk = (src: CanvasImageSource) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(src, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
  const a = mk(orig), b = mk(out); let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) { const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; sum += d; if (d > 2) n++; }
  return { changedPct: (100 * n) / (w * h), meanDiff: sum / (w * h), comparable: !geometryChanged };
}

export async function renderExport(b: ImageBitmap, srcW: number, srcH: number, st: ResolvedState, o: ExportOpts): Promise<ExportResult> {
  const c = document.createElement("canvas"), r = new Renderer(c), cap = r.maxTexture, s = Math.min(1, cap / Math.max(b.width, b.height));
  let src: ImageBitmap | HTMLCanvasElement = b;
  if (s < 1) { const t = document.createElement("canvas"); t.width = Math.round(b.width * s); t.height = Math.round(b.height * s); t.getContext("2d")!.drawImage(b, 0, 0, t.width, t.height); src = t; }
  if (st.retouch?.length) src = retouchedCanvas(src, st.retouch); // clone / heal / spot / object removal replayed on the original pixels
  r.setImage(src);
  for (let i = 0; i < MAX_LOCALS; i++) { const l = st.locals[i]; if (!l || l.type !== "brush") { r.setBrush(i, null, "empty"); continue; } const cv = document.createElement("canvas"); rasteriseStrokes(l.strokes, srcW, srcH, cv); r.setBrush(i, cv, `${l.id}:${l.strokes.length}`); }
  const native = Math.min(Math.max(b.width, b.height), cap), want = o.edge || native;
  // Render at the source resolution (or directly at the target when it is close), then resample with Lanczos for large size changes.
  const renderEdge = want >= native ? native : want < native * 0.7 ? native : want;
  const size = r.render(st.params, renderEdge, { seed: 1, locals: st.locals, airlight: st.airlight, focus: st.focus, lut: st.lut });
  let out = document.createElement("canvas"); out.width = size.w; out.height = size.h; let g = out.getContext("2d", { willReadFrequently: true })!; g.drawImage(c, 0, 0, size.w, size.h);
  const hdr = o.range === "hdr"; const target = hdr ? Math.min(want, 3840) : want; // a 16-bit 8K PNG would be ~240 MB and exhaust browser memory
  let resized: ExportResult["resized"] = "none";
  if (Math.max(size.w, size.h) !== target) {
    const k = target / Math.max(size.w, size.h), dw = Math.max(1, Math.round(size.w * k)), dh = Math.max(1, Math.round(size.h * k)); const px = g.getImageData(0, 0, size.w, size.h);
    const res = lanczosResize(px.data, size.w, size.h, dw, dh); const o2 = document.createElement("canvas"); o2.width = dw; o2.height = dh; o2.getContext("2d")!.putImageData(new ImageData(res, dw, dh), 0, 0); out = o2; g = o2.getContext("2d", { willReadFrequently: true })!; resized = k < 1 ? "down" : "up";
  }
  const geom = Math.abs(st.params.straighten) > 0.01 || Math.abs(st.params.distortion) > 0.01 || Math.abs(st.params.perspV) > 0.01 || Math.abs(st.params.perspH) > 0.01 || !!(st.params as any).crop;
  if (o.sharpen && o.sharpen !== "off") { const id = g.getImageData(0, 0, out.width, out.height); outputSharpen(id.data, out.width, out.height, o.sharpen); g.putImageData(id, 0, 0); }
  const stats = diffStats(b, out, geom);
  if (o.watermark?.text.trim()) drawWatermark(g, out.width, out.height, o.watermark);
  let blob: Blob | null, ext = extFor(o.fmt);
  if (hdr) { const id = g.getImageData(0, 0, out.width, out.height); const rgb = sdrToPq16(id.data, out.width, out.height, o.peak ?? 1000); blob = new Blob([(await encodePng16(rgb, out.width, out.height, browserDeflate, true)) as BlobPart], { type: "image/png" }); ext = "png"; }
  else if (o.fmt === "image/tiff") { const id = g.getImageData(0, 0, out.width, out.height); blob = new Blob([encodeTiff(id.data, out.width, out.height) as BlobPart], { type: "image/tiff" }); }
  else blob = await new Promise<Blob | null>((res) => out.toBlob(res, o.fmt, o.q / 100));
  if (!blob) throw new Error("Browser could not encode " + o.fmt);
  return { blob, w: out.width, h: out.height, downscaled: s < 1, resized, stats, range: hdr ? "hdr" : "sdr", ext };
}

export const statsLine = (s: ExportStats) => s.comparable ? `Edited pixels: ${s.changedPct.toFixed(0)}% differ from the original (mean change ${s.meanDiff.toFixed(1)}/255).${s.changedPct < 1 ? " Warning: this is essentially the original. Nothing visible was changed." : ""}` : "Geometry (straighten, lens or perspective) changed, so a pixel comparison with the original is not meaningful.";

export function download(blob: Blob, name: string) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
