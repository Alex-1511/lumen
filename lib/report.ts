// "What was done and how": a report assembled from the real state (AI recipe items, manual layer, local masks, event log)
// and the capability registry. Nothing here is narrated from imagination: every row maps to a parameter that the renderer uses.
import registry from "../data/registry.json";
import type { Analysis } from "./analysis";
import type { EditParams } from "./params";
import type { Plan } from "./planner";
import type { LocalLayer } from "./masks";

export interface EditEvent { at: number; source: "auto" | "request" | "manual" | "reference" | "preset" | "learned" | "feedback"; text?: string; summary: string }
export interface TermRef { name: string; status: string }
export interface ReportRow { source: string; what: string; how: string; why: string; terms: TermRef[]; tools: string[]; kind: string }
export interface Report {
  headline: string; counts: { adjustments: number; local: number; corrections: number; enhancements: number; generative: number };
  method: string[]; measured: { label: string; value: string }[]; rows: ReportRow[]; masks: { name: string; type: string; note: string; adjust: string }[];
  events: EditEvent[]; terms: TermRef[]; tools: string[]; limits: string[];
}

type Reg = { name: string; status: string; impl: string | null; note: string };
const REG = registry as Reg[];

export const KEY_INFO: Record<string, { label: string; tool: string; unit?: string }> = {
  gaussBlur: { label: "Gaussian blur", tool: "Effect stage (mip-pyramid blur, per pixel)" }, boxBlur: { label: "Box blur", tool: "Effect stage (3x3 box of mip samples)" }, mosaic: { label: "Mosaic", tool: "Effect stage (block average)" },
  motionBlur: { label: "Motion blur", tool: "Effect stage (13-tap directional)" }, tiltShift: { label: "Tilt-shift", tool: "Effect stage (blur by distance from the focus band)" }, bokeh: { label: "Bokeh", tool: "Effect stage (disc blur outside the subject ellipse; approximate, no depth map)" },
  softFocus: { label: "Soft focus", tool: "Effect stage (screen-blended blur)" }, fade: { label: "Matte fade", tool: "Output stage (lifted blacks)" },
  exposure: { label: "Exposure", tool: "Tone stage (linear-light gain, per pixel)", unit: " EV" }, contrast: { label: "Contrast", tool: "Tone stage (power curve about mid-grey)" },
  highlights: { label: "Highlights", tool: "Tone stage (luma-weighted gain)" }, shadows: { label: "Shadows", tool: "Tone stage (luma-weighted gain)" },
  whites: { label: "Whites", tool: "Tone stage (white point)" }, blacks: { label: "Blacks", tool: "Tone stage (black point)" },
  temperature: { label: "Temperature", tool: "White-balance gain (per-channel)" }, tint: { label: "Tint", tool: "White-balance gain (per-channel)" },
  vibrance: { label: "Vibrance", tool: "Colour stage (HSV, per pixel)" }, saturation: { label: "Saturation", tool: "Colour stage (HSV, per pixel)" },
  hslH: { label: "HSL hue", tool: "Colour stage (8-band HSL)" }, hslS: { label: "HSL saturation", tool: "Colour stage (8-band HSL)" }, hslL: { label: "HSL luminance", tool: "Colour stage (8-band HSL)" },
  curve: { label: "Tone curve", tool: "Tone-curve lookup table (monotone cubic)" }, sharpAmount: { label: "Sharpening", tool: "Neighbourhood unsharp kernel" }, sharpRadius: { label: "Sharpen radius", tool: "Neighbourhood unsharp kernel" },
  texture: { label: "Texture", tool: "Small-radius detail kernel" }, clarity: { label: "Clarity", tool: "Large-radius local-contrast kernel" },
  nrLuma: { label: "Luminance noise reduction", tool: "Edge-aware noise-reduction kernel" }, nrColor: { label: "Colour noise reduction", tool: "Edge-aware noise-reduction kernel" },
  vignette: { label: "Vignette", tool: "Radial vignette (per pixel)" }, grain: { label: "Grain", tool: "Seeded procedural grain" }, dehaze: { label: "Dehaze", tool: "Dark-channel dehaze (8-tap)" },
  bloom: { label: "Bloom", tool: "Highlight glow pass (24-tap)" }, halation: { label: "Halation", tool: "Highlight glow pass (tinted)" },
  distortion: { label: "Lens distortion", tool: "Geometry warp (resampling)" }, ca: { label: "Chromatic aberration", tool: "Geometry warp (R/B channel scaling)" },
  perspV: { label: "Vertical perspective", tool: "Geometry warp (keystone)" }, perspH: { label: "Horizontal perspective", tool: "Geometry warp (keystone)" },
  straighten: { label: "Straighten", tool: "Geometry warp (rotation + auto-zoom)", unit: "°" }, crop: { label: "Crop", tool: "Geometry warp (crop rectangle)" },
  gradeShS: { label: "Shadow tint amount", tool: "Colour stage (split toning)" }, gradeShH: { label: "Shadow tint hue", tool: "Colour stage (split toning)", unit: "°" },
  gradeHiS: { label: "Highlight tint amount", tool: "Colour stage (split toning)" }, gradeHiH: { label: "Highlight tint hue", tool: "Colour stage (split toning)", unit: "°" },
  gradeBal: { label: "Grade balance", tool: "Colour stage (split toning)" }, bw: { label: "Black and white", tool: "Luminance conversion" },
};
const GEO = new Set(["straighten", "crop", "distortion", "perspV", "perspH", "ca"]);

export const termFor = (key: string): TermRef | null => { const all = REG.filter((r) => r.impl === "param:" + key); const lab = KEY_INFO[key]?.label.toLowerCase(); const e = all.find((r) => r.name.toLowerCase() === lab) ?? all[0]; return e ? { name: e.name, status: e.status } : null; };
export const termByName = (name: string): TermRef | null => { const n = name.toLowerCase(); const e = REG.find((r) => r.name.toLowerCase() === n) ?? REG.find((r) => r.name.toLowerCase().startsWith(n)); return e ? { name: e.name, status: e.status } : null; };
const sgn = (v: number, unit = "") => (v > 0 ? "+" : "") + (Math.round(v * 100) / 100) + unit;
const uniq = <T,>(a: T[], k: (x: T) => string) => { const m = new Map<string, T>(); for (const x of a) if (!m.has(k(x))) m.set(k(x), x); return [...m.values()]; };

export interface ReportInput {
  analysis: Analysis | null; plan: Plan | null; enabled: Record<string, boolean>; aiOpacity: number; manual: Partial<EditParams>;
  params: EditParams; locals: LocalLayer[]; events: EditEvent[]; usedGemini: boolean;
}

export function buildReport(i: ReportInput): Report {
  const rows: ReportRow[] = [];
  const items = (i.plan?.items ?? []).filter((it) => i.enabled[it.id] !== false);
  for (const it of items) {
    const keys = Object.keys(it.patch).filter((k) => KEY_INFO[k]); const kinds = it.kind;
    const how = keys.length ? keys.map((k) => { const v = (it.patch as any)[k]; return typeof v === "number" ? `${KEY_INFO[k].label} ${sgn(v * i.aiOpacity, KEY_INFO[k].unit ?? "")}` : Array.isArray(v) ? `${KEY_INFO[k].label} (per band)` : KEY_INFO[k].label; }).join(", ") : it.local ? `Local layer "${it.local.name}"` : "No global parameter change";
    const terms = uniq([...it.techniques.map(termByName), ...keys.map(termFor)].filter(Boolean) as TermRef[], (t) => t.name);
    rows.push({ source: i.aiOpacity < 1 ? `AI recipe (${Math.round(i.aiOpacity * 100)}%)` : "AI recipe", what: it.operation, how, why: it.reason + " " + it.expected, terms, tools: uniq(keys.map((k) => KEY_INFO[k].tool).concat(it.local ? ["Local mask layer"] : []), (x) => x), kind: kinds });
  }
  for (const [k, v] of Object.entries(i.manual)) {
    const info = KEY_INFO[k]; if (!info) continue; let how = "";
    if (typeof v === "number") { if (!v) continue; how = `${info.label} ${sgn(v, info.unit ?? "")} (final value ${sgn((i.params as any)[k], info.unit ?? "")})`; }
    else if (k === "bw") { if (!v) continue; how = "Black and white on"; }
    else if (k === "curve") { const c = v as [number, number][]; if (c.length === 2 && c[0][1] === 0 && c[1][1] === 1) continue; how = `Curve with ${c.length} points`; }
    else if (Array.isArray(v) && typeof v[0] === "number") { if (!(v as number[]).some((x) => x)) continue; how = `${info.label}: ${(v as number[]).map((x, b) => (x ? `${["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"][b]} ${sgn(x)}` : "")).filter(Boolean).join(", ")}`; }
    else continue;
    const t = termFor(k); rows.push({ source: "Your edit", what: info.label, how, why: "Set by you with the sliders, presets, reference match or an applied request.", terms: t ? [t] : [], tools: [info.tool], kind: GEO.has(k) ? "correction" : "enhancement" });
  }
  const masks = i.locals.map((l) => ({ name: l.name, type: l.type + (l.lum.on ? " + luminance limiter" : "") + (l.color.on ? " + colour limiter" : "") + (l.invert ? " (inverted)" : ""), note: l.note ?? (l.source === "ai" ? "From the AI recipe." : "Drawn or placed by you."),
    adjust: Object.entries(l.adjust).filter(([, v]) => v).map(([k, v]) => `${k} ${sgn(v as number)}`).join(", ") || "no adjustment set" }));
  const allTerms = uniq(rows.flatMap((r) => r.terms).concat(masks.length ? [termByName("Layer Masks")].filter(Boolean) as TermRef[] : []), (t) => t.name);
  const tools = uniq(rows.flatMap((r) => r.tools).concat(["WebGL2 fragment shader (per-pixel render from the untouched original)", "CPU analysis (histogram, white balance, sharpness, noise)"]).concat(i.usedGemini ? ["Gemini (genre / subject box only)"] : []), (x) => x);
  const a = i.analysis; const f = (n: number) => (Math.round(n * 100) / 100).toString();
  const measured = a ? [
    { label: "Median brightness", value: f(a.p50) }, { label: "Tonal range p1 to p99", value: `${f(a.p1)} to ${f(a.p99)}` }, { label: "Clipped highlights / shadows", value: `${f(a.clipHighPct)}% / ${f(a.clipLowPct)}%` },
    { label: "Colour cast (R / B)", value: `${f(a.castR)} / ${f(a.castB)}` }, { label: "Mean saturation", value: f(a.meanSat) }, { label: "Sharpness", value: f(a.sharpness) }, { label: "Estimated noise (luma)", value: f(a.noiseLuma) },
    { label: "State", value: [a.lowKey ? "low-key" : "", a.highKey ? "high-key" : "", a.backlit ? "backlit" : "", a.isMonochrome ? "monochrome" : ""].filter(Boolean).join(", ") || "normal" },
  ] : [];
  const corr = rows.filter((r) => r.kind === "correction").length, enh = rows.filter((r) => r.kind === "enhancement").length, gen = rows.filter((r) => r.kind === "generative").length;
  const geoN = rows.length;
  return {
    headline: rows.length || masks.length ? `${rows.length} adjustment${rows.length === 1 ? "" : "s"}${masks.length ? ` and ${masks.length} local mask${masks.length === 1 ? "" : "s"}` : ""} applied: ${corr} correction${corr === 1 ? "" : "s"}, ${enh} enhancement${enh === 1 ? "" : "s"}, ${gen} generative.` : "No edits are applied. The photo is shown as it was imported.",
    counts: { adjustments: geoN, local: masks.length, corrections: corr, enhancements: enh, generative: gen },
    method: [
      "Every output pixel is recomputed from the untouched original by a WebGL2 shader. Edits are stored as parameters, so any step can be undone or changed.",
      "Decisions come from measured values (histogram, white-balance bias, sharpness, noise, clipping) compared with fixed thresholds. There are no random choices; grain uses a fixed seed, so the same photo and settings always give the same pixels.",
      "Correction = fixes a measured problem. Enhancement = a creative or taste choice. Generative = invents pixels. This report shows 0 generative edits because none exist in this app.",
      i.usedGemini ? "Gemini was used for genre and subject-box detection only. It does not touch pixels." : "Gemini was not used for this edit.",
    ],
    measured, rows, masks, events: i.events, terms: allTerms, tools,
    limits: ["8-bit pipeline: recovery is limited to data that exists in the file.", "Subject, sky and background masks are approximations, not segmentation.", "Metadata is stripped on export and no ICC profile is embedded."],
  };
}

export function reportToMarkdown(r: Report, name: string): string {
  const L: string[] = [`# Edit report: ${name}`, "", r.headline, "", "## How it was done", ...r.method.map((m) => "- " + m), "", "## Measured", ...r.measured.map((m) => `- ${m.label}: ${m.value}`), "", "## What was edited"];
  for (const x of r.rows) L.push(`- **${x.what}** (${x.source}, ${x.kind}): ${x.how}. Why: ${x.why} Terms: ${x.terms.map((t) => t.name).join(", ") || "none"}. Tool: ${x.tools.join("; ")}.`);
  if (r.masks.length) { L.push("", "## Local masks"); for (const m of r.masks) L.push(`- **${m.name}** [${m.type}]: ${m.adjust}. ${m.note}`); }
  if (r.events.length) { L.push("", "## Requests and history"); for (const e of r.events) L.push(`- ${new Date(e.at).toLocaleString()} (${e.source}): ${e.text ? `"${e.text}" - ` : ""}${e.summary}`); }
  L.push("", "## Terms used", ...r.terms.map((t) => `- ${t.name} (${t.status})`), "", "## Tools used", ...r.tools.map((t) => "- " + t), "", "## Limits", ...r.limits.map((t) => "- " + t));
  return L.join("\n");
}
