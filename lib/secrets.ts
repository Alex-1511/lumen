// Server-only. Reads the Gemini key from the environment first, then from .lumen/gemini.json (written by the Settings page).
// The key is never returned to the browser: the API only ever says whether one is configured.
import fs from "node:fs";
import path from "node:path";

const FILE = () => path.join(process.cwd(), ".lumen", "gemini.json");
export interface GeminiConfig { key: string | null; model: string; source: "env" | "file" | "none" }

export function getGeminiConfig(): GeminiConfig {
  const envKey = process.env.GEMINI_API_KEY?.trim();
  let fileCfg: { key?: string; model?: string } = {};
  try { fileCfg = JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { /* no file yet */ }
  const model = process.env.GEMINI_MODEL?.trim() || fileCfg.model?.trim() || "gemini-flash-latest";
  if (envKey) return { key: envKey, model, source: "env" };
  if (fileCfg.key) return { key: fileCfg.key, model, source: "file" };
  return { key: null, model, source: "none" };
}
export function saveGeminiConfig(key: string, model?: string) {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify({ key, model: model || undefined }), { mode: 0o600 });
}
export function clearGeminiConfig() { try { fs.unlinkSync(FILE()); } catch { /* nothing to remove */ } }
export const looksLikeKey = (k: string) => /^[A-Za-z0-9._\-]{20,200}$/.test(k);
