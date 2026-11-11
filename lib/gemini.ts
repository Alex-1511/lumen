// Server-only Gemini boundary. The key never leaves the server; the model is swappable via env or the Settings page.
// Reliability: per-attempt timeout, retries with backoff on overload/timeout, and fallback models. Every failed attempt is reported.
import { getGeminiConfig } from "./secrets";
export const NO_KEY_MESSAGE = "AI is not set up yet. Open Settings and add a Gemini API key. Everything else in Lumen works without it.";
const FALLBACKS = ["gemini-2.5-flash", "gemini-flash-lite-latest"];
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Ok = { ok: true; json: any; model: string; ms: number; attempts: string[] }; type Fail = { ok: false; status: number; error: string; attempts: string[] };

export async function callGemini(parts: any[], schemaHint?: object, opts: { timeoutMs?: number; maxAttempts?: number } = {}): Promise<Ok | Fail> {
  const { key, model } = getGeminiConfig();
  if (!key) return { ok: false, status: 503, error: NO_KEY_MESSAGE, attempts: [] };
  const models = [model, ...FALLBACKS.filter((m) => m !== model)], timeoutMs = opts.timeoutMs ?? 40000, max = opts.maxAttempts ?? 4, attempts: string[] = [];
  let lastStatus = 504;
  for (let i = 0; i < max; i++) {
    const m = models[Math.min(i, models.length - 1)], t0 = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.2, ...(schemaHint ? { responseSchema: schemaHint } : {}) } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = body?.error?.message ?? `HTTP ${res.status}`; attempts.push(`${m}: ${res.status} ${String(msg).slice(0, 140)}`); lastStatus = res.status;
        if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, status: res.status, error: friendly(res.status, msg), attempts }; // retrying cannot fix a bad request or key
        if (res.status === 404 && i < max - 1) { await sleep(300); continue; } // model name not found: try the next model
        if (!RETRYABLE.has(res.status)) return { ok: false, status: res.status, error: friendly(res.status, msg), attempts };
        await sleep(1200 * (i + 1)); continue;
      }
      const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
      try { return { ok: true, json: JSON.parse(text), model: m, ms: Date.now() - t0, attempts }; } catch { attempts.push(`${m}: reply was not valid JSON`); lastStatus = 502; continue; }
    } catch (e: any) {
      const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError"; attempts.push(`${m}: ${timedOut ? `no answer within ${timeoutMs / 1000}s` : e?.message ?? "network error"}`); lastStatus = 504;
      if (!timedOut) await sleep(800);
    }
  }
  return { ok: false, status: lastStatus, error: `Gemini did not answer after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} (${attempts.join("; ")}). This usually means the model is overloaded or this network is slow to reach Google. Try again in a minute, or change the model in Settings.`, attempts };
}
function friendly(status: number, msg: string) {
  if (status === 401 || status === 403 || /API key/i.test(msg)) return `Gemini rejected the key (${status}). Check it in Settings. ${String(msg).slice(0, 160)}`;
  if (status === 400) return `Gemini refused the request: ${String(msg).slice(0, 200)}`;
  return `Gemini error ${status}: ${String(msg).slice(0, 200)}`;
}

/** Image-in, image-out call (generative edit). Same key handling and retry policy as callGemini; the key never leaves the server. */
type ImgOk = { ok: true; mime: string; data: string; text: string; model: string; ms: number; attempts: string[] }; type ImgFail = { ok: false; status: number; error: string; attempts: string[] };
export async function callGeminiImage(parts: any[], opts: { timeoutMs?: number; maxAttempts?: number } = {}): Promise<ImgOk | ImgFail> {
  const { key } = getGeminiConfig(); if (!key) return { ok: false, status: 503, error: NO_KEY_MESSAGE, attempts: [] };
  const models = [process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image", "gemini-2.5-flash-image-preview"], timeoutMs = opts.timeoutMs ?? 90000, max = opts.maxAttempts ?? 3, attempts: string[] = []; let lastStatus = 504;
  for (let i = 0; i < max; i++) {
    const m = models[Math.min(i, models.length - 1)], t0 = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "X-goog-api-key": key }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }), signal: AbortSignal.timeout(timeoutMs) });
      const body = await res.json().catch(() => null);
      if (!res.ok) { const msg = body?.error?.message ?? `HTTP ${res.status}`; attempts.push(`${m}: ${res.status} ${String(msg).slice(0, 140)}`); lastStatus = res.status; if ([400, 401, 403].includes(res.status)) return { ok: false, status: res.status, error: friendly(res.status, msg), attempts }; if (res.status === 404 && i < max - 1) continue; if (!RETRYABLE.has(res.status)) return { ok: false, status: res.status, error: friendly(res.status, msg), attempts }; await sleep(1500 * (i + 1)); continue; }
      const ps: any[] = body?.candidates?.[0]?.content?.parts ?? []; const img = ps.find((p) => p.inlineData?.data || p.inline_data?.data); const text = ps.map((p) => p.text).filter(Boolean).join(" ");
      if (!img) { attempts.push(`${m}: no image in the reply`); return { ok: false, status: 422, error: `The model did not return an image${text ? `: "${text.slice(0, 200)}"` : body?.promptFeedback?.blockReason ? ` (blocked: ${body.promptFeedback.blockReason})` : ""}. Try rephrasing the request.`, attempts }; }
      const d = img.inlineData ?? img.inline_data; return { ok: true, mime: d.mimeType ?? d.mime_type ?? "image/png", data: d.data, text, model: m, ms: Date.now() - t0, attempts };
    } catch (e: any) { const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError"; attempts.push(`${m}: ${timedOut ? `no answer within ${timeoutMs / 1000}s` : e?.message ?? "network error"}`); lastStatus = 504; if (!timedOut) await sleep(800); }
  }
  return { ok: false, status: lastStatus, error: `The image model did not answer after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"} (${attempts.join("; ")}).`, attempts };
}
