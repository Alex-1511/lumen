// End-to-end MCP test: spawn the real stdio server, call its tools like Antigravity/Codex/Cowork would, and inspect the files it writes.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync } from "node:child_process";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-mcp-"));
const px = (file: string, fx: number, fy: number) => { const out = execFileSync("python3", ["-c", `from PIL import Image;im=Image.open("${file}").convert("RGB");w,h=im.size;print(w,h,*im.getpixel((int(w*${fx}),int(h*${fy}))))`]).toString().trim().split(" ").map(Number); return { w: out[0], h: out[1], v: (out[2] + out[3] + out[4]) / 3 }; };
const t = new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/server.mts"], env: { ...process.env, LUMEN_URL: process.env.LUMEN_URL ?? "http://localhost:3100" } as any });
const c = new Client({ name: "test", version: "1" }); await c.connect(t);
const names = (await c.listTools()).tools.map((x) => x.name); ok("server exposes the expected tools", ["lumen_status", "lumen_list_effects", "lumen_capabilities", "lumen_analyze_image", "lumen_edit_image"].every((n) => names.includes(n)), names.join(","));
const call = async (name: string, args: any) => { const r: any = await c.callTool({ name, arguments: args }); return { text: r.content.map((x: any) => x.text).join("\n"), err: !!r.isError }; };
let r = await call("lumen_status", {}); ok("status: Lumen reachable", !r.err && /reachable/.test(r.text), r.text.slice(0, 90));
r = await call("lumen_list_effects", { category: "Blur & Sharpen" }); ok("list effects includes Bokeh and Tilt-Shift", /bokeh/.test(r.text) && /tilt-shift/.test(r.text));
r = await call("lumen_capabilities", { query: "heal", limit: 5 }); ok("capabilities returns registry rows with statuses", /\[(implemented|partial|planned|unsupported|experimental|ai-assisted)\]/.test(r.text), r.text.split("\n")[0]);
r = await call("lumen_analyze_image", { input_path: path.resolve("tests/fixtures/spot.png") }); ok("analyze returns measurements", /medianLuma/.test(r.text));
const spot = path.resolve("tests/fixtures/spot.png"), out1 = path.join(dir, "spot-out.png");
r = await call("lumen_edit_image", { input_path: spot, output_path: out1, format: "image/png", retouch: [{ type: "spot", x: 0.5, y: 0.5, r: 0.05 }] });
ok("edit: retouch spot writes a file", !r.err && fs.existsSync(out1), r.text.split("\n")[0]); if (fs.existsSync(out1)) { const p = px(out1, 0.5, 0.5); ok("edit: the white disc is gone in the written file", p.v < 80, p.v.toFixed(0)); ok("edit: report gives pixel-difference evidence", /Edited pixels|pixel/i.test(r.text)); }
const horizon = path.resolve("tests/fixtures/horizon_clean.jpg"), out2 = path.join(dir, "h.png");
r = await call("lumen_edit_image", { input_path: horizon, output_path: out2, format: "image/png", effects: [{ id: "black-white", strength: 1 }], resolution: "720p" });
ok("edit: effect + 720p export", !r.err && fs.existsSync(out2) && px(out2, 0.5, 0.5).w === 1280, r.text.split("\n")[0]);
r = await call("lumen_edit_image", { input_path: horizon, output_path: path.join(dir, "x.jpg"), request: "make it warmer and remove the person on the left" }); ok("edit: unsupported part of a request is reported, not faked", /NOT done/.test(r.text) && /Retouch|retouch|location/.test(r.text), r.text.split("\n").slice(-3).join(" | "));
r = await call("lumen_edit_image", { input_path: horizon, output_path: path.join(dir, "hdr.png"), format: "image/png", range: "hdr", resolution: "720p" }); ok("edit: HDR export is a 16-bit PNG", !r.err && execFileSync("python3", ["-c", `d=open("${path.join(dir, "hdr.png")}","rb").read(40);print(d[24])`]).toString().trim() === "16", r.text.split("\n")[0]);
r = await call("lumen_edit_image", { input_path: "/nope.jpg" }); ok("missing file gives a clear error", r.err && /not found/i.test(r.text));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
