// "Learning" here means exactly this, and nothing more: a stored, inspectable summary of (a) the references you uploaded and
// (b) the corrections you made / asked for on your own photos. It biases the deterministic planner. It does NOT train a neural model.
import type { EditParams } from "./params";
import type { FeedbackEntry, RefPhoto } from "./store";
import type { Genre } from "./planner";
import type { StyleProfile } from "./reference";

export const LEARN_KEYS = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "temperature", "tint", "vibrance", "saturation", "texture", "clarity", "sharpAmount", "vignette", "grain", "dehaze"] as const;
export type LearnKey = (typeof LEARN_KEYS)[number];
const LIMIT: Record<LearnKey, number> = { exposure: 0.6, contrast: 20, highlights: 25, shadows: 25, whites: 20, blacks: 20, temperature: 15, tint: 10, vibrance: 20, saturation: 15, texture: 15, clarity: 15, sharpAmount: 20, vignette: 20, grain: 12, dehaze: 20 };
const MIN: Record<LearnKey, number> = { exposure: 0.04, contrast: 1, highlights: 1, shadows: 1, whites: 1, blacks: 1, temperature: 1, tint: 1, vibrance: 1, saturation: 1, texture: 1, clarity: 1, sharpAmount: 1, vignette: 1, grain: 1, dehaze: 1 };
export const MIN_EVIDENCE = 2; // effective sample size needed before anything is applied

export interface Learned { n: number; nGenre: number; effective: number; confidence: number; patch: Partial<EditParams>; raw: Partial<EditParams>; liked: number; disliked: number }
const num = (o: Partial<EditParams>, k: LearnKey) => ((o[k] as number | undefined) ?? 0);

/** Weighted mean of the corrections the user made, shrunk by confidence = N/(N+4). Same-genre entries count fully, others 40%. */
export function learnBias(fb: FeedbackEntry[], genre: Genre): Learned | null {
  if (!fb.length) return null;
  let wSum = 0, nGenre = 0; const acc: Record<string, number> = {}; let liked = 0, disliked = 0;
  for (const e of fb) {
    const gw = genre === "unknown" || e.genre === "unknown" || e.genre === genre ? 1 : 0.4; if (gw === 1 && genre !== "unknown" && e.genre === genre) nGenre++;
    const mw = e.liked === true ? 1 : e.liked === false ? 0.6 : 0.5;
    if (e.liked === true) liked++; else if (e.liked === false) disliked++;
    const has = LEARN_KEYS.some((k) => num(e.manual, k) || num(e.correction, k)); if (!has) continue;
    for (const k of LEARN_KEYS) acc[k] = (acc[k] ?? 0) + gw * (mw * num(e.manual, k) + num(e.correction, k));
    wSum += gw;
  }
  if (wSum < MIN_EVIDENCE) return null;
  const conf = wSum / (wSum + 4); const raw: Partial<EditParams> = {}, patch: Partial<EditParams> = {};
  for (const k of LEARN_KEYS) { const mean = (acc[k] ?? 0) / wSum; (raw as any)[k] = Math.round(mean * 100) / 100; const v = Math.max(-LIMIT[k], Math.min(LIMIT[k], mean * conf)); if (Math.abs(v) >= MIN[k]) (patch as any)[k] = Math.round(v * 100) / 100; }
  return { n: fb.length, nGenre, effective: Math.round(wSum * 100) / 100, confidence: Math.round(conf * 100) / 100, patch, raw, liked, disliked };
}

/** Plain-language lines for the "what I've learned" panel. */
export function describeLearned(l: Learned | null): string[] {
  if (!l) return ["Not enough feedback yet. Learning starts after at least 2 pieces of feedback that contain a change or a comment."];
  const name: Record<LearnKey, [string, string]> = { exposure: ["brighter", "darker"], contrast: ["more contrast", "less contrast"], highlights: ["brighter highlights", "calmer highlights"], shadows: ["lifted shadows", "deeper shadows"], whites: ["brighter whites", "softer whites"], blacks: ["lifted blacks", "deeper blacks"], temperature: ["warmer", "cooler"], tint: ["more magenta", "greener"], vibrance: ["more vibrance", "less vibrance"], saturation: ["more saturation", "less saturation"], texture: ["more texture", "less texture"], clarity: ["more clarity", "less clarity"], sharpAmount: ["sharper", "softer"], vignette: ["less vignette", "more vignette"], grain: ["more grain", "less grain"], dehaze: ["more dehaze", "less dehaze"] };
  const lines = Object.entries(l.patch).map(([k, v]) => `You tend to want ${name[k as LearnKey][(v as number) > 0 ? 0 : 1]} (${(v as number) > 0 ? "+" : ""}${v}${k === "exposure" ? " EV" : ""} applied).`);
  return [`Based on ${l.n} feedback entr${l.n === 1 ? "y" : "ies"} (${l.liked} liked, ${l.disliked} disliked), confidence ${Math.round(l.confidence * 100)}%.`, ...(lines.length ? lines : ["Your corrections so far are too small or mixed to act on."])];
}

/** Mean of the reference photos' measured profiles. Used by the "Learned style" match in the Reference tab. */
export function learnedProfile(refs: RefPhoto[]): StyleProfile | null {
  const ps = refs.map((r) => r.profile as StyleProfile).filter((p) => p && typeof p.median === "number"); if (!ps.length) return null;
  const mean = (f: (p: StyleProfile) => number) => ps.reduce((a, p) => a + f(p), 0) / ps.length; const arr = (f: (p: StyleProfile) => number[]) => f(ps[0]).map((_, i) => mean((p) => f(p)[i]));
  return { median: mean((p) => p.median), p1: mean((p) => p.p1), p5: mean((p) => p.p5), p95: mean((p) => p.p95), p99: mean((p) => p.p99), meanSat: mean((p) => p.meanSat), warmth: mean((p) => p.warmth), tintBias: mean((p) => p.tintBias), sharpness: mean((p) => p.sharpness), edgeCentreRatio: mean((p) => p.edgeCentreRatio), bandWeight: arr((p) => p.bandWeight), bandSat: arr((p) => p.bandSat), mono: ps.filter((p) => p.mono).length > ps.length / 2, clipHighPct: mean((p) => p.clipHighPct) };
}
