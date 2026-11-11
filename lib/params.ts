// Parametric edit model. Everything the renderer does is described by this object.
// The original pixels are never touched; the edit is data.

export const HSL_BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
export const HSL_CENTERS = [0, 30, 60, 120, 180, 240, 270, 300]; // degrees

export interface Crop { x: number; y: number; w: number; h: number } // normalised 0..1 of source

export interface EditParams {
  exposure: number;      // EV, -5..5
  contrast: number;      // -100..100
  highlights: number;    // -100..100
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;   // -100 (cool) .. 100 (warm), relative shift
  tint: number;          // -100 (green) .. 100 (magenta)
  vibrance: number;
  saturation: number;
  hslH: number[];        // 8 bands, -100..100
  hslS: number[];
  hslL: number[];
  curve: [number, number][]; // master tone curve control points, x,y in 0..1
  sharpAmount: number;   // 0..150
  sharpRadius: number;   // 0.5..3 px
  texture: number;       // -100..100
  clarity: number;       // -100..100
  nrLuma: number;        // 0..100
  nrColor: number;       // 0..100
  vignette: number;      // -100..100
  dehaze: number; bloom: number; halation: number; // 0..100
  distortion: number; ca: number; perspV: number; perspH: number; // -100..100
  gradeShH: number; gradeShS: number; gradeHiH: number; gradeHiS: number; gradeBal: number; // split toning: hue 0..360, amount 0..100, balance -100..100
  grain: number;         // 0..100
  gaussBlur: number; boxBlur: number; mosaic: number; motionBlur: number; tiltShift: number; bokeh: number; softFocus: number; fade: number; // creative effects, 0..100
  bw: boolean;
  straighten: number;    // degrees
  crop: Crop;
}

export const IDENTITY_CURVE: [number, number][] = [[0, 0], [1, 1]];

export const defaultParams = (): EditParams => ({
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temperature: 0, tint: 0, vibrance: 0, saturation: 0,
  hslH: Array(8).fill(0), hslS: Array(8).fill(0), hslL: Array(8).fill(0),
  curve: IDENTITY_CURVE.map((p) => [...p] as [number, number]),
  sharpAmount: 0, sharpRadius: 1, texture: 0, clarity: 0, nrLuma: 0, nrColor: 0,
  vignette: 0, grain: 0, gradeShH: 220, gradeShS: 0, gradeHiH: 40, gradeHiS: 0, gradeBal: 0, dehaze: 0, bloom: 0, halation: 0, distortion: 0, ca: 0, perspV: 0, perspH: 0, gaussBlur: 0, boxBlur: 0, mosaic: 0, motionBlur: 0, tiltShift: 0, bokeh: 0, softFocus: 0, fade: 0, bw: false, straighten: 0, crop: { x: 0, y: 0, w: 1, h: 1 },
});

const NUMERIC_ADDITIVE = [
  "exposure", "contrast", "highlights", "shadows", "whites", "blacks", "temperature", "tint",
  "vibrance", "saturation", "sharpAmount", "texture", "clarity", "nrLuma", "nrColor", "vignette", "grain", "straighten",
  "dehaze", "bloom", "halation", "distortion", "ca", "perspV", "perspH", "gradeShH", "gradeShS", "gradeHiH", "gradeHiS", "gradeBal",
  "gaussBlur", "boxBlur", "mosaic", "motionBlur", "tiltShift", "bokeh", "softFocus", "fade",
] as const;
/** Non-zero resting values: the stored delta is relative to these (used for the grading hues so an untouched hue slider shows blue/orange). */
export const BASE: Partial<Record<(typeof NUMERIC_ADDITIVE)[number], number>> = { gradeShH: 220, gradeHiH: 40 };
const ARRAYS = ["hslH", "hslS", "hslL"] as const;

/** Layer composition: AI layer (scaled by opacity) + manual layer. Both are deltas from default. */
export function compose(ai: Partial<EditParams>, aiOpacity: number, manual: Partial<EditParams>): EditParams {
  const out = defaultParams();
  for (const k of NUMERIC_ADDITIVE) out[k] = (BASE[k] ?? 0) + ((ai[k] ?? 0) as number) * aiOpacity + ((manual[k] ?? 0) as number);
  for (const k of ARRAYS) out[k] = out[k].map((_, i) => ((ai[k]?.[i] ?? 0) * aiOpacity) + (manual[k]?.[i] ?? 0));
  out.sharpRadius = manual.sharpRadius ?? ai.sharpRadius ?? 1;
  out.curve = manual.curve ?? ai.curve ?? out.curve;
  out.bw = manual.bw ?? ai.bw ?? false;
  out.crop = manual.crop ?? out.crop;
  return out;
}

export function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }

/** Convert a desired final value into a manual-layer delta given what the AI layer already contributes. */
export function manualDeltaFor<K extends (typeof NUMERIC_ADDITIVE)[number]>(
  key: K, finalValue: number, ai: Partial<EditParams>, aiOpacity: number,
): number { return finalValue - (BASE[key] ?? 0) - ((ai[key] ?? 0) as number) * aiOpacity; }

/** Monotone cubic (Fritsch-Carlson) LUT of 256 entries through the curve points. */
export function buildCurveLUT(points: [number, number][]): Float32Array {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const lut = new Float32Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) lut[i] = i / 255; return lut; }
  const dx: number[] = [], m: number[] = [], t: number[] = Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0] || 1e-6); m.push((pts[i + 1][1] - pts[i][1]) / dx[i]); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  for (let j = 0; j < 256; j++) {
    const x = j / 255;
    let i = 0; while (i < n - 2 && x > pts[i + 1][0]) i++;
    const h = dx[i], u = clamp((x - pts[i][0]) / h, 0, 1);
    const u2 = u * u, u3 = u2 * u;
    const y = (2 * u3 - 3 * u2 + 1) * pts[i][1] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * pts[i + 1][1] + (u3 - u2) * h * t[i + 1];
    lut[j] = clamp(y, 0, 1);
  }
  return lut;
}
