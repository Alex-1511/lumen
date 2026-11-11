// Edit planner: Analysis (+ optional model-supplied genre/intent) -> traceable recipe.
// Every item carries operation, params, region, reason, expected outcome, strength, reversibility and kind.
// "Preserve what works": an operation is emitted only when a measurement crosses a threshold.
import type { Learned } from "./learn";
import type { Analysis } from "./analysis";
import { EditParams, clamp } from "./params";
import { LocalLayer, newLayer, skyLayer, subjectEllipse } from "./masks";

export type Intent = "natural" | "clean" | "vibrant" | "moody" | "documentary" | "bw";
export type Genre = "wildlife" | "bird" | "pet" | "landscape" | "portrait" | "street" | "architecture" | "night" | "macro" | "unknown";
export type Kind = "correction" | "enhancement" | "generative";

export interface RecipeItem {
  id: string; operation: string; techniques: string[]; // technique names that exist in the registry
  patch: Partial<EditParams>; region: "global" | "local"; maskRef: string | null; local?: LocalLayer;
  reason: string; expected: string; strength: number; reversible: true; kind: Kind;
  evidence: Record<string, number | string>;
}
export interface Plan { genre: Genre; intent: Intent; items: RecipeItem[]; preserved: string[]; notes: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100;

export function plan(a: Analysis, opts: { genre?: Genre; intent?: Intent; subjectBox?: { x: number; y: number; w: number; h: number }; learned?: Learned | null } = {}): Plan {
  const genre = opts.genre ?? "unknown"; const intent = opts.intent ?? "natural";
  const items: RecipeItem[] = []; const preserved: string[] = []; const notes: string[] = [];
  // Genre-dependent restraint: wildlife/bird/pet/documentary avoid heavy colour or texture pushes.
  const restrained = ["wildlife", "bird", "pet", "street"].includes(genre) || intent === "documentary" || intent === "natural";
  const add = (it: Omit<RecipeItem, "region" | "maskRef" | "reversible"> & { local?: LocalLayer }) => items.push({ ...it, region: it.local ? "local" : "global", maskRef: it.local ? it.local.id : null, reversible: true });

  // --- Exposure: aim median toward ~0.42 display luma, but only if clearly off ---
  const target = a.lowKey || intent === "moody" ? a.p50 : 0.42; // never brighten a deliberate low-key frame
  const medErr = target - a.p50;
  if (!a.lowKey && Math.abs(medErr) > 0.08) {
    const ev = clamp(Math.log2(Math.pow(target, 2.2) / Math.max(1e-3, Math.pow(a.p50, 2.2))), -2, 2) * 0.8;
    add({ id: "exposure", operation: "Exposure compensation", techniques: ["Exposure Compensation (Software EV Push/Pull)"], patch: { exposure: r2(ev) },
      reason: `Median luma is ${r2(a.p50)}; a balanced frame sits near ${target}.`, expected: ev > 0 ? "Brighter midtones, shadows lifted" : "Darker midtones, highlights protected", strength: clamp(Math.abs(ev) / 2, 0.1, 1), kind: "correction", evidence: { median: r2(a.p50), target } });
  } else preserved.push(a.lowKey ? "Exposure: low-key look treated as intentional" : `Exposure: median ${r2(a.p50)} is acceptable`);

  // --- Highlights / shadows from clipping and range ---
  if (a.clipHighPct > 1.5 || (a.p95 > 0.93 && a.p99 >= 0.99)) {
    const hv = -clamp(25 + a.clipHighPct * 6, 25, 80);
    add({ id: "highlights", operation: "Highlight recovery", techniques: ["Highlight Roll-off (Highlight Recovery)", "Clipping (Highlights / Shadows)"], patch: { highlights: hv },
      reason: `${r2(a.clipHighPct)}% of pixels are at/near white. Recovery only works where 8-bit data still exists; fully clipped areas stay clipped.`, expected: "Bright areas regain tone", strength: 0.6, kind: "correction", evidence: { clipHigh: r2(a.clipHighPct) } });
  } else preserved.push("Highlights: no meaningful clipping");
  if (a.p5 < 0.05 && a.p50 > 0.12 && a.clipLowPct < 6 || a.backlit) {
    const sv = a.backlit ? 45 : 30;
    add({ id: "shadows", operation: "Shadow recovery", techniques: ["Shadow Recovery"], patch: { shadows: sv },
      reason: a.backlit ? "Subject area is darker than its surroundings (backlit)." : `5th percentile luma is ${r2(a.p5)}; shadow detail is compressed.`, expected: "Shadow detail opened without lifting blacks", strength: 0.5, kind: "correction", evidence: { p5: r2(a.p5), backlit: String(a.backlit) } });
  }
  // --- Black / white point ---
  if (a.dynamicRange < 0.72 && !a.highKey && !a.lowKey) {
    const bl = a.p1 > 0.06 ? -clamp(a.p1 * 200, 8, 35) : 0; const wh = a.p99 < 0.9 ? clamp((0.95 - a.p99) * 120, 8, 30) : 0;
    if (bl || wh) add({ id: "points", operation: "Black and white point", techniques: ["Black Point / White Point Setting"], patch: { blacks: r2(bl), whites: r2(wh) },
      reason: `Histogram spans ${r2(a.p1)}–${r2(a.p99)} (1st–99th percentile); the full range is unused.`, expected: "Cleaner blacks and cleaner whites, slightly more depth", strength: 0.5, kind: "correction", evidence: { p1: r2(a.p1), p99: r2(a.p99) } });
  } else preserved.push("Tonal range already fills the histogram");

  // --- White balance: only when the neutral-region bias is clear and enough neutrals exist ---
  const bias = a.castR - a.castB; // + warm, - cool
  if (a.neutralShare > 0.05 && Math.abs(bias) > 0.07 && !a.isMonochrome && !["night"].includes(genre)) {
    const t = -clamp(bias * 220, -50, 50);
    add({ id: "wb", operation: "White balance correction", techniques: ["White Balance (WB)", "Color Cast Neutralization"], patch: { temperature: r2(t) },
      reason: `Near-neutral midtones lean ${bias > 0 ? "warm" : "cool"} by ${r2(Math.abs(bias) * 100)}%. Warm light can be intentional (golden hour), so strength is moderate.`, expected: "More neutral whites and greys", strength: 0.5, kind: "correction", evidence: { bias: r2(bias), neutralShare: r2(a.neutralShare) } });
  } else preserved.push("White balance: no reliable cast detected (or too few neutral pixels to judge)");
  if (a.neutralShare > 0.05 && Math.abs(a.tintG) > 0.05 && !a.isMonochrome) {
    add({ id: "tint", operation: "Tint correction", techniques: ["Tint (Green/Magenta axis)"], patch: { tint: r2(clamp(a.tintG * 250, -30, 30)) },
      reason: `Neutral midtones carry a ${a.tintG > 0 ? "green" : "magenta"} bias of ${r2(Math.abs(a.tintG) * 100)}%.`, expected: "Removes green/magenta cast", strength: 0.4, kind: "correction", evidence: { tintG: r2(a.tintG) } });
  }
  // --- Haze: lifted blacks + bright + low saturation is the signature (heuristic; real haze needs depth to be sure) ---
  if (a.p1 > 0.18 && a.p99 > 0.8 && a.meanSat < 0.28 && !a.isMonochrome && !a.highKey)
    add({ id: "dehaze", operation: "Dehaze", techniques: ["Dehaze"], patch: { dehaze: restrained ? 20 : 30 }, reason: `Blacks sit at ${r2(a.p1)} with low saturation (${r2(a.meanSat)}), the usual signature of haze or flare. Fog and mist can be intentional, so strength is mild.`, expected: "Deeper shadows and cleaner colour in distant areas", strength: 0.4, kind: "enhancement", evidence: { p1: r2(a.p1), meanSat: r2(a.meanSat) } });
  // --- Contrast / curve (creative vs corrective) ---
  if (a.dynamicRange < 0.6 && intent !== "documentary") add({ id: "contrast", operation: "Contrast", techniques: ["Midtone Contrast", "Tone Curve (S-Curve)"], patch: { contrast: restrained ? 12 : 22 },
    reason: `Flat tonal separation (range ${r2(a.dynamicRange)}).`, expected: "Modest midtone separation", strength: 0.4, kind: "enhancement", evidence: { range: r2(a.dynamicRange) } });
  // --- Colour: vibrance not saturation, and restrained for wildlife ---
  const satLimit = restrained ? 0.28 : 0.38;
  if (intent === "vibrant" || (a.meanSat < satLimit * 0.55 && !a.isMonochrome)) {
    add({ id: "vibrance", operation: "Vibrance", techniques: ["Vibrance"], patch: { vibrance: restrained ? 12 : 22 },
      reason: `Mean saturation ${r2(a.meanSat)} is low; vibrance lifts muted colours first and protects skin hues.`, expected: "Muted colours gain richness without neon skin", strength: 0.35, kind: "enhancement", evidence: { meanSat: r2(a.meanSat) } });
  } else preserved.push(`Colour: saturation ${r2(a.meanSat)} left as shot`);
  // --- Detail: sharpen only when softness measured; NR only when noise measured ---
  const softRel = a.sharpnessCentre / Math.max(1e-4, a.sharpnessEdge);
  if (a.sharpness < 0.02) {
    add({ id: "sharpen", operation: "Capture sharpening", techniques: ["Unsharp Mask (USM)", "Radius (Sharpening)"], patch: { sharpAmount: restrained ? 30 : 45, sharpRadius: 1.0 },
      reason: `Overall edge energy ${r2(a.sharpness * 1000) / 1000} is low${softRel > 1.2 ? " (centre sharper than edges, so the subject area is probably in focus)" : ""}. Sharpening cannot recover real focus miss.`, expected: "Edges slightly crisper", strength: 0.4, kind: "enhancement", evidence: { sharpness: r2(a.sharpness * 1000) / 1000 } });
  } else preserved.push("Sharpness: edge energy adequate, not over-sharpening");
  if (a.noiseLuma > 0.012 || a.noiseChroma > 0.01) {
    const patch: Partial<EditParams> = {};
    if (a.noiseChroma > 0.01) patch.nrColor = clamp(a.noiseChroma * 3000, 20, 70);
    if (a.noiseLuma > 0.012) patch.nrLuma = clamp(a.noiseLuma * 1800, 15, 45);
    add({ id: "nr", operation: "Noise reduction", techniques: ["Noise Reduction (NR)", "Chrominance Noise (Color Noise)", "Luminance Noise"], patch,
      reason: `Estimated noise in flat areas: luma ${r2(a.noiseLuma * 1000) / 1000}, chroma ${r2(a.noiseChroma * 1000) / 1000}. Luma NR is kept light to protect texture.`, expected: "Cleaner shadows and flats", strength: 0.5, kind: "correction", evidence: { noiseLuma: r2(a.noiseLuma * 1000) / 1000, noiseChroma: r2(a.noiseChroma * 1000) / 1000 } });
  } else preserved.push("Noise: not measurable above threshold");
  // --- Geometry ---
  if (a.horizonConfidence > 0.45 && Math.abs(a.horizonTiltDeg) >= 1 && Math.abs(a.horizonTiltDeg) <= 10)
    add({ id: "straighten", operation: "Straighten", techniques: ["Straighten / Leveling"], patch: { straighten: -a.horizonTiltDeg },
      reason: `Dominant near-horizontal structure is tilted ${a.horizonTiltDeg}°. Detector is heuristic; verify visually.`, expected: "Level horizon (slight crop)", strength: 0.5, kind: "correction", evidence: { tilt: a.horizonTiltDeg, confidence: r2(a.horizonConfidence) } });
  // --- Local operations: only when measurements show a regional problem ---
  if (a.subject.confidence > 0.45 && a.bgLuma - a.subjectLuma > 0.14 && a.bgLuma > 0.4 && a.subject.w * a.subject.h < 0.5) {
    const l = subjectEllipse(opts.subjectBox ?? a.subject, false); l.source = "ai"; l.adjust.exposure = r2(clamp((a.bgLuma - a.subjectLuma) * 2.2, 0.2, 0.9)); l.adjust.shadows = 20; l.id = "ai-subject";
    add({ id: "local-subject", operation: "Subject lift (local)", techniques: ["Global Adjustments vs. Local Adjustments", "Radial Filter / Radial Gradient Mask"], patch: {}, local: l, reason: `Subject region averages luma ${r2(a.subjectLuma)} against ${r2(a.bgLuma)} for the background. ${opts.subjectBox ? "Region from the AI service's bounding box." : "Region is a saliency heuristic."} The mask is an ellipse, not a cut-out.`, expected: "Subject opened up without touching the background", strength: 0.5, kind: "correction", evidence: { subjectLuma: r2(a.subjectLuma), bgLuma: r2(a.bgLuma) } });
  }
  if (a.skyShare > 0.12 && a.skyLuma > 0.78) {
    const l = skyLayer(); l.source = "ai"; l.adjust.highlights = -35; l.adjust.exposure = -0.25; l.id = "ai-sky";
    add({ id: "local-sky", operation: "Sky highlight recovery (local)", techniques: ["Highlight Roll-off (Highlight Recovery)", "Linear Gradient Mask", "Sky Detection / AI Sky Mask"], patch: {}, local: l, reason: `A blue-ish region covering ${r2(a.skyShare * 100)}% of the frame averages luma ${r2(a.skyLuma)}, so the sky is bright relative to the rest.`, expected: "Sky tone restored while the foreground stays as is", strength: 0.5, kind: "correction", evidence: { skyShare: r2(a.skyShare), skyLuma: r2(a.skyLuma) } });
  }
  // --- Creative direction (never applied unless asked) ---
  if (intent === "bw") add({ id: "bw", operation: "Black and white conversion", techniques: ["Monochrome"], patch: { contrast: 15 }, reason: "User chose a black-and-white direction.", expected: "Monochrome rendering", strength: 1, kind: "enhancement", evidence: {} });
  if (intent === "moody") add({ id: "moody", operation: "Moody treatment", techniques: ["Tone Curve (S-Curve)", "Vignetting (Optical vs. Creative)"], patch: { contrast: 18, vignette: -22, exposure: -0.15 }, reason: "User chose a moody direction (creative intervention).", expected: "Darker, heavier mood", strength: 0.6, kind: "enhancement", evidence: {} });
  if (intent === "clean") add({ id: "clean", operation: "Clean professional finish", techniques: ["Clarity"], patch: { clarity: 8 }, reason: "User chose a clean direction.", expected: "Slightly crisper local contrast", strength: 0.3, kind: "enhancement", evidence: {} });
  // --- Personal style learned from the user's own feedback (visible, reversible, never overrides a correction) ---
  if (opts.learned && Object.keys(opts.learned.patch).length) {
    const lp: Record<string, number> = { ...(opts.learned.patch as Record<string, number>) }; const skipped: string[] = [];
    if (lp.exposure > 0 && a.p50 > 0.62) { delete lp.exposure; skipped.push("exposure (already bright)"); } if (lp.exposure < 0 && a.p50 < 0.28) { delete lp.exposure; skipped.push("exposure (already dark)"); }
    if (items.some((i) => i.id === "wb")) { delete lp.temperature; delete lp.tint; skipped.push("colour balance (a cast is already being corrected)"); }
    if (Object.keys(lp).length) add({ id: "learned", operation: "Personal style (learned)", techniques: [], patch: lp as Partial<EditParams>, reason: `Learned from ${opts.learned.n} of your earlier feedback entries (confidence ${Math.round(opts.learned.confidence * 100)}%). These are the corrections you usually made.`, expected: "Moves this photo toward your usual taste", strength: opts.learned.confidence, kind: "enhancement", evidence: { entries: opts.learned.n, confidence: opts.learned.confidence } });
    if (skipped.length) notes.push("Learned style skipped: " + skipped.join("; ") + ".");
  }
  if (a.subject.confidence > 0.4 && a.thirds.nearestPowerPoint > 0.2) notes.push("Composition: subject sits away from thirds intersections. Reframe suggestions are not applied automatically.");
  notes.push("Genre is " + (opts.genre ? "supplied by the AI service" : "unknown locally; pixel heuristics cannot reliably tell wildlife from landscape"));
  return { genre, intent, items, preserved, notes };
}

export function recipeToParams(items: RecipeItem[], enabled: Record<string, boolean>): Partial<EditParams> {
  const out: Partial<EditParams> = {}; const num = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "temperature", "tint", "vibrance", "saturation", "sharpAmount", "texture", "clarity", "nrLuma", "nrColor", "vignette", "grain", "straighten", "dehaze", "bloom", "halation", "distortion", "ca", "perspV", "perspH", "gradeShS", "gradeHiS", "gradeBal", "gradeShH", "gradeHiH"] as const;
  for (const it of items) { if (enabled[it.id] === false) continue;
    for (const k of num) if (it.patch[k] !== undefined) (out[k] as number) = ((out[k] as number) ?? 0) + (it.patch[k] as number);
    if (it.patch.sharpRadius !== undefined) out.sharpRadius = it.patch.sharpRadius; if (it.patch.bw) out.bw = true;
    if (it.id === "bw") out.bw = true; }
  return out;
}

/** Local layers produced by the recipe, scaled by the AI layer opacity. Rejected items are omitted. */
export function recipeLocals(items: RecipeItem[], enabled: Record<string, boolean>, aiOpacity: number): LocalLayer[] {
  return items.filter((i) => i.local && enabled[i.id] !== false).map((i) => ({ ...i.local!, opacity: i.local!.opacity * aiOpacity }));
}
void newLayer;
