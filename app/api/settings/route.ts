import { NextResponse } from "next/server";
import { callGemini } from "@/lib/gemini";
import { clearGeminiConfig, getGeminiConfig, looksLikeKey, saveGeminiConfig } from "@/lib/secrets";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keys can only be written from the machine running Lumen. A hosted deployment must use environment variables instead.
function isLocal(req: Request) {
  if (process.env.VERCEL || process.env.LUMEN_LOCK_SETTINGS) return false;
  const host = (req.headers.get("host") ?? "").split(":")[0].replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}
const status = () => { const c = getGeminiConfig(); return { configured: !!c.key, source: c.source, model: c.model }; };

export async function GET(req: Request) { return NextResponse.json({ ...status(), canWrite: isLocal(req) }); }

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.test) { // a real, tiny call to Gemini so the person sees whether the key works
    const r = await callGemini([{ text: 'Reply with JSON: {"ok":true}' }], undefined, { maxAttempts: 3, timeoutMs: 25000 });
    return NextResponse.json(r.ok ? { ok: true, model: r.model, ms: r.ms, attempts: r.attempts } : { ok: false, error: r.error, attempts: r.attempts });
  }
  if (!isLocal(req)) return NextResponse.json({ error: "The key can only be changed on the machine running Lumen. On a hosted deployment, set GEMINI_API_KEY as an environment variable." }, { status: 403 });
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!looksLikeKey(key)) return NextResponse.json({ error: "That does not look like an API key (20 to 200 letters, digits, dots, dashes)." }, { status: 400 });
  saveGeminiConfig(key, typeof body.model === "string" ? body.model.trim().slice(0, 80) : undefined);
  return NextResponse.json({ ...status(), canWrite: true });
}

export async function DELETE(req: Request) {
  if (!isLocal(req)) return NextResponse.json({ error: "Not allowed from here." }, { status: 403 });
  clearGeminiConfig(); return NextResponse.json({ ...status(), canWrite: true });
}
