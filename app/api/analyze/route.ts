import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";
export const runtime = "nodejs";
const GENRES = ["wildlife", "bird", "pet", "landscape", "portrait", "street", "architecture", "night", "macro", "unknown"];
export async function POST(req: Request) {
  const { image, metrics } = await req.json().catch(() => ({}));
  if (typeof image !== "string" || image.length < 100 || image.length > 4_000_000) return NextResponse.json({ error: "Send a base64 JPEG preview under ~3MB." }, { status: 400 });
  const prompt = `You are a photographic analyst. Look at the image and return JSON only with keys:
genre (one of ${GENRES.join(", ")}), secondaryGenres (array of the same values), primarySubject (short phrase), subjectBox ({x,y,w,h} normalised 0-1, or null if unclear), mood (short phrase), lighting (short phrase), composition (one or two sentences), problems (array of short strings, only real technical problems you can see), strengths (array), suggestedIntent (one of natural, clean, vibrant, moody, documentary, bw).
Prefer "natural". Do not invent detail. If unsure of genre use "unknown". Measured metrics from pixel analysis, for context: ${JSON.stringify(metrics ?? {})}`;
  const r = await callGemini([{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: image } }]);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const j = r.json ?? {};
  return NextResponse.json({
    genre: GENRES.includes(j.genre) ? j.genre : "unknown", secondaryGenres: (j.secondaryGenres ?? []).filter((g: string) => GENRES.includes(g)),
    primarySubject: String(j.primarySubject ?? "").slice(0, 120), subjectBox: j.subjectBox ?? null, mood: String(j.mood ?? "").slice(0, 120), lighting: String(j.lighting ?? "").slice(0, 160),
    composition: String(j.composition ?? "").slice(0, 400), problems: (j.problems ?? []).slice(0, 8).map(String), strengths: (j.strengths ?? []).slice(0, 8).map(String),
    suggestedIntent: ["natural", "clean", "vibrant", "moody", "documentary", "bw"].includes(j.suggestedIntent) ? j.suggestedIntent : "natural",
  });
}
