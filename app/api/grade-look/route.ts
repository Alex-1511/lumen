import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";
export const runtime = "nodejs";
const c = (v: any, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
function toStats(o: any) {
  const bp = c(o?.blackPoint, 0, 0.3, 0.03), md = c(o?.median, 0.08, 0.8, 0.4), wp = c(o?.whitePoint, 0.6, 1, 0.97), mono = !!o?.mono;
  // percentiles interpolated from three anchors (black point, median, white point)
  const pct = [bp, bp + (md - bp) * 0.25, bp + (md - bp) * 0.6, md, md + (wp - md) * 0.45, md + (wp - md) * 0.85, wp];
  const z = (k: string, w: number) => ({ w, a: c(o?.[k]?.a, -0.15, 0.15, 0), b: c(o?.[k]?.b, -0.2, 0.2, 0), sat: c(o?.[k]?.sat, 0, 1, 0.3) });
  return { pct, zones: [z("shadows", 0.33), z("mids", 0.34), z("highlights", 0.33)], meanSat: c(o?.meanSat, 0, 1, 0.3), mono };
}
// Gemini describes a named production's or photographer's typical grade from its general knowledge. This is an ESTIMATE and is labelled as such: nothing is downloaded, scraped or measured.
export async function POST(req: Request) {
  const { name, kind } = await req.json().catch(() => ({}));
  if (typeof name !== "string" || !name.trim() || name.length > 120) return NextResponse.json({ error: "Type a show, film or photographer name (max 120 characters)." }, { status: 400 });
  const prompt = `You are a colourist. Describe the typical COLOUR GRADE of ${kind === "photographer" ? "the photographer" : "the show or film"} named ${JSON.stringify(name)} as numbers. If you do not know it, set "known" to false and keep neutral values; never invent. Return JSON only:
{"known": boolean, "confidence": number 0..1, "description": string (2 sentences, plain language), "day": GRADE, "night": GRADE}
GRADE = {"blackPoint": 0..0.3 (luma of the darkest 1%, 0..1), "median": 0.08..0.8, "whitePoint": 0.6..1, "mono": boolean, "meanSat": 0..1,
"shadows": {"a","b","sat"}, "mids": {"a","b","sat"}, "highlights": {"a","b","sat"}}
Tint axes: a = R minus G (positive = magenta/red, negative = green), b = (R+G)/2 minus B (positive = warm/yellow, negative = blue/teal). Typical magnitude 0.0 to 0.1. sat = mean saturation 0..1 in that zone.
"day" is a typical bright daytime exterior frame, "night" a typical night frame.`;
  const r = await callGemini([{ text: prompt }], undefined, { timeoutMs: 40000, maxAttempts: 3 }); if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.json?.known === false) return NextResponse.json({ known: false, error: `The AI does not recognise "${name}" well enough to describe its grade. Upload 3 to 10 stills instead and Lumen will measure them.` }, { status: 200 });
  return NextResponse.json({ known: true, measured: false, confidence: c(r.json?.confidence, 0, 1, 0.4), description: String(r.json?.description ?? "").slice(0, 400), day: toStats(r.json?.day), night: toStats(r.json?.night), caveat: "Estimated from the AI's general knowledge of this look. Nothing was fetched or measured. Upload stills for a measured match." });
}
