// Effects library. Every effect is a bundle of real, parametric edits (deltas on the manual layer), never a baked-in filter.
// Applying one changes parameters you can still see and adjust in Develop. Names follow the editing-app vocabulary the user supplied.
import { EditParams, clamp } from "./params";
import type { Analysis } from "./analysis";

export type EffectCategory = "Blur & Sharpen" | "Cinematic" | "Colour" | "Retro & Film" | "Light & Glow" | "Masks & Frames";
export const EFFECT_CATEGORIES: EffectCategory[] = ["Blur & Sharpen", "Cinematic", "Colour", "Retro & Film", "Light & Glow", "Masks & Frames"];
type NumDelta = Partial<Record<keyof EditParams, number>>;
export interface Effect {
  id: string; name: string; category: EffectCategory; desc: string;
  set: NumDelta; bw?: boolean; curve?: [number, number][]; cropRatio?: number;
  /** Honest caveat shown on the card when the effect is an approximation. */
  note?: string;
}
const S_CURVE: [number, number][] = [[0, 0.02], [0.25, 0.2], [0.5, 0.5], [0.75, 0.82], [1, 0.98]];
const FADE_CURVE: [number, number][] = [[0, 0.06], [0.25, 0.27], [0.75, 0.78], [1, 0.97]];

export const EFFECTS: Effect[] = [
  // --- Blur & Sharpen (the five from the library plus related) ---
  { id: "box-blur", name: "Box Blur", category: "Blur & Sharpen", desc: "Even square-kernel blur.", set: { boxBlur: 35 } },
  { id: "gaussian-blur", name: "Gaussian Blur", category: "Blur & Sharpen", desc: "Smooth bell-curve blur.", set: { gaussBlur: 35 } },
  { id: "mosaic-blur", name: "Mosaic Blur", category: "Blur & Sharpen", desc: "Pixelate into averaged blocks.", set: { mosaic: 35 } },
  { id: "sharpen", name: "Sharpen", category: "Blur & Sharpen", desc: "Crisper edges and fine detail.", set: { sharpAmount: 60, texture: 12 } },
  { id: "tilt-shift", name: "Tilt-Shift", category: "Blur & Sharpen", desc: "Miniature look: blur above and below a sharp band.", set: { tiltShift: 70, saturation: 14, contrast: 8 }, note: "The sharp band follows the detected subject height." },
  { id: "bokeh", name: "Bokeh", category: "Blur & Sharpen", desc: "Soft disc-shaped background blur, bright highlights bloom into discs.", set: { bokeh: 65 }, note: "Approximate: blurs outside a subject ellipse (capped so the edges always blur), not a depth map or true segmentation." },
  { id: "motion-blur", name: "Motion Blur", category: "Blur & Sharpen", desc: "Horizontal streak, like a panning shot.", set: { motionBlur: 35 } },
  { id: "soft-focus", name: "Soft Focus", category: "Blur & Sharpen", desc: "Gentle glow over sharp detail.", set: { softFocus: 45, contrast: -4 } },
  // --- Cinematic ---
  { id: "cinematic", name: "Cinematic", category: "Cinematic", desc: "Teal shadows, warm highlights, held-back colour, gentle vignette.", set: { contrast: 14, highlights: -12, shadows: 8, saturation: -8, gradeShH: -30, gradeShS: 30, gradeHiH: -4, gradeHiS: 22, vignette: 18, grain: 8 }, curve: S_CURVE },
  { id: "teal-orange", name: "Teal & Orange", category: "Cinematic", desc: "The blockbuster complementary split.", set: { gradeShH: -30, gradeShS: 42, gradeHiH: -10, gradeHiS: 38, saturation: 6, contrast: 10 } },
  { id: "dramatic", name: "Dramatic", category: "Cinematic", desc: "Heavy contrast, strong local punch, dark edges.", set: { contrast: 32, clarity: 28, highlights: -24, shadows: -8, saturation: -10, dehaze: 14, vignette: 24 } },
  { id: "anamorphic", name: "Anamorphic", category: "Cinematic", desc: "2.39:1 widescreen crop with a halation glow.", set: { halation: 22, bloom: 12, contrast: 8 }, cropRatio: 2.39 },
  { id: "film-noir", name: "Film Noir", category: "Cinematic", desc: "High-contrast black and white with grain.", set: { contrast: 36, blacks: -18, vignette: 30, grain: 20, clarity: 12 }, bw: true },
  // --- Colour ---
  { id: "vibrant", name: "Vibrant", category: "Colour", desc: "Richer, livelier colour without clipping skin tones.", set: { vibrance: 45, saturation: 10, contrast: 8, clarity: 10 } },
  { id: "vivid", name: "Vivid", category: "Colour", desc: "Strong saturation and punch.", set: { saturation: 28, contrast: 18, clarity: 18 } },
  { id: "warm", name: "Warm", category: "Colour", desc: "Golden, inviting tone.", set: { temperature: 24, tint: 4, vibrance: 8 } },
  { id: "cool", name: "Cool", category: "Colour", desc: "Crisp blue-leaning tone.", set: { temperature: -24, tint: -3, gradeShH: 0, gradeShS: 14 } },
  { id: "matte", name: "Matte", category: "Colour", desc: "Lifted blacks and soft contrast.", set: { fade: 55, contrast: -8, saturation: -8 } },
  { id: "black-white", name: "Black & White", category: "Colour", desc: "Clean monochrome with a little punch.", set: { contrast: 12, clarity: 10 }, bw: true },
  { id: "bleach-bypass", name: "Bleach Bypass", category: "Retro & Film", desc: "Silver-retention film look: low saturation, hard contrast, gritty micro-contrast.", set: { saturation: -42, contrast: 30, clarity: 16, blacks: -10, highlights: -8 }, curve: S_CURVE, note: "Approximation with global sliders and an S curve. It does not model the film chemistry (a luminance-weighted overlay of the black and white image)." },
  { id: "cross-processing", name: "Cross Processing", category: "Retro & Film", desc: "E-6 film in C-41 chemistry: teal shadows, yellow-green highlights, punchy contrast.", set: { contrast: 20, saturation: 18, gradeShH: -20, gradeShS: 38, gradeHiH: 62, gradeHiS: 42, tint: -6 }, curve: S_CURVE, note: "Approximation with split toning and an S curve. True cross processing bends each colour channel separately; Lumen has a single luminance curve." },
  { id: "filmic-tone-map", name: "Filmic Tone Map", category: "Cinematic", desc: "Soft highlight shoulder and lifted toe, so bright areas roll off instead of clipping.", set: { highlights: -38, shadows: 22, whites: -14, contrast: 6 }, curve: [[0, 0.015], [0.2, 0.19], [0.5, 0.52], [0.8, 0.84], [1, 0.965]], note: "Display-referred tone curve for an 8-bit photo. It is not scene-referred HDR tone mapping." },
  { id: "sepia", name: "Sepia", category: "Colour", desc: "Brown-toned monochrome.", set: { saturation: -100, gradeShH: -185, gradeShS: 45, gradeHiH: -2, gradeHiS: 42, fade: 12 } },
  { id: "cyberpunk", name: "Cyberpunk", category: "Colour", desc: "Magenta shadows, cyan highlights, neon glow.", set: { gradeShH: 80, gradeShS: 45, gradeHiH: 145, gradeHiS: 40, saturation: 18, contrast: 14, bloom: 22 } },
  // --- Retro & Film ---
  { id: "vintage", name: "Vintage", category: "Retro & Film", desc: "Warm faded print with grain and dark corners.", set: { temperature: 16, saturation: -20, fade: 35, vignette: 24, grain: 20, gradeHiH: -2, gradeHiS: 16 }, curve: FADE_CURVE },
  { id: "faded-film", name: "Faded Film", category: "Retro & Film", desc: "Washed colour, soft blacks, light grain.", set: { fade: 45, saturation: -18, grain: 14, temperature: 6 } },
  { id: "film-grain", name: "Film Grain", category: "Retro & Film", desc: "Adds fine, deterministic grain.", set: { grain: 35 } },
  { id: "halation-glow", name: "Halation", category: "Retro & Film", desc: "Red-orange glow bleeding from bright edges.", set: { halation: 45, bloom: 16 } },
  // --- Light & Glow ---
  { id: "dreamy", name: "Dreamy", category: "Light & Glow", desc: "Orton-style glow with lifted softness.", set: { softFocus: 55, bloom: 30, contrast: -8, saturation: 8 } },
  { id: "golden-hour", name: "Golden Hour", category: "Light & Glow", desc: "Low warm sun: amber highlights, open shadows.", set: { temperature: 28, tint: 6, highlights: -10, shadows: 10, vibrance: 20, halation: 14, gradeHiH: -2, gradeHiS: 24 } },
  { id: "high-key", name: "High Key", category: "Light & Glow", desc: "Bright, airy, low contrast.", set: { exposure: 0.6, contrast: -12, shadows: 30, whites: 18, saturation: -8 } },
  { id: "low-key", name: "Low Key", category: "Light & Glow", desc: "Dark, moody, deep blacks.", set: { exposure: -0.5, contrast: 24, blacks: -24, highlights: -14 } },
  { id: "clear-air", name: "Clear Air", category: "Light & Glow", desc: "Cut haze for deeper distance.", set: { dehaze: 40, contrast: 6 } },
  // --- Masks & Frames ---
  { id: "vignette", name: "Vignette", category: "Masks & Frames", desc: "Darken the corners to hold the eye.", set: { vignette: 40 } },
  { id: "spotlight", name: "Spotlight", category: "Masks & Frames", desc: "Strong dark falloff around the centre.", set: { vignette: 75, exposure: 0.1 } },
  { id: "letterbox", name: "Letterbox 2.39:1", category: "Masks & Frames", desc: "Widescreen crop.", set: {}, cropRatio: 2.39 },
];

const BOUNDS: Partial<Record<keyof EditParams, [number, number]>> = { exposure: [-5, 5], sharpAmount: [0, 150], gaussBlur: [0, 100], boxBlur: [0, 100], mosaic: [0, 100], motionBlur: [0, 100], tiltShift: [0, 100], bokeh: [0, 100], softFocus: [0, 100], fade: [0, 100], grain: [0, 100], dehaze: [0, 100], bloom: [0, 100], halation: [0, 100], nrLuma: [0, 100], nrColor: [0, 100] };
const lim = (k: keyof EditParams, v: number) => { const b = BOUNDS[k] ?? [-100, 100]; return clamp(v, b[0], b[1]); };

/** The manual layer after applying an effect at `strength` (0..1). Deltas add to what is already there. */
export function applyEffect(manual: Partial<EditParams>, e: Effect, strength: number, dims: { w: number; h: number }): Partial<EditParams> {
  const m: any = { ...manual }; const k = clamp(strength, 0, 1);
  for (const [key, d] of Object.entries(e.set) as [keyof EditParams, number][]) m[key] = lim(key, ((m[key] as number) ?? 0) + d * k);
  if (e.bw && k >= 0.5) m.bw = true;
  if (e.curve && k > 0) { const base: [number, number][] = [[0, 0], [1, 1]]; m.curve = base.length && e.curve.map(([x, y]) => [x, clamp(x + (y - x) * k, 0, 1)] as [number, number]); }
  if (e.cropRatio && k > 0) { const r = e.cropRatio, A = dims.w / dims.h; const cw = A >= r ? r / A : 1, ch = A >= r ? 1 : A / r; m.crop = { x: (1 - cw) / 2, y: (1 - ch) / 2, w: cw, h: ch }; }
  return m;
}
export const effectParamKeys = (e: Effect) => [...Object.keys(e.set), ...(e.bw ? ["bw"] : []), ...(e.curve ? ["curve"] : []), ...(e.cropRatio ? ["crop"] : [])];

/** Focus ellipse (source-normalised cx, cy, rx, ry) for bokeh and tilt-shift, from the analysis' subject box or a supplied box. */
export function focusFrom(a: Analysis | null | undefined, box?: { x: number; y: number; w: number; h: number } | null): [number, number, number, number] {
  const b = box ?? (a ? a.subject : null); if (!b) return [0.5, 0.5, 0.32, 0.4];
  return [b.x + b.w / 2, b.y + b.h / 2, clamp(b.w * 0.6, 0.12, 0.38), clamp(b.h * 0.6, 0.12, 0.42)];
}

// ---- effects on masks ----
import type { LocalAdjust } from "./masks";
/** Which global effect parameters a mask can carry, and what they are called on a mask. */
export const LOCAL_MAP: Partial<Record<keyof EditParams, keyof LocalAdjust>> = {
  exposure: "exposure", contrast: "contrast", highlights: "highlights", shadows: "shadows", temperature: "temperature", saturation: "saturation", clarity: "clarity", texture: "texture",
  sharpAmount: "sharpen", gaussBlur: "blur", boxBlur: "blur", motionBlur: "motion", mosaic: "mosaic", softFocus: "soft", fade: "fade", grain: "grain", vibrance: "saturation",
};
const LOCAL_BOUNDS: Partial<Record<keyof LocalAdjust, [number, number]>> = { exposure: [-3, 3], sharpen: [0, 100], blur: [0, 100], motion: [0, 100], mosaic: [0, 100], soft: [0, 100], fade: [0, 100], grain: [0, 100] };
/** Add an effect to a mask's own adjustments. Returns what was applied and what a mask cannot do (so the UI can say so). */
export function applyEffectToAdjust(adj: LocalAdjust, e: Effect, strength: number): { adjust: LocalAdjust; applied: string[]; skipped: string[] } {
  const out: any = { ...adj }; const applied: string[] = [], skipped: string[] = []; const k = clamp(strength, 0, 1);
  for (const [key, d] of Object.entries(e.set) as [keyof EditParams, number][]) {
    const lk = LOCAL_MAP[key]; if (!lk) { skipped.push(String(key)); continue; }
    const b = LOCAL_BOUNDS[lk] ?? [-100, 100]; out[lk] = clamp((out[lk] ?? 0) + d * k, b[0], b[1]); applied.push(lk);
  }
  // effects that depend on the whole frame cannot live on a mask
  if (e.bw) skipped.push("black & white"); if (e.curve) skipped.push("tone curve"); if (e.cropRatio) skipped.push("crop");
  // bokeh on a mask = blur the masked area (use an inverted subject mask for background blur)
  if (e.id === "bokeh") { out.blur = clamp((out.blur ?? 0) + 55 * k, 0, 100); applied.push("blur"); const i = skipped.indexOf("bokeh"); if (i >= 0) skipped.splice(i, 1); }
  return { adjust: out as LocalAdjust, applied: [...new Set(applied)], skipped: [...new Set(skipped)] };
}
