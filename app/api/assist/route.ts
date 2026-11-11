import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";
export const runtime = "nodejs";
const TARGET_IDS: Record<string, 1> = { sky: 1, foliage: 1, water: 1, skin: 1, shadows: 1, highlights: 1, midtones: 1, foreground: 1, background: 1, subject: 1 };
const MASK_LIMITS: Record<string, [number, number]> = { exposure: [-2, 2], contrast: [-60, 60], highlights: [-100, 100], shadows: [-100, 100], temperature: [-60, 60], saturation: [-60, 60], clarity: [-60, 60], texture: [-60, 60], sharpen: [0, 80], blur: [0, 60], soft: [0, 60], fade: [0, 60], grain: [0, 60] };
// Whitelist of controls the assistant may touch, with hard limits. Anything else is dropped.
const LIMITS: Record<string, [number, number]> = { exposure: [-2, 2], contrast: [-60, 60], highlights: [-100, 100], shadows: [-100, 100], whites: [-60, 60], blacks: [-60, 60], temperature: [-60, 60], tint: [-40, 40], vibrance: [-60, 60], saturation: [-40, 40], texture: [-50, 50], clarity: [-50, 50], sharpAmount: [0, 80], nrLuma: [0, 60], nrColor: [0, 80], vignette: [-60, 60], grain: [0, 40], straighten: [-10, 10] };
export async function POST(req: Request) {
  const { instruction, image, params, metrics } = await req.json().catch(() => ({}));
  if (typeof instruction !== "string" || !instruction.trim() || instruction.length > 600) return NextResponse.json({ error: "Instruction missing or too long." }, { status: 400 });
  const prompt = `You are a careful photo editor. Translate the user's instruction into slider changes for a global-adjustment editor. Return JSON only:
{"explanation": string, "techniques": string[], "operations": [{"key": string, "delta": number, "reason": string}], "cannotDo": string|null}
Allowed keys and ranges: ${JSON.stringify(LIMITS)}. "delta" is the change from the CURRENT value. Keep changes modest and photographically authentic. This editor DOES have local masks. When the request targets part of the photo (leaves, sky, subject, background, shadows...), do NOT say it cannot be done: put it in "masks" instead. Use "masks": [{"target": one of ${JSON.stringify(Object.keys(TARGET_IDS))}, "adjust": {allowed mask keys with ranges ${JSON.stringify(MASK_LIMITS)}}, "protectHighlights": boolean (true when the user wants sunlight/bright areas preserved), "reason": string}]. Targets are approximate (colour range, luminance range, gradients, a subject ellipse), not pixel-exact cut-outs. Generative changes (removing people, changing clothes) are not possible here: put them in cannotDo. Return JSON: {"explanation","techniques","operations","masks","cannotDo"}.
Current values: ${JSON.stringify(params ?? {})}. Measured: ${JSON.stringify(metrics ?? {})}. Instruction: ${JSON.stringify(instruction)}`;
  const parts: any[] = [{ text: prompt }]; if (typeof image === "string" && image.length < 4_000_000) parts.push({ inline_data: { mime_type: "image/jpeg", data: image } });
  const r = await callGemini(parts); if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const ops = (Array.isArray(r.json?.operations) ? r.json.operations : []).filter((o: any) => o && LIMITS[o.key] && Number.isFinite(o.delta)).slice(0, 12).map((o: any) => {
    const [lo, hi] = LIMITS[o.key]; const cur = Number(params?.[o.key] ?? 0); const next = Math.min(hi, Math.max(lo, cur + Number(o.delta)));
    return { key: o.key, delta: Math.round((next - cur) * 100) / 100, reason: String(o.reason ?? "").slice(0, 200) };
  }).filter((o: any) => o.delta !== 0);
  const masks = (Array.isArray(r.json?.masks) ? r.json.masks : []).filter((m: any) => m && TARGET_IDS[m.target] && m.adjust && typeof m.adjust === "object").slice(0, 3).map((m: any) => {
    const adjust: Record<string, number> = {}; for (const [k, v] of Object.entries(m.adjust)) { const lim = MASK_LIMITS[k]; if (lim && Number.isFinite(v as number)) adjust[k] = Math.min(lim[1], Math.max(lim[0], Number(v))); }
    return { target: String(m.target), adjust, protectHighlights: !!m.protectHighlights, reason: String(m.reason ?? "").slice(0, 200) }; }).filter((m: any) => Object.keys(m.adjust).length);
  return NextResponse.json({ masks, explanation: String(r.json?.explanation ?? "").slice(0, 600), techniques: (r.json?.techniques ?? []).slice(0, 10).map(String), operations: ops, cannotDo: r.json?.cannotDo ? String(r.json.cannotDo).slice(0, 400) : null });
}
