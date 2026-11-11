// Lumen MCP server (stdio). Lets Antigravity, Codex, Cowork or any MCP client drive Lumen's real editing pipeline.
// It opens Lumen's /headless page in a headless Chromium (WebGL via SwiftShader if there is no GPU) and calls the same
// code the editor uses. No Gemini key is needed or exposed. Start Lumen first (npm run build && npm start), then register this server.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);

const BASE = (process.env.LUMEN_URL ?? "http://localhost:3000").replace(/\/$/, "");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY: { id: number; name: string; status: string; note: string }[] = JSON.parse(fs.readFileSync(path.join(HERE, "..", "data", "registry.json"), "utf8"));

let browser: any = null, page: any = null;
async function getPage() {
  if (page && !page.isClosed()) return page;
  let pw: any; try { pw = req("playwright"); } catch { throw new Error("Playwright is not installed. Run: npm i playwright && npx playwright install chromium"); }
  browser ??= await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try { await page.goto(BASE + "/headless", { timeout: 20000 }); await page.waitForFunction("window.lumenRun && window.lumenAnalyse", null, { timeout: 20000 }); }
  catch (e: any) { throw new Error(`Cannot reach Lumen at ${BASE}/headless. Start it first (npm run build && npm start) or set LUMEN_URL. ${e.message}`); }
  return page;
}
const text = (t: string, isError = false) => ({ content: [{ type: "text" as const, text: t }], isError });
const readB64 = (p: string) => { if (!fs.existsSync(p)) throw new Error("File not found: " + p); return fs.readFileSync(p).toString("base64"); };

const server = new McpServer({ name: "lumen", version: "0.1.0" });
// Heartbeat so the Lumen app can show a REAL "agent connected" status (last tool call + tool name). Fire and forget; ignored when Lumen is not up.
const beat = (tool: string) => { fetch(`${BASE}/api/mcp-info`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool }), signal: AbortSignal.timeout(1500) }).catch(() => {}); };
const _reg = (server as any).registerTool.bind(server); (server as any).registerTool = (n: string, c: any, h: any) => _reg(n, c, async (...a: any[]) => { beat(n); return h(...a); });

server.registerTool("lumen_status", { description: "Check that Lumen is reachable and report what this server can do.", inputSchema: {} }, async () => {
  try { const pg = await getPage(); const n = await pg.evaluate("window.lumenEffects.length"); return text(`Lumen is reachable at ${BASE}. ${n} effects available. Editing runs on real pixels (WebGL render, Lanczos resize, optional 16-bit HDR PNG).`); }
  catch (e: any) { return text(e.message, true); }
});

server.registerTool("lumen_list_effects", { description: "List Lumen's effects (Box Blur, Gaussian Blur, Mosaic Blur, Sharpen, Tilt-Shift, Bokeh, Cinematic, Vibrant, ...). Pass an id to lumen_edit_image.", inputSchema: { category: z.string().optional().describe("Optional category filter, e.g. Cinematic or 'Blur & Sharpen'") } }, async ({ category }) => {
  try { const pg = await getPage(); const fx: any[] = await pg.evaluate("window.lumenEffects"); const l = fx.filter((e) => !category || e.category.toLowerCase() === category.toLowerCase());
    return text(l.map((e) => `${e.id} | ${e.name} | ${e.category} | ${e.desc}${e.note ? " (" + e.note + ")" : ""}`).join("\n") || "No effects match."); } catch (e: any) { return text(e.message, true); }
});

server.registerTool("lumen_capabilities", { description: "Search Lumen's honest capability registry (872 photo-editing techniques with status implemented / partial / ai-assisted / experimental / planned / unsupported). Lumen never claims a technique it has not built.", inputSchema: { query: z.string().optional(), status: z.enum(["implemented", "partial", "ai-assisted", "experimental", "planned", "unsupported"]).optional(), limit: z.number().int().min(1).max(100).default(25) } }, async ({ query, status, limit }) => {
  const q = query?.toLowerCase(); const l = REGISTRY.filter((r) => (!status || r.status === status) && (!q || r.name.toLowerCase().includes(q) || r.note.toLowerCase().includes(q)));
  const counts: Record<string, number> = {}; for (const r of REGISTRY) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return text(`Registry totals: ${JSON.stringify(counts)}\n${l.length} match(es), showing ${Math.min(l.length, limit)}:\n` + l.slice(0, limit).map((r) => `#${r.id} ${r.name} [${r.status}] ${r.note}`).join("\n"));
});

server.registerTool("lumen_analyze_image", { description: "Measure a photo (exposure, clipping, saturation, noise, sharpness, backlight, subject box) with Lumen's analysis code.", inputSchema: { input_path: z.string() } }, async ({ input_path }) => {
  try { const pg = await getPage(); const r = await pg.evaluate(`window.lumenAnalyse(${JSON.stringify(readB64(input_path))})`); return text(JSON.stringify(r, null, 2)); } catch (e: any) { return text(e.message, true); }
});

const RetouchOp = z.union([
  z.object({ type: z.enum(["clone", "heal"]), sx: z.number(), sy: z.number(), dx: z.number(), dy: z.number(), r: z.number().describe("radius as fraction of the long edge, e.g. 0.02") }),
  z.object({ type: z.literal("spot"), x: z.number(), y: z.number(), r: z.number() }),
  z.object({ type: z.literal("remove"), pts: z.array(z.tuple([z.number(), z.number()])).describe("brush path, normalised 0..1"), r: z.number() }),
]);
server.registerTool("lumen_edit_image", {
  description: "Edit a photo with Lumen and write the result to disk. Real per-pixel processing: manual parameters, effects, an offline text request, and retouch operations (clone, heal, spot, object removal; coordinates normalised 0..1 on the source). Export to jpeg/png/webp/tiff, SDR or HDR (16-bit PNG, BT.2020 PQ, expanded from SDR), at original size or 360p/480p/720p/1080p/4k/8k (long edge; enlarging is Lanczos, not AI). Reports how many pixels changed vs the original and which parts of a request were not understood or are unsupported.",
  inputSchema: {
    input_path: z.string(), output_path: z.string().optional().describe("Defaults to <input>-lumen.<ext> next to the input"),
    auto: z.boolean().optional().describe("Apply Lumen's automatic recipe (the 'simple AI edit' without a language model)"),
    request: z.string().optional().describe("Plain-language request, interpreted offline, e.g. 'warmer, more contrast, bokeh'"),
    effects: z.array(z.object({ id: z.string(), strength: z.number().min(0).max(1).optional() })).optional(),
    manual: z.record(z.string(), z.any()).optional().describe("Raw parameters, e.g. {exposure: 0.4, contrast: 12, temperature: 8}"),
    retouch: z.array(RetouchOp).optional(),
    format: z.enum(["image/jpeg", "image/png", "image/webp", "image/tiff"]).default("image/jpeg"), quality: z.number().min(0.1).max(1).optional(),
    resolution: z.enum(["orig", "360p", "480p", "720p", "1080p", "4k", "8k"]).default("orig"), range: z.enum(["sdr", "hdr"]).default("sdr"),
  },
}, async (a) => {
  try { const pg = await getPage(); const job = { image: readB64(a.input_path), auto: a.auto, request: a.request, effects: a.effects, manual: a.manual, retouch: a.retouch, format: a.format, quality: a.quality, resolution: a.resolution, range: a.range };
    const r: any = await pg.evaluate(`window.lumenRun(${JSON.stringify(job)})`);
    const out = a.output_path ?? path.join(path.dirname(a.input_path), path.basename(a.input_path, path.extname(a.input_path)) + "-lumen." + r.ext); fs.writeFileSync(out, Buffer.from(r.base64, "base64"));
    return text([`Wrote ${out} (${r.width}x${r.height}, ${(r.bytes / 1024).toFixed(0)} KB, ${r.range.toUpperCase()}${r.resized !== "none" ? ", " + (r.resized === "up" ? "enlarged with Lanczos (no new detail)" : "downscaled with Lanczos") : ""}).`, r.evidence, r.notes.length ? "Applied:\n- " + r.notes.join("\n- ") : "", r.unsupported.length ? "NOT done:\n- " + r.unsupported.map((u: any) => `${u.phrase}: ${u.why}`).join("\n- ") : "", a.range === "hdr" ? "HDR is expanded from an SDR source (inverse tone map), tagged BT.2020/PQ, capped at 3840 px." : ""].filter(Boolean).join("\n")); }
  catch (e: any) { return text(e.message, true); }
});

const bye = () => { try { browser?.close(); } catch {} process.exit(0); };
process.stdin.on("end", bye); process.on("SIGTERM", bye); process.on("SIGINT", bye);
await server.connect(new StdioServerTransport());
