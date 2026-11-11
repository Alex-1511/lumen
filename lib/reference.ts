// Reference-style matching. A reference photograph is measured, then GLOBAL parameter deltas are proposed that move the
// current edit's measurable characteristics toward it. It never transfers content, local lighting or identity.
import type { Analysis } from "./analysis";
import { EditParams, HSL_BANDS, clamp } from "./params";

export interface StyleProfile {
  median: number; p1: number; p5: number; p95: number; p99: number; meanSat: number; warmth: number; tintBias: number;
  sharpness: number; edgeCentreRatio: number; bandWeight: number[]; bandSat: number[]; mono: boolean; clipHighPct: number;
}
const logRatio = (a: number, b: number) => Math.log(Math.max(1e-3, a) / Math.max(1e-3, b));
export function styleProfile(a: Analysis): StyleProfile {
  const [r, g, b] = a.meanRGB;
  return { median: a.p50, p1: a.p1, p5: a.p5, p95: a.p95, p99: a.p99, meanSat: a.meanSat, warmth: logRatio(r, b), tintBias: logRatio(g, (r + b) / 2), sharpness: a.sharpness, edgeCentreRatio: a.edgeCentreRatio, bandWeight: a.bandWeight, bandSat: a.bandSat, mono: a.isMonochrome, clipHighPct: a.clipHighPct };
}
export interface MatchItem { key: string; label: string; patch: Partial<EditParams>; reason: string; measured: string }
export interface MatchResult { items: MatchItem[]; description: string[]; notes: string[] }

const n2 = (v: number) => Math.round(v * 100) / 100;
export function describeStyle(p: StyleProfile): string[] {
  const out: string[] = [];
  out.push(p.median < 0.3 ? "Low-key: dark overall tonality" : p.median > 0.6 ? "High-key: bright overall tonality" : "Mid-key tonality");
  out.push(p.p99 - p.p1 > 0.85 ? "Wide tonal range, deep blacks and bright whites" : p.p99 - p.p1 < 0.6 ? "Compressed, low-contrast tonal range" : "Moderate tonal range");
  out.push(p.p1 > 0.07 ? "Lifted (faded) blacks" : p.p1 < 0.02 ? "Deep, true blacks" : "Natural blacks");
  out.push(p.meanSat > 0.5 ? "Strongly saturated colour" : p.meanSat < 0.2 ? "Muted, desaturated colour" : "Moderate saturation");
  out.push(p.warmth > 0.12 ? "Warm colour balance" : p.warmth < -0.12 ? "Cool colour balance" : "Neutral colour balance");
  if (p.edgeCentreRatio < 0.8) out.push("Edges darker than the centre (vignette or natural fall-off)");
  const dom = p.bandWeight.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0]).filter((x) => x[0] > 0.04).slice(0, 3).map((x) => HSL_BANDS[x[1]]);
  if (dom.length) out.push("Dominant hues: " + dom.join(", "));
  return out;
}

/** Deltas to apply ON TOP of the current edit, computed from the measured current render vs the reference. */
export function matchReference(cur: StyleProfile, ref: StyleProfile, strength = 1): MatchResult {
  const items: MatchItem[] = []; const notes: string[] = []; const k = clamp(strength, 0, 1);
  const add = (key: string, label: string, patch: Partial<EditParams>, reason: string, measured: string) => items.push({ key, label, patch, reason, measured });
  const dMed = ref.median - cur.median;
  if (Math.abs(dMed) > 0.04 && !cur.mono) { const ev = clamp(Math.log2(Math.pow(Math.max(0.02, ref.median), 2.2) / Math.pow(Math.max(0.02, cur.median), 2.2)) * 0.8, -1.5, 1.5) * k; add("exposure", "Overall brightness", { exposure: n2(ev) }, "Move the median tone toward the reference.", `median ${n2(cur.median)} → ${n2(ref.median)}`); }
  const dBlack = ref.p1 - cur.p1, dWhite = ref.p99 - cur.p99;
  if (Math.abs(dBlack) > 0.03) add("blacks", "Black point", { blacks: n2(clamp(dBlack * 220, -40, 40) * k) }, dBlack > 0 ? "Reference has lifted blacks (faded look)." : "Reference has deeper blacks.", `p1 ${n2(cur.p1)} → ${n2(ref.p1)}`);
  if (Math.abs(dWhite) > 0.03) add("whites", "White point", { whites: n2(clamp(dWhite * 220, -40, 40) * k) }, dWhite > 0 ? "Reference whites are brighter." : "Reference whites are held back.", `p99 ${n2(cur.p99)} → ${n2(ref.p99)}`);
  const rangeRef = ref.p95 - ref.p5, rangeCur = cur.p95 - cur.p5;
  if (Math.abs(rangeRef - rangeCur) > 0.06) add("contrast", "Contrast", { contrast: n2(clamp((rangeRef - rangeCur) * 90, -35, 35) * k) }, rangeRef > rangeCur ? "Reference has stronger tonal separation." : "Reference is softer in tonal separation.", `5–95% range ${n2(rangeCur)} → ${n2(rangeRef)}`);
  const dShadow = ref.p5 - cur.p5; if (Math.abs(dShadow) > 0.05 && Math.abs(dBlack) <= 0.03) add("shadows", "Shadows", { shadows: n2(clamp(dShadow * 160, -35, 35) * k) }, "Shadow placement differs from the reference.", `p5 ${n2(cur.p5)} → ${n2(ref.p5)}`);
  if (!cur.mono && !ref.mono) {
    const dw = ref.warmth - cur.warmth; if (Math.abs(dw) > 0.04) add("temperature", "Colour temperature", { temperature: n2(clamp(dw * 160, -40, 40) * k) }, dw > 0 ? "Reference is warmer." : "Reference is cooler.", `warmth ${n2(cur.warmth)} → ${n2(ref.warmth)}`);
    const dt = ref.tintBias - cur.tintBias; if (Math.abs(dt) > 0.03) add("tint", "Tint", { tint: n2(clamp(-dt * 200, -20, 20) * k) }, dt > 0 ? "Reference leans greener." : "Reference leans more magenta.", `green bias ${n2(cur.tintBias)} → ${n2(ref.tintBias)}`);
    const ds = ref.meanSat / Math.max(0.02, cur.meanSat); if (ds > 1.12 || ds < 0.88) add("saturation", "Colour intensity", { vibrance: n2(clamp((ds - 1) * 60, -30, 30) * k * 0.6), saturation: n2(clamp((ds - 1) * 45, -25, 25) * k * 0.4) }, ds > 1 ? "Reference is more saturated. Mostly vibrance, to protect skin and already-rich colours." : "Reference is more muted.", `mean saturation ${n2(cur.meanSat)} → ${n2(ref.meanSat)}`);
    const hs = Array(8).fill(0); let any = false;
    for (let i = 0; i < 8; i++) if (cur.bandWeight[i] > 0.02 && ref.bandWeight[i] > 0.02 && cur.bandSat[i] > 0.05) { const r = ref.bandSat[i] / cur.bandSat[i] / Math.max(0.5, ds > 0 ? ds : 1); if (r > 1.15 || r < 0.87) { hs[i] = clamp((r - 1) * 50, -30, 30) * k; any = true; } }
    if (any) add("hsl", "Per-colour saturation", { hslS: hs.map(n2) }, "Individual hue bands differ in intensity from the reference (only bands present in both photos).", HSL_BANDS.map((b, i) => (hs[i] ? `${b} ${hs[i] > 0 ? "+" : ""}${n2(hs[i])}` : "")).filter(Boolean).join(", "));
  } else notes.push("One of the photographs is monochrome, so colour matching was skipped.");
  if (ref.edgeCentreRatio < 0.82 && cur.edgeCentreRatio > 0.9) add("vignette", "Vignette", { vignette: n2(-clamp((0.9 - ref.edgeCentreRatio) * 120, 8, 35) * k) }, "Reference edges are noticeably darker than its centre.", `edge/centre ${n2(cur.edgeCentreRatio)} → ${n2(ref.edgeCentreRatio)}`);
  if (ref.sharpness > cur.sharpness * 1.6 && cur.sharpness < 0.05) add("sharpen", "Sharpening", { sharpAmount: n2(clamp((ref.sharpness / Math.max(1e-3, cur.sharpness) - 1) * 12, 0, 40) * k) }, "Reference shows crisper edge detail. Sharpening cannot add detail that was not captured.", `edge energy ${n2(cur.sharpness * 1000) / 1000} → ${n2(ref.sharpness * 1000) / 1000}`);
  notes.push("Global matching only: tone, colour balance and saturation. It cannot reproduce the reference's lighting, subject isolation or local contrast, and your photograph's subject is untouched.");
  return { items, description: describeStyle(ref), notes };
}
