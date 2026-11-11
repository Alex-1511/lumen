// Headless job runner: the SAME pipeline as the editor (analysis, manual layer, effects, retouch, WebGL render, Lanczos/HDR export), used by /headless and the MCP server.
import { analyseBitmap, renderExport, resolveState, statsLine } from "./pipeline";
import { EFFECTS, applyEffect } from "./effects";
import { interpretRequest, mergeOps } from "./intent";
import { edgeFor } from "./resample";
import { extFor } from "./export";
import type { RetouchOp } from "./retouch";
import type { EditParams } from "./params";

export interface LumenJob { image: string; auto?: boolean; request?: string; effects?: { id: string; strength?: number }[]; manual?: Partial<EditParams>; retouch?: RetouchOp[]; format?: string; resolution?: string; edge?: number; range?: "sdr" | "hdr"; quality?: number; sharpen?: "off" | "screen" | "print"; lut?: { cube?: string; gradient?: string; amount?: number } }
const toB64 = async (b: Blob) => { const buf = new Uint8Array(await b.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };

export async function lumenRun(job: LumenJob) {
  const bytes = Uint8Array.from(atob(job.image), (c) => c.charCodeAt(0)); const bmp = await createImageBitmap(new Blob([bytes]), { imageOrientation: "from-image" });
  const a = analyseBitmap(bmp); let manual: Partial<EditParams> = {}; const notes: string[] = []; const unsupported: { phrase: string; why: string }[] = [];
  if (job.request) { const r = interpretRequest(job.request); manual = { ...manual, ...mergeOps(r.ops) }; unsupported.push(...r.unsupported); notes.push(...r.ops.map((o) => `${o.label}: ${o.reason}`)); if (r.unmatched.length) notes.push("Not understood: " + r.unmatched.join("; ")); }
  for (const e of job.effects ?? []) { const fx = EFFECTS.find((x) => x.id === e.id || x.name.toLowerCase() === e.id.toLowerCase()); if (!fx) { unsupported.push({ phrase: e.id, why: "Unknown effect id. Use lumen_list_effects." }); continue; } manual = applyEffect(manual, fx, e.strength ?? 0.7, { w: bmp.width, h: bmp.height }); notes.push(`Effect ${fx.name} at ${Math.round((e.strength ?? 0.7) * 100)}%`); }
  if (job.manual) manual = { ...manual, ...job.manual };
  const pj: any = { genre: "unknown", intent: "natural", ai: undefined, enabled: {}, aiOpacity: job.auto ? 1 : 0, manual, locals: [], retouch: job.retouch ?? [] };
  if (job.lut) { const L = await import("./lut"); let d: any = null; if (job.lut.cube) { d = L.parseCube(job.lut.cube, "LUT"); if (typeof d === "string") { unsupported.push({ phrase: "LUT", why: d }); d = null; } } else if (job.lut.gradient) { const g = L.GRADIENT_PRESETS.find((x) => x.id === job.lut!.gradient); if (g) d = L.gradientMapLut(g.stops, g.name); else unsupported.push({ phrase: job.lut.gradient, why: "Unknown gradient map id: " + L.GRADIENT_PRESETS.map((x) => x.id).join(", ") }); } if (d) pj.lut = { lut: d, amount: job.lut.amount ?? 1 }; }
  const st = resolveState(pj, a); const fmt = job.format ?? "image/jpeg";
  const res = await renderExport(bmp, bmp.width, bmp.height, st, { fmt, q: job.quality ?? 0.92, edge: job.edge ?? edgeFor(job.resolution ?? "orig", 0), range: job.range ?? "sdr", sharpen: job.sharpen });
  return { base64: await toB64(res.blob), width: res.w, height: res.h, ext: res.ext, bytes: res.blob.size, range: res.range, resized: res.resized, stats: res.stats, evidence: statsLine(res.stats), notes, unsupported, ops: (job.retouch ?? []).length, fmtExt: extFor(fmt) };
}


export async function lumenAnalyse(imageB64: string) {
  const bytes = Uint8Array.from(atob(imageB64), (c) => c.charCodeAt(0)); const bmp = await createImageBitmap(new Blob([bytes]), { imageOrientation: "from-image" }); const a = analyseBitmap(bmp);
  const r = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
  return { width: bmp.width, height: bmp.height, medianLuma: r(a.p50), highlightClipPct: r(a.clipHighPct, 1), shadowClipPct: r(a.clipLowPct, 1), meanSaturation: r(a.meanSat), noise: r(a.noiseLuma, 4), sharpness: r(a.sharpness), backlit: a.backlit, skyShare: r(a.skyShare), subjectBox: a.subject };
}

/** Test/diagnostic: grade a photo with known parameters to make a reference, then let the fitter recover that grade from the ungraded photo. */
export async function lumenGradeFit(imageB64: string, refParams: Partial<EditParams>) {
  const { fitGrade, gradeStatsOf } = await import("./gradefit"); const { defaultParams } = await import("./params"); const { Renderer } = await import("./renderer");
  const bytes = Uint8Array.from(atob(imageB64), (c) => c.charCodeAt(0)); const bmp = await createImageBitmap(new Blob([bytes]), { imageOrientation: "from-image" });
  const small = document.createElement("canvas"); const s = Math.min(1, 224 / Math.max(bmp.width, bmp.height)); small.width = Math.round(bmp.width * s); small.height = Math.round(bmp.height * s); small.getContext("2d")!.drawImage(bmp, 0, 0, small.width, small.height);
  const gl = document.createElement("canvas"), r = new Renderer(gl); r.setImage(small); r.render({ ...defaultParams(), ...refParams } as EditParams, 224, { seed: 1 });
  const c2 = document.createElement("canvas"); c2.width = gl.width; c2.height = gl.height; const g = c2.getContext("2d")!; g.drawImage(gl, 0, 0); const ref = gradeStatsOf(g.getImageData(0, 0, c2.width, c2.height).data);
  const t0 = performance.now(); const res = await fitGrade(bmp, defaultParams(), ref); return { ...res, ms: Math.round(performance.now() - t0) };
}
