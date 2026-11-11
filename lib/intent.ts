// Offline edit-request interpreter. Deterministic phrase table -> parameter deltas. No model, no guessing:
// anything it does not recognise is reported back as "not understood", and generative/retouch requests are refused explicitly.
import { BASE, EditParams } from "./params";
import { LOCAL_MAP } from "./effects";
import type { LocalAdjust } from "./masks";
import { PRESERVE_RE, findTarget } from "./targets";

export interface IntentOp { key: string; label: string; patch: Partial<EditParams>; reason: string; matched: string }
export interface IntentLayer { target: string; label: string; adjust: Partial<LocalAdjust>; matched: string[]; reasons: string[]; limitHighlights: boolean; caveat?: string }
export interface IntentResult { layers: IntentLayer[]; ops: IntentOp[]; unsupported: { phrase: string; why: string }[]; unmatched: string[]; notes: string[] }

interface Rule { key: string; label: string; re: RegExp; make: (m: number) => Partial<EditParams>; reason: string }
const hue = (k: "gradeShH" | "gradeHiH", v: number) => v - (BASE[k] ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

// Specific rules first: a matched phrase is consumed so a broader rule cannot match it again.
const RULES: Rule[] = [
  { key: "bokeh", label: "Background blur (bokeh)", re: /\b(blur (the )?background|bokeh|portrait mode)\b/, make: (m) => ({ bokeh: r2(65 * m) }), reason: "Bokeh blurs outside an estimated subject ellipse (no depth map, so it is approximate)." },
  { key: "tilt", label: "Tilt-shift", re: /\b(tilt.?shift|miniature)\b/, make: (m) => ({ tiltShift: r2(70 * m), saturation: r2(14 * m) }), reason: "Tilt-shift keeps a band sharp and blurs above and below." },
  { key: "motion", label: "Motion blur", re: /\bmotion blur\b/, make: (m) => ({ motionBlur: r2(35 * m) }), reason: "Horizontal motion streak." },
  { key: "mosaic", label: "Mosaic", re: /\b(mosaic|pixelat\w*)\b/, make: (m) => ({ mosaic: r2(35 * m) }), reason: "Averages the image into blocks." },
  { key: "softfocus", label: "Soft focus", re: /\bsoft focus\b/, make: (m) => ({ softFocus: r2(45 * m) }), reason: "Glow over sharp detail." },
  { key: "gblur", label: "Blur", re: /\b(gaussian blur|box blur|blur it|blurry look|add blur)\b/, make: (m) => ({ gaussBlur: r2(35 * m) }), reason: "You asked for a blur." },
  { key: "shadows+", label: "Lift shadows", re: /\b(lift|open( up)?|brighten|raise) (the )?shadows\b|\bshadows (are )?too dark\b/, make: (m) => ({ shadows: r2(30 * m) }), reason: "You asked for brighter shadows." },
  { key: "highlights-", label: "Recover highlights", re: /\b(recover|tame|reduce|pull (back|down)|calm) (the )?highlights\b|\bblown( out)? highlights\b|\bhighlights (are )?too (bright|hot)\b/, make: (m) => ({ highlights: r2(-35 * m) }), reason: "You asked for calmer highlights." },
  { key: "blacks-", label: "Deeper blacks", re: /\b(deeper|richer|darker|crush(ed)?) blacks\b/, make: (m) => ({ blacks: r2(-20 * m) }), reason: "You asked for deeper blacks." },
  { key: "whites+", label: "Brighter whites", re: /\b(brighter|whiter|brighten) whites\b/, make: (m) => ({ whites: r2(20 * m) }), reason: "You asked for brighter whites." },
  { key: "moody", label: "Moody look", re: /\b(dark and )?moody\b/, make: (m) => ({ exposure: r2(-0.3 * m), contrast: r2(18 * m), shadows: r2(-18 * m), vignette: r2(-20 * m) }), reason: "Moody = slightly darker, more contrast, deeper shadows, edge fall-off." },
  { key: "airy", label: "Bright and airy look", re: /\b(bright and airy|light and airy|airy)\b/, make: (m) => ({ exposure: r2(0.4 * m), shadows: r2(25 * m), contrast: r2(-10 * m), whites: r2(10 * m) }), reason: "Airy = brighter, open shadows, softer contrast." },
  { key: "teal-orange", label: "Teal and orange grade", re: /\bteal (and|&|\/) orange\b|\bcinematic colou?rs?\b/, make: () => ({ gradeShH: hue("gradeShH", 190), gradeShS: 28, gradeHiH: hue("gradeHiH", 35), gradeHiS: 24 }), reason: "Teal shadows and orange highlights (split toning)." },
  { key: "bw", label: "Black and white", re: /\b(black (and|&) white|b ?& ?w|monochrome|mono)\b/, make: () => ({ bw: true }), reason: "You asked for black and white." },
  { key: "glow", label: "Soft glow", re: /\b(dreamy|glow(y|ing)?|hazy glow)\b/, make: (m) => ({ clarity: r2(-20 * m), bloom: r2(25 * m) }), reason: "Soft glow = lower clarity plus highlight bloom." },
  { key: "dehaze", label: "Dehaze", re: /\b(dehaze|haze|hazy|foggy|fog|misty)\b/, make: (m) => ({ dehaze: r2(30 * m) }), reason: "You mentioned haze." },
  { key: "vignette+", label: "Remove vignette", re: /\b(no|remove|less|reduce) (the )?vignett\w*/, make: (m) => ({ vignette: r2(25 * m) }), reason: "You asked for less vignette." },
  { key: "vignette-", label: "Add vignette", re: /\bvignett\w*/, make: (m) => ({ vignette: r2(-25 * m) }), reason: "You asked for a vignette." },
  { key: "brighter", label: "Brighter", re: /\b(brighter|lighter|brighten|more exposure|too dark|underexposed)\b/, make: (m) => ({ exposure: r2(0.5 * m) }), reason: "You asked for a brighter image." },
  { key: "darker", label: "Darker", re: /\b(darker|darken|dim(mer)?|less exposure|too bright|overexposed)\b/, make: (m) => ({ exposure: r2(-0.5 * m) }), reason: "You asked for a darker image." },
  { key: "contrast+", label: "More contrast", re: /\b(more contrast|add contrast|punch(y|ier)|contrasty|too flat|flat)\b/, make: (m) => ({ contrast: r2(25 * m) }), reason: "You asked for more contrast." },
  { key: "contrast-", label: "Less contrast", re: /\b(less contrast|softer contrast|reduce contrast|too contrasty|too harsh)\b/, make: (m) => ({ contrast: r2(-22 * m) }), reason: "You asked for less contrast." },
  { key: "warmer", label: "Warmer", re: /\b(warmer|warm up|golden|more warmth|too cold|too cool|too blue)\b/, make: (m) => ({ temperature: r2(20 * m) }), reason: "You asked for a warmer colour balance." },
  { key: "cooler", label: "Cooler", re: /\b(cooler|cool down|colder|bluer|more blue|too warm|too yellow|too orange)\b/, make: (m) => ({ temperature: r2(-20 * m) }), reason: "You asked for a cooler colour balance." },
  { key: "sat-", label: "Less saturated", re: /\b(desaturat\w*|muted|less (saturated|colou?r\w*)|too saturated|subdued)\b/, make: (m) => ({ saturation: r2(-25 * m) }), reason: "You asked for calmer colour." },
  { key: "sat+", label: "More vibrant colour", re: /\b(more (saturated|colou?r\w*)|vivid|vibrant|pop|richer colou?rs?|too dull|too muted)\b/, make: (m) => ({ vibrance: r2(25 * m), saturation: r2(8 * m) }), reason: "You asked for stronger colour." },
  { key: "sharper", label: "Sharper", re: /\b(sharper|sharpen|crisper|more detail|too soft|too blurry)\b/, make: (m) => ({ sharpAmount: r2(35 * m), texture: r2(12 * m) }), reason: "You asked for more crispness." },
  { key: "softer", label: "Softer", re: /\b(softer|soften)\b/, make: (m) => ({ clarity: r2(-20 * m) }), reason: "You asked for a softer look." },
  { key: "clean", label: "Reduce noise", re: /\b(clean(er)?|less noise|denoise|noisy|too grainy)\b/, make: (m) => ({ nrLuma: r2(30 * m), nrColor: r2(30 * m) }), reason: "You asked for less noise." },
  { key: "grain", label: "Add film grain", re: /\b(film|filmic|add grain|more grain|grainy)\b/, make: (m) => ({ grain: r2(20 * m) }), reason: "You asked for a film/grain texture." },
];

const UNSUPPORTED: [RegExp, string][] = [
  [/\b(remove|erase|delete|get rid of|take out|clone|heal)\b/, "Removal, clone and heal need a location. Open the Retouch tab, then click or paint on the photo."],
  [/\b(replace|swap)\b.*\b(sky|background)\b|\bnew sky\b/, "Sky or background replacement is a generative edit and is not built."],
  [/\b(add|insert|put in)\b.*\b(object|person|bird|moon|sun|clouds?|text)\b/, "Adding content is a generative edit and is not built."],
  [/\b(smooth(ing)? skin|retouch|blemish\w*|wrinkle\w*|younger|slim(mer)?|reshape|whiten (the )?teeth|eye ?bags)\b/, "Portrait retouching (skin smoothing, reshaping) is not built. Blemishes can be removed in the Retouch tab."],
  [/\b(upscale|enlarge|super.?res\w*|increase (the )?resolution)\b/, "Neural upscaling is not built. Choose 1080p, 4K or 8K at Export for a Lanczos upscale (sharp, but no new detail)."],
  [/\b(extend|outpaint|expand (the )?canvas)\b/, "Generative expand is not built."],
];

const SMALL = /\b(slightly|slight|a (little|bit|touch)|subtl(e|y)|hint of|just a)\b/, BIG = /\b(a lot|much|very|really|strongly|heavily|way|dramatic(ally)?|extremely|super)\b/;

export function interpretRequest(text: string): IntentResult {
  const ops: IntentOp[] = [], unsupported: IntentResult["unsupported"] = [], unmatched: string[] = [], notes: string[] = [];
  const layers: IntentLayer[] = []; const low = text.toLowerCase(); const preserve = PRESERVE_RE.test(low);
  const clauses = text.toLowerCase().replace(/[’']/g, "").split(/[,.;!\n]+|\b(?:and then|but|also|plus)\b/).map((c) => c.trim()).filter(Boolean)
    .flatMap((c) => { const parts = c.split(/\band\b/).map((x) => x.trim()).filter(Boolean); return parts.length > 1 && parts.filter((x) => findTarget(" " + x + " ") && RULES.some((r) => r.re.test(" " + x + " "))).length >= 2 ? parts : [c]; }) // "darken the leaves and sharpen the ant": two targets, two clauses
    .flatMap((c) => (UNSUPPORTED.some(([re]) => re.test(" " + c + " ")) ? c.split(/\band\b/).map((x) => x.trim()).filter(Boolean) : [c])); // "remove the man and make it warmer": the removal must not leak its noun into the edit
  for (const raw of clauses) {
    let c = " " + raw + " "; let hit = false;
    for (const [re, why] of UNSUPPORTED) { const m = c.match(re); if (m) { unsupported.push({ phrase: raw, why }); hit = true; c = " "; } }
    if (PRESERVE_RE.test(c) || /^\s*(while )?(preserv|keeping|keep|protect)\w*\s/.test(c)) { notes.push("Understood: keep the bright areas (sunlight) as they are. Dark-making edits on masks are limited to the darker tones."); continue; }
    const tg0 = findTarget(c); const tg = tg0 && ["shadows", "highlights", "midtones"].includes(tg0.target.id) && !/\b(only|just|selective\w*|local\w*|mask\w*)\b/.test(c) ? null : tg0; // "shadows too dark" is the global Shadows slider, not a mask
    if (tg && !/\b(blur|bokeh)\b.*\bbackground\b|\bbackground blur\b/.test(c)) { // an edit aimed at a region: becomes a mask layer
      const rest = c.replace(tg.target.re, " "); const patch: Record<string, number> = {}; const reasons: string[] = []; const matched: string[] = [tg.matched]; const mag2 = SMALL.test(rest) ? 0.5 : BIG.test(rest) ? 1.7 : 1; let rc = rest;
      for (const rule of RULES) { const m = rc.match(rule.re); if (!m) continue; rc = rc.replace(rule.re, " "); matched.push(m[0].trim()); reasons.push(rule.label);
        for (const [k, v] of Object.entries(rule.make(mag2))) { if (typeof v !== "number") continue; const lk = LOCAL_MAP[k as keyof EditParams]; if (!lk) { notes.push(`"${k}" cannot be applied to a mask, so it was skipped for ${tg.target.label}.`); continue; } patch[lk] = (patch[lk] ?? 0) + v; } }
      if (Object.keys(patch).length) { hit = true; const ex = layers.find((l) => l.target === tg.target.id); if (ex) { for (const [k, v] of Object.entries(patch)) (ex.adjust as any)[k] = ((ex.adjust as any)[k] ?? 0) + v; ex.matched.push(...matched); ex.reasons.push(...reasons); } else layers.push({ target: tg.target.id, label: tg.target.label, adjust: patch as Partial<LocalAdjust>, matched, reasons, limitHighlights: preserve, caveat: tg.target.caveat }); }
      if (hit) continue;
    }
    const mag = SMALL.test(c) ? 0.5 : BIG.test(c) ? 1.7 : 1;
    for (const rule of RULES) { const m = c.match(rule.re); if (!m) continue; hit = true; c = c.replace(rule.re, " ");
      const ex = ops.find((o) => o.key === rule.key); if (ex) continue; ops.push({ key: rule.key, label: rule.label, patch: rule.make(mag), reason: rule.reason + (mag !== 1 ? (mag < 1 ? " (applied gently)" : " (applied strongly)") : ""), matched: m[0].trim() }); }
    if (!hit) unmatched.push(raw);
  }
  if (unmatched.length) notes.push("Not understood: " + unmatched.map((u) => `"${u}"`).join(", ") + ". The offline interpreter only knows a fixed vocabulary; rephrase, or use Gemini for free-form requests.");
  return { layers, ops, unsupported, unmatched, notes };
}

/** Sum the patches of all ops into one delta (numeric keys add; bw is a flag). Opposing requests cancel visibly rather than silently. */
export function mergeOps(ops: IntentOp[]): Partial<EditParams> {
  const out: Record<string, number | boolean> = {};
  for (const o of ops) for (const [k, v] of Object.entries(o.patch)) { if (typeof v === "number") out[k] = ((out[k] as number) ?? 0) + v; else if (k === "bw" && v) out.bw = true; }
  return out as Partial<EditParams>;
}
