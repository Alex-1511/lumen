// Closed-loop colour grade matching. Instead of guessing slider values from a few averages, Lumen measures the reference's grade
// (tone curve percentiles, colour tint in shadows / midtones / highlights, saturation per zone) and then SEARCHES slider values:
// every candidate is rendered by the real WebGL pipeline on a small copy of YOUR photo and scored against the reference.
// The reported before/after distance is measured, not claimed.
import { EditParams, BASE, clamp, defaultParams } from "./params";
import { Renderer } from "./renderer";

export interface Zone { w: number; a: number; b: number; sat: number }
export interface GradeStats { pct: number[]; zones: Zone[]; meanSat: number; mono: boolean }
const PCTS = [0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99];

/** Measure a grade from RGBA pixels (sRGB bytes). Chroma uses simple opponent axes: a = R-G, b = (R+G)/2-B. */
export function gradeStatsOf(d: Uint8ClampedArray | Uint8Array): GradeStats {
  const n = d.length / 4, hist = new Float64Array(256); const z = [0, 1, 2].map(() => ({ w: 0, a: 0, b: 0, s: 0 })); let sat = 0, mono = 0;
  for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, y = 0.2126 * r + 0.7152 * g + 0.0722 * b; hist[Math.min(255, Math.round(y * 255))]++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), s = mx > 0.02 ? (mx - mn) / mx : 0; sat += s; if (mx - mn < 0.02) mono++;
    const k = y < 0.33 ? 0 : y < 0.66 ? 1 : 2; const o = z[k]; o.w++; o.a += r - g; o.b += (r + g) / 2 - b; o.s += s; }
  const pct = PCTS.map((p) => { let c = 0; const t = p * n; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= t) return i / 255; } return 1; });
  return { pct, zones: z.map((o) => ({ w: o.w / n, a: o.w ? o.a / o.w : 0, b: o.w ? o.b / o.w : 0, sat: o.w ? o.s / o.w : 0 })), meanSat: sat / n, mono: mono / n > 0.97 };
}
export function gradeDistance(a: GradeStats, r: GradeStats): number {
  let t = 0; for (let i = 0; i < PCTS.length; i++) t += Math.abs(a.pct[i] - r.pct[i]); t /= PCTS.length;
  let c = 0; if (!a.mono && !r.mono) for (let k = 0; k < 3; k++) { const w = Math.max(0.15, (a.zones[k].w + r.zones[k].w) / 2); c += w * (Math.abs(a.zones[k].a - r.zones[k].a) + Math.abs(a.zones[k].b - r.zones[k].b) + 0.6 * Math.abs(a.zones[k].sat - r.zones[k].sat)); }
  return t * 1.0 + c * 0.9 + (a.mono || r.mono ? 0 : Math.abs(a.meanSat - r.meanSat) * 0.4);
}
const hueOf = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn || 1e-6; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; return h < 0 ? h + 360 : h; };
/** Plain-language description of a measured grade (shown in the Style library). */
export function describeGrade(s: GradeStats): string[] {
  const out: string[] = []; const [p1, , , p50, , , p99] = s.pct;
  out.push(`Tone: black point ${(p1 * 100).toFixed(0)}%, median ${(p50 * 100).toFixed(0)}%, white point ${(p99 * 100).toFixed(0)}%${p1 > 0.07 ? " (lifted, faded blacks)" : p1 < 0.02 ? " (deep blacks)" : ""}`);
  if (s.mono) { out.push("Black and white (no colour grade to match)"); return out; }
  const nm = ["Shadows", "Midtones", "Highlights"]; s.zones.forEach((z, i) => { const m = Math.hypot(z.a, z.b); if (m < 0.012) { out.push(`${nm[i]}: neutral`); return; }
    const h = hueOf(0.5 + z.a, 0.5 - z.a / 2 + z.b / 2, 0.5 - z.b); const nameH = h < 20 || h >= 345 ? "red" : h < 50 ? "orange" : h < 70 ? "yellow" : h < 160 ? "green" : h < 200 ? "cyan/teal" : h < 260 ? "blue" : h < 300 ? "violet" : "magenta"; out.push(`${nm[i]}: tinted ${nameH} (${(m * 100).toFixed(0)}%), saturation ${(z.sat * 100).toFixed(0)}%`); });
  return out;
}

type Spec = { k: keyof EditParams; lo: number; hi: number; step: number };
const SPECS: Spec[] = [
  { k: "exposure", lo: -2, hi: 2, step: 0.3 }, { k: "contrast", lo: -60, hi: 60, step: 14 }, { k: "highlights", lo: -80, hi: 80, step: 18 }, { k: "shadows", lo: -80, hi: 80, step: 18 },
  { k: "whites", lo: -60, hi: 60, step: 14 }, { k: "blacks", lo: -60, hi: 60, step: 14 }, { k: "temperature", lo: -60, hi: 60, step: 14 }, { k: "tint", lo: -40, hi: 40, step: 10 },
  { k: "saturation", lo: -60, hi: 60, step: 14 }, { k: "vibrance", lo: -60, hi: 60, step: 14 }, { k: "gradeShS", lo: 0, hi: 70, step: 12 }, { k: "gradeHiS", lo: 0, hi: 70, step: 12 }, { k: "gradeBal", lo: -50, hi: 50, step: 12 },
];
export interface FitResult { patch: Partial<EditParams>; before: number; after: number; evals: number; notes: string[] }

/** Search slider values so the render of `src` moves toward `ref`. `base` = the params currently in effect (the patch is added on top of them). */
export async function fitGrade(src: ImageBitmap | HTMLCanvasElement, base: EditParams, ref: GradeStats, opts: { maxEvals?: number; edge?: number; onProgress?: (p: number) => void } = {}): Promise<FitResult> {
  const edge = opts.edge ?? 224, maxEvals = opts.maxEvals ?? 260; const s = Math.min(1, edge / Math.max(src.width, src.height));
  const small = document.createElement("canvas"); small.width = Math.max(8, Math.round(src.width * s)); small.height = Math.max(8, Math.round(src.height * s)); small.getContext("2d")!.drawImage(src, 0, 0, small.width, small.height);
  const gl = document.createElement("canvas"), r = new Renderer(gl); r.setImage(small); const rd = document.createElement("canvas"); const rc = rd.getContext("2d", { willReadFrequently: true })!;
  const measure = (p: EditParams) => { r.render(p, edge, { seed: 1 }); rd.width = gl.width; rd.height = gl.height; rc.drawImage(gl, 0, 0); return gradeStatsOf(rc.getImageData(0, 0, rd.width, rd.height).data); };
  const notes: string[] = []; let evals = 0; const cur: any = { ...base }; const score = (p: any) => { evals++; return gradeDistance(measure(p), ref); };
  const before = score(cur); let best = before;
  // initial split-tone hues: point each tint at the colour the reference has in that zone (relative to this photo's own tint)
  if (!ref.mono) { const m0 = measure(cur); for (const [zi, hk, sk] of [[0, "gradeShH", "gradeShS"], [2, "gradeHiH", "gradeHiS"]] as const) { const da = ref.zones[zi].a - m0.zones[zi].a, db = ref.zones[zi].b - m0.zones[zi].b; if (Math.hypot(da, db) > 0.015) { cur[hk] = hueOf(0.5 + da, 0.5 - da / 2 + db / 2, 0.5 - db); if (!(cur[sk] > 0)) cur[sk] = 12; } } best = score(cur); }
  const specs = ref.mono ? SPECS.filter((x) => !["temperature", "tint", "saturation", "vibrance", "gradeShS", "gradeHiS", "gradeBal"].includes(x.k as string)) : SPECS;
  for (const scale of [1, 0.5, 0.25]) { let improved = true, rounds = 0;
    while (improved && rounds++ < 3 && evals < maxEvals) { improved = false;
      for (const sp of specs) { if (evals >= maxEvals) break; const st = sp.step * scale;
        for (const dir of [1, -1]) { const v = clamp((cur[sp.k] ?? 0) + dir * st, (BASE as any)[sp.k] ?? sp.lo, sp.hi); if (sp.k === "gradeShS" || sp.k === "gradeHiS") { /* absolute strength 0..70 */ }
          const old = cur[sp.k]; if (v === old) continue; cur[sp.k] = v; const sc = score(cur); if (sc < best - 1e-4) { best = sc; improved = true; break; } cur[sp.k] = old; }
      } opts.onProgress?.(Math.min(1, evals / maxEvals)); await new Promise((res) => setTimeout(res, 0)); } }
  const patch: any = {}; for (const k of Object.keys(cur)) { const a = (cur as any)[k], b = (base as any)[k]; if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) > 1e-6) patch[k] = Math.round((a - b) * 100) / 100; }
  if (best > before * 0.85) notes.push("The reference's look is far from what slider-based grading can reach on this photo, so the improvement is small. Content differences (different colours in the scene) limit any global match.");
  return { patch, before, after: best, evals, notes };
}
export const _defaultParams = defaultParams;
