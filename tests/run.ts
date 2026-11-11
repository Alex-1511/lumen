import { readFileSync } from "fs";
import { analyse } from "../lib/analysis";
import { plan, recipeToParams } from "../lib/planner";
import { buildCurveLUT, compose, defaultParams } from "../lib/params";
import { matchReference, styleProfile, describeStyle } from "../lib/reference";
import { encodeTiff } from "../lib/export";
import { writeFileSync } from "fs";
import { interpretRequest, mergeOps } from "../lib/intent";
import { buildReport, reportToMarkdown, termFor } from "../lib/report";
import { learnBias, describeLearned, learnedProfile, MIN_EVIDENCE } from "../lib/learn";
import { zipStore, crc32 } from "../lib/zip";
import { extractPreset, applyPresetTo } from "../lib/store";
import { geometryMask, newLayer, outToSrc, srcToOut, subjectEllipse, MapCtx } from "../lib/masks";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, info = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${info ? "  [" + info + "]" : ""}`); };

// ---- synthetic image factory (deterministic) ----
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
function make(w: number, h: number, f: (x: number, y: number) => [number, number, number], noise = 0) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = f(x / w, y / h); const n = noise ? (rnd() - 0.5) * noise * 255 : 0; const i = (y * w + x) * 4; d[i] = r * 255 + n; d[i + 1] = g * 255 + n; d[i + 2] = b * 255 + n; d[i + 3] = 255; }
  return d;
}
// scene: mid-grey ground, textured disc subject in centre for sharpness/saliency
const checker = (x: number, y: number, k = 40) => ((Math.floor(x * k) + Math.floor(y * k)) % 2 ? 1 : 0);
const scene = (gain: number, tint: [number, number, number] = [1, 1, 1], tex = true) => (x: number, y: number): [number, number, number] => {
  const inDisc = Math.hypot(x - 0.5, y - 0.5) < 0.18; const base = 0.42 + (inDisc && tex ? (checker(x, y) - 0.5) * 0.35 : 0) + (x - 0.5) * 0.25;
  const v = Math.min(1, Math.max(0, base * gain)); return [Math.min(1, v * tint[0]), Math.min(1, v * tint[1]), Math.min(1, v * tint[2])];
};
const W = 320, H = 240;
const has = (p: ReturnType<typeof plan>, id: string) => p.items.some((i) => i.id === id);

// 1 well-exposed neutral: planner must PRESERVE (no exposure, no WB)
{ const a = analyse(make(W, H, scene(1)), W, H); const p = plan(a);
  ok("neutral frame: no exposure op (preserve what works)", !has(p, "exposure"), `median=${a.p50.toFixed(2)}`);
  ok("neutral frame: no white-balance op", !has(p, "wb"), `bias=${(a.castR - a.castB).toFixed(3)}`);
  ok("neutral frame: preserved list is non-empty", p.preserved.length > 0); }
// 2 underexposed
{ const a = analyse(make(W, H, scene(0.35)), W, H); const p = plan(a);
  const ev = p.items.find((i) => i.id === "exposure")?.patch.exposure ?? 0;
  ok("underexposed: exposure raised", ev > 0.3, `ev=${ev}`); }
// 3 overexposed with clipping
{ const a = analyse(make(W, H, scene(2.2)), W, H); const p = plan(a);
  ok("overexposed: highlight clipping measured", a.clipHighPct > 5, `${a.clipHighPct.toFixed(1)}%`);
  ok("overexposed: highlight recovery proposed", has(p, "highlights")); ok("overexposed: exposure lowered", (p.items.find((i) => i.id === "exposure")?.patch.exposure ?? 0) < 0); }
// 4 warm cast on neutral scene
{ const a = analyse(make(W, H, (x, y) => { const v = 0.3 + 0.4 * x; return [Math.min(1, v * 1.12), v, v * 0.88]; }), W, H); const p = plan(a);
  const t = p.items.find((i) => i.id === "wb")?.patch.temperature ?? 0;
  ok("warm cast: detected and corrected cooler", t < 0, `temp=${t}`); }
// 5 cool cast
{ const a = analyse(make(W, H, (x, y) => { const v = 0.3 + 0.4 * x; return [v * 0.88, v, Math.min(1, v * 1.12)]; }), W, H); const p = plan(a);
  ok("cool cast: corrected warmer", (p.items.find((i) => i.id === "wb")?.patch.temperature ?? 0) > 0); }
// 6 noise
{ const clean = analyse(make(W, H, scene(1), 0), W, H); const noisy = analyse(make(W, H, scene(1), 0.12), W, H);
  ok("noise estimator: noisy > clean", noisy.noiseLuma > clean.noiseLuma * 2, `${clean.noiseLuma.toFixed(4)} vs ${noisy.noiseLuma.toFixed(4)}`);
  ok("noisy: NR proposed", has(plan(noisy), "nr")); ok("clean: NR not proposed", !has(plan(clean), "nr")); }
// 7 blur vs sharp
{ const sharp = analyse(make(W, H, scene(1, [1, 1, 1], true)), W, H);
  const blur = analyse(make(W, H, (x, y) => { const [r, g, b] = scene(1, [1, 1, 1], true)(Math.round(x * 20) / 20, Math.round(y * 20) / 20); return [r, g, b]; }), W, H);
  ok("sharpness: textured > flat", sharp.sharpness > blur.sharpness, `${sharp.sharpness.toFixed(4)} vs ${blur.sharpness.toFixed(4)}`); }
// 8 low-key stays low-key
{ const a = analyse(make(W, H, (x, y) => Math.hypot(x - 0.5, y - 0.5) < 0.14 ? [0.9, 0.85, 0.8] : [0.1, 0.1, 0.12]), W, H); const p = plan(a);
  ok("low-key: not brightened as an error", !has(p, "exposure") || (p.items.find((i) => i.id === "exposure")!.patch.exposure! <= 0), `lowKey=${a.lowKey}`); }
// 9 monochrome
{ const a = analyse(make(W, H, (x, y) => { const v = 0.2 + 0.6 * x; return [v, v, v]; }), W, H);
  ok("monochrome detected", a.isMonochrome); ok("monochrome: no WB op", !has(plan(a), "wb")); }
// 10 horizon tilt: antialiased edge tilted 4 degrees
{ const t = Math.tan((4 * Math.PI) / 180); const a = analyse(make(W, H, (x, y) => { const d = (y - 0.5 - (x - 0.5) * t * (W / H)) * H; const k = Math.min(1, Math.max(0, d / 4 + 0.5)); return [0.7 + (0.25 - 0.7) * k, 0.8 + (0.3 - 0.8) * k, 0.95 + (0.2 - 0.95) * k]; }), W, H);
  ok("horizon tilt magnitude about 4°", Math.abs(Math.abs(a.horizonTiltDeg) - 4) <= 1.5, `tilt=${a.horizonTiltDeg} conf=${a.horizonConfidence.toFixed(2)}`); }
// 11 subject near centre
{ const a = analyse(make(W, H, scene(1)), W, H); ok("subject centre near textured disc", Math.hypot(a.subject.cx - 0.5, a.subject.cy - 0.5) < 0.2, `(${a.subject.cx.toFixed(2)},${a.subject.cy.toFixed(2)})`); }

// ---- params / layers ----
{ const id = compose({}, 1, {}); const d = defaultParams(); ok("compose() of empty layers equals defaults", JSON.stringify(id) === JSON.stringify(d)); }
{ const p = compose({ exposure: 1 }, 0.5, { exposure: 0.25 }); ok("AI opacity scales AI layer and manual adds on top", Math.abs(p.exposure - 0.75) < 1e-9); }
{ const lut = buildCurveLUT([[0, 0], [0.25, 0.18], [0.75, 0.84], [1, 1]]); let mono = true; for (let i = 1; i < 256; i++) if (lut[i] < lut[i - 1] - 1e-6) mono = false;
  ok("S-curve LUT is monotone, endpoints preserved", mono && lut[0] === 0 && Math.abs(lut[255] - 1) < 1e-6); }
{ const id = buildCurveLUT([[0, 0], [1, 1]]); ok("identity curve is identity", Math.abs(id[128] - 128 / 255) < 1e-3); }
{ const p = plan(analyse(make(W, H, scene(0.35)), W, H)); const per = recipeToParams(p.items, { exposure: false }); ok("rejecting a recipe item removes its effect", (per.exposure ?? 0) === 0); }

// ---- reference matching ----
{ const dark = styleProfile(analyse(make(W, H, scene(0.5, [0.9, 1, 1.12])), W, H)); const warmBright = styleProfile(analyse(make(W, H, scene(1.4, [1.12, 1, 0.88])), W, H));
  const m = matchReference(dark, warmBright); const get = (k: string) => m.items.find((i) => i.key === k);
  ok("reference match: brighter reference raises exposure", (get("exposure")?.patch.exposure ?? 0) > 0.2, `ev=${get("exposure")?.patch.exposure}`);
  ok("reference match: warmer reference raises temperature", (get("temperature")?.patch.temperature ?? 0) > 5, `t=${get("temperature")?.patch.temperature}`);
  ok("reference match: every proposed item has a reason and a measurement", m.items.length > 0 && m.items.every((i) => i.reason && i.measured));
  const half = matchReference(dark, warmBright, 0.5); ok("reference match: strength scales the deltas", Math.abs((half.items.find((i) => i.key === "exposure")?.patch.exposure ?? 0) - (get("exposure")!.patch.exposure! * 0.5)) < 0.02);
  const self = matchReference(dark, dark); ok("reference match: a photo matched to itself proposes nothing", self.items.length === 0, `items=${self.items.map((i) => i.key)}`);
  ok("reference description mentions tonality and colour balance", describeStyle(warmBright).some((d) => /key/.test(d)) && describeStyle(warmBright).some((d) => /warm|cool|neutral/i.test(d))); }
// ---- masks ----
{ const ctxs: MapCtx[] = [{ srcW: 1600, srcH: 1067, crop: { x: 0, y: 0, w: 1, h: 1 }, straighten: 0 }, { srcW: 1600, srcH: 1067, crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 }, straighten: 7.5 }, { srcW: 900, srcH: 1600, crop: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, straighten: -4 }];
  let worst = 0; for (const c of ctxs) for (const [u, v] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.3], [0.2, 0.8]]) { const [sx, sy] = outToSrc(u, v, c); const [u2, v2] = srcToOut(sx, sy, c); worst = Math.max(worst, Math.hypot(u - u2, v - v2)); }
  ok("outToSrc / srcToOut are exact inverses (with crop + straighten)", worst < 1e-9, `worst=${worst.toExponential(1)}`);
  const id = outToSrc(0.3, 0.7, ctxs[0]); ok("identity geometry maps output uv to the same source uv", Math.abs(id[0] - 0.3) < 1e-9 && Math.abs(id[1] - 0.7) < 1e-9); }
{ const l = newLayer("linear"); l.linear = [0.5, 0.2, 0.5, 0.6]; l.feather = 0.5;
  const top = geometryMask(l, 0.5, 0.05, 1.5), mid = geometryMask(l, 0.5, 0.4, 1.5), bot = geometryMask(l, 0.5, 0.9, 1.5);
  ok("linear mask: full at start, ~half midway, zero beyond end", top > 0.99 && Math.abs(mid - 0.5) < 0.05 && bot < 0.01, `${top.toFixed(2)} ${mid.toFixed(2)} ${bot.toFixed(2)}`);
  let mono = true, prev = 2; for (let y = 0; y <= 1; y += 0.02) { const m = geometryMask(l, 0.5, y, 1.5); if (m > prev + 1e-9) mono = false; prev = m; } ok("linear mask falls monotonically", mono); }
{ const l = newLayer("radial"); l.radial = [0.5, 0.5, 0.2, 0.1]; l.feather = 0.3;
  ok("radial mask: 1 at centre, 0 outside ellipse, respects aspect of axes", geometryMask(l, 0.5, 0.5, 1) > 0.99 && geometryMask(l, 0.8, 0.5, 1) < 0.01 && geometryMask(l, 0.5, 0.66, 1) < 0.01 && geometryMask(l, 0.65, 0.5, 1) > 0.2);
  const hard = { ...l, feather: 0.001 }; ok("radial feather ~0 gives a hard edge", geometryMask(hard, 0.49 + 0.2 - 0.02, 0.5, 1) > 0.99 && geometryMask(hard, 0.5 + 0.2 + 0.01, 0.5, 1) < 0.01); }
{ const s = subjectEllipse({ x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, false); ok("subject ellipse covers its box centre and is labelled approximate", geometryMask(s, 0.4, 0.4, 1) > 0.99 && /approx/i.test(s.name) && !!s.note); }
// ---- registry integrity: no technique cited by the planner is missing, no 'implemented' claim without an implementation ----
const reg: { name: string; full: string; status: string; impl: string | null }[] = JSON.parse(readFileSync("data/registry.json", "utf8"));
const names = new Set(reg.flatMap((r) => [r.name.toLowerCase(), r.full.toLowerCase()]));
const planSrc = readFileSync("lib/planner.ts", "utf8"); const cited = [...planSrc.matchAll(/techniques: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
const missing = [...new Set(cited)].filter((c) => !reg.some((r) => r.full.toLowerCase().startsWith(c.toLowerCase()) || r.name.toLowerCase() === c.toLowerCase()));
ok("every technique cited by the planner exists in the registry", missing.length === 0, missing.join(" | "));
const paramKeys = new Set(Object.keys(defaultParams()));
const badImpl = reg.filter((r) => (r.status === "implemented" || r.status === "partial") && r.impl?.startsWith("param:") && !paramKeys.has(r.impl.slice(6)));
ok("every param-backed implemented/partial entry points at a real parameter", badImpl.length === 0, badImpl.map((b) => b.name).join(", "));
const noImpl = reg.filter((r) => r.status === "implemented" && !r.impl);
ok("no 'implemented' entry lacks an implementation reference", noImpl.length === 0, noImpl.map((b) => b.name).join(", "));
const MASKREFS = new Set(["layers", "radial", "linear", "luminance", "color", "brush", "feather", "invert", "limiters"]);
const badMask = reg.filter((r) => r.impl?.startsWith("mask:") && !MASKREFS.has(r.impl.slice(5)));
ok("every mask-backed registry entry references a real mask capability", badMask.length === 0, badMask.map((b) => b.name).join(", "));

// ---- TIFF encoder ----
{ const w = 5, h = 3, rgba = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) { rgba[i * 4] = i * 10; rgba[i * 4 + 1] = 255 - i * 10; rgba[i * 4 + 2] = i; rgba[i * 4 + 3] = 255; }
  const t = encodeTiff(rgba, w, h), dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const tags: Record<number, number> = {}; const n = dv.getUint16(8, true); for (let i = 0; i < n; i++) { const o = 10 + i * 12; tags[dv.getUint16(o, true)] = dv.getUint16(o + 2, true) === 3 && dv.getUint32(o + 4, true) === 1 ? dv.getUint16(o + 8, true) : dv.getUint32(o + 8, true); }
  ok("tiff: header is little-endian TIFF magic 42", t[0] === 0x49 && t[1] === 0x49 && dv.getUint16(2, true) === 42);
  ok("tiff: width, height, RGB, 3 samples, 1 strip are declared", tags[256] === w && tags[257] === h && tags[262] === 2 && tags[277] === 3 && tags[279] === w * h * 3);
  ok("tiff: pixel data round-trips and alpha is dropped", t.length === tags[273] + w * h * 3 && t[tags[273]] === 0 && t[tags[273] + 1] === 255 && t[tags[273] + 3 * 7] === 70 && t[tags[273] + 3 * 7 + 2] === 7);
  writeFileSync(process.env.TIFF_OUT ?? "/tmp/lumen-test.tif", t); }

// ---- zip + presets ----
ok("zip: crc32 matches the known check value", crc32(new TextEncoder().encode("123456789")) === 0xcbf43926);
writeFileSync("/tmp/lumen-test.zip", zipStore([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "dir/b.bin", data: new Uint8Array([0, 1, 2, 255]) }]));
{ const m = { exposure: 0.4, temperature: 5, straighten: 2, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, perspV: 20, ca: 3, hslH: [1, 0, 0, 0, 0, 0, 0, 0] } as any; const pr = extractPreset(m);
  ok("preset: geometry and lens-optics fields are never saved", !("straighten" in pr) && !("crop" in pr) && !("perspV" in pr) && !("ca" in pr) && pr.exposure === 0.4 && (pr as any).hslH[0] === 1);
  const tgt = { straighten: 1.5, crop: { x: 0, y: 0, w: 1, h: 1 }, exposure: -1 } as any, out = applyPresetTo(tgt, pr) as any;
  ok("preset: applying overrides colour/tone but keeps the target's own geometry", out.exposure === 0.4 && out.straighten === 1.5 && out.crop.w === 1);
  (pr as any).hslH[0] = 9; ok("preset: stored values are deep-copied", (out as any).hslH[0] === 1); }

// ---- offline intent interpreter ----
{ const r = interpretRequest("Make it a bit warmer and brighter, more contrast"); const m = mergeOps(r.ops) as any;
  ok("intent: warmer + brighter + contrast produce the right signed deltas", m.temperature > 0 && m.exposure > 0 && m.contrast > 0 && r.unmatched.length === 0, JSON.stringify(m));
  const gentle = mergeOps(interpretRequest("slightly warmer").ops) as any, strong = mergeOps(interpretRequest("a lot warmer").ops) as any, plain = mergeOps(interpretRequest("warmer").ops) as any;
  ok("intent: 'slightly' < plain < 'a lot'", gentle.temperature < plain.temperature && plain.temperature < strong.temperature, `${gentle.temperature} < ${plain.temperature} < ${strong.temperature}`);
  const sh = mergeOps(interpretRequest("the shadows are too dark").ops) as any; ok("intent: 'shadows too dark' lifts shadows and does NOT also raise exposure", sh.shadows > 0 && sh.exposure === undefined, JSON.stringify(sh));
  const g = interpretRequest("remove the person on the left and make it warmer"); ok("intent: removal is refused explicitly while the rest still applies", g.unsupported.length === 1 && /Retouch tab/i.test(g.unsupported[0].why) && (mergeOps(g.ops) as any).temperature > 0);
  const u = interpretRequest("make it feel like Tuesday"); ok("intent: unknown wording is reported, not guessed", u.ops.length === 0 && u.unmatched.length === 1 && /Not understood/.test(u.notes[0]));
  const bw = mergeOps(interpretRequest("black and white, moody").ops) as any; ok("intent: B&W sets the flag and moody adds a vignette", bw.bw === true && bw.vignette < 0);
  const to = mergeOps(interpretRequest("teal and orange").ops) as any; const pp = compose({}, 1, to); ok("intent: teal/orange resolves to hue 190 / 35 after the base offset", Math.abs(pp.gradeShH - 190) < 1e-9 && Math.abs(pp.gradeHiH - 35) < 1e-9 && pp.gradeShS === 28);
  const v = mergeOps(interpretRequest("no vignette").ops) as any; ok("intent: 'no vignette' is the opposite of 'vignette'", v.vignette > 0 && (mergeOps(interpretRequest("add a vignette").ops) as any).vignette < 0); }

// ---- edit report ----
{ const a = analyse(make(W, H, scene(0.35, [1.15, 1, 0.8])), W, H); const p = plan(a); const en: Record<string, boolean> = {}; const ai = recipeToParams(p.items, en);
  const manual: any = { contrast: 12, hslS: [0, 0, 0, 0, 0, 0, 0, 0] }; const params = compose(ai, 1, manual);
  const rep = buildReport({ analysis: a, plan: p, enabled: en, aiOpacity: 1, manual, params, locals: [], events: [], usedGemini: false });
  ok("report: AI recipe rows mirror the plan items one-to-one", rep.rows.filter((r) => r.source.startsWith("AI")).length === p.items.length && p.items.length > 0, `${rep.rows.length} rows`);
  ok("report: a manual edit appears with its final value", rep.rows.some((r) => r.source === "Your edit" && /Contrast \+12/.test(r.how)));
  ok("report: all-zero HSL arrays are not reported as edits", !rep.rows.some((r) => /HSL/.test(r.what)));
  ok("report: every listed term exists in the registry with a status", rep.terms.length > 0 && rep.terms.every((t) => ["implemented", "partial", "ai-assisted", "experimental", "planned", "unsupported"].includes(t.status)), rep.terms.map((t) => t.name).join(", "));
  ok("report: states 0 generative edits and never lists Gemini when unused", rep.counts.generative === 0 && !rep.tools.some((t) => /Gemini/.test(t)) && /not used/.test(rep.method[3]));
  ok("report: tools include the shader and CPU analysis", rep.tools.some((t) => /WebGL2/.test(t)) && rep.tools.some((t) => /CPU analysis/.test(t)));
  const off = buildReport({ analysis: a, plan: p, enabled: Object.fromEntries(p.items.map((i) => [i.id, false])), aiOpacity: 1, manual: {}, params: defaultParams(), locals: [], events: [], usedGemini: true });
  ok("report: rejected recipe items disappear; empty state is stated plainly", off.rows.length === 0 && /No edits/.test(off.headline) && off.tools.some((t) => /Gemini/.test(t)));
  ok("report: registry lookup resolves a control to its glossary term", termFor("exposure")?.name === "Exposure" && /Color Temperature|White Balance/i.test(termFor("temperature")?.name ?? ""), termFor("temperature")?.name);
  ok("report: markdown export contains the sections", /## What was edited/.test(reportToMarkdown(rep, "x")) && /## Tools used/.test(reportToMarkdown(rep, "x"))); }

// ---- planner patches reach the render params (regression: dehaze was dropped by recipeToParams) ----
{ const items: any[] = [{ id: "t", operation: "t", techniques: [], patch: { dehaze: 20, bloom: 10, gradeShS: 12, exposure: 0.2 }, region: "global", maskRef: null, reason: "", expected: "", strength: 1, reversible: true, kind: "enhancement", evidence: {} }];
  const out = recipeToParams(items, {}) as any; ok("recipeToParams carries dehaze, bloom and grading patches into the AI layer", out.dehaze === 20 && out.bloom === 10 && out.gradeShS === 12 && out.exposure === 0.2); }

// ---- learning ----
{ const fb = (o: any) => ({ id: Math.random().toString(), projectId: "p", projectName: "p", at: 0, genre: "landscape", intent: "natural", liked: true, comment: "", requests: [], recipe: {}, manual: {}, correction: {}, ...o }) as any;
  ok("learn: nothing is learned from fewer than the minimum evidence", learnBias([fb({ manual: { exposure: 0.4 } })], "landscape") === null && MIN_EVIDENCE === 2);
  const three = [0, 1, 2].map(() => fb({ manual: { exposure: 0.4, temperature: 6 } })); const L = learnBias(three, "landscape")!;
  ok("learn: consistent liked corrections become a bounded, shrunk bias", L && L.patch.exposure! > 0.1 && L.patch.exposure! <= 0.6 && L.patch.exposure! < 0.4 && L.confidence > 0.3 && L.confidence < 0.6, JSON.stringify(L?.patch));
  const mixed = learnBias([fb({ manual: { exposure: 0.4 } }), fb({ manual: { exposure: -0.4 } })], "landscape")!; ok("learn: opposite corrections cancel instead of picking a side", !("exposure" in mixed.patch));
  const many = learnBias(Array.from({ length: 40 }, () => fb({ manual: { exposure: 5, contrast: 90 } })), "landscape")!; ok("learn: bias is clamped to safe limits no matter the input", many.patch.exposure! <= 0.6 && many.patch.contrast! <= 20);
  const cm = learnBias([fb({ correction: { exposure: 0.5 }, liked: false }), fb({ correction: { exposure: 0.5 }, liked: false })], "landscape")!; ok("learn: a disliked edit's comment correction still counts fully", cm.patch.exposure! > 0.1 && cm.disliked === 2);
  const six = (g: string) => Array.from({ length: 6 }, () => fb({ genre: g, manual: { contrast: 10 } })); const other = learnBias(six("portrait"), "landscape")!, same = learnBias(six("landscape"), "landscape")!;
  ok("learn: other-genre feedback alone still needs enough total weight", learnBias([fb({ genre: "portrait", manual: { contrast: 10 } }), fb({ genre: "portrait", manual: { contrast: 10 } })], "landscape") === null);
  ok("learn: same-genre feedback weighs more than other-genre feedback", same.patch.contrast! > other.patch.contrast!, `${same.patch.contrast} vs ${other.patch.contrast}`);
  ok("learn: description is plain language and states the confidence", describeLearned(L).some((l) => /confidence/.test(l)) && describeLearned(L).some((l) => /warmer/.test(l)) && describeLearned(null)[0].startsWith("Not enough"));
  const a1 = analyse(make(W, H, scene(1)), W, H); const pl = plan(a1, { learned: L }); const it = pl.items.find((i) => i.id === "learned");
  ok("learn: planner adds a visible 'learned' item with its evidence", !!it && it.kind === "enhancement" && (it.patch.exposure ?? 0) > 0 && it.evidence.entries === 3);
  const bright = analyse(make(W, H, scene(1.9)), W, H); const pb = plan(bright, { learned: L }); ok("learn: exposure bias is skipped when the photo is already bright (preserve what works)", !(pb.items.find((i) => i.id === "learned")?.patch.exposure) && bright.p50 > 0.62, `p50=${bright.p50.toFixed(2)}`);
  const cast = analyse(make(W, H, (x, y) => { const v = 0.3 + 0.4 * x; return [Math.min(1, v * 1.12), v, v * 0.88]; }), W, H); const pc = plan(cast, { learned: L }); ok("learn: colour-balance bias is skipped when a cast is being corrected", has(pc, "wb") && !pc.items.find((i) => i.id === "learned")?.patch.temperature);
  ok("learn: without feedback the plan is unchanged", plan(a1).items.length === plan(a1, { learned: null }).items.length && !has(plan(a1, { learned: null }), "learned"));
  const mk2 = (m: number) => ({ id: "r", name: "r", created: 0, thumb: null as any, profile: { median: m, p1: 0.1, p5: 0.1, p95: 0.9, p99: 0.95, meanSat: 0.3, warmth: 0.1, tintBias: 0, sharpness: 0.05, edgeCentreRatio: 0.9, bandWeight: Array(8).fill(0.1), bandSat: Array(8).fill(0.3), mono: false, clipHighPct: 0 } });
  const lp = learnedProfile([mk2(0.3), mk2(0.5)] as any)!; ok("learn: learned reference profile is the mean of the references", Math.abs(lp.median - 0.4) < 1e-9 && learnedProfile([]) === null); }
void names;
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
