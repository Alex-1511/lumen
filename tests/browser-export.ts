import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
import { readFileSync } from "fs";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
function parseTiff(buf: Buffer) { const n = buf.readUInt16LE(8); const t: Record<number, number> = {}; for (let i = 0; i < n; i++) { const o = 10 + i * 12; t[buf.readUInt16LE(o)] = buf.readUInt16LE(o + 2) === 3 ? buf.readUInt16LE(o + 8) : buf.readUInt32LE(o + 8); } return { w: t[256], h: t[257], off: t[273], len: t[279], magic: buf.readUInt16LE(2) }; }
async function doExport(page: Page, file: string) { const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("[data-testid=exp-go]")]); await dl.saveAs(file); return dl.suggestedFilename(); }
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true } as any); const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text())); page.on("crash", () => errors.push("crash"));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/tilted.jpg"); await page.waitForSelector("text=tilted"); await page.click("a[href*='editor']"); await R(page); await page.waitForTimeout(700);
  await T(page, "export");
  await page.selectOption("[data-testid=exp-fmt]", "image/tiff"); await page.selectOption("[data-testid=exp-res]", "custom"); await page.fill("[data-testid=exp-edge]", "600");
  const name = await doExport(page, "/tmp/exp-plain.tif"); await page.waitForTimeout(300);
  const a = readFileSync("/tmp/exp-plain.tif"); const ta = parseTiff(a);
  ok("TIFF export has a .tif filename", name.endsWith(".tif"), name);
  ok("TIFF export is a valid baseline TIFF", ta.magic === 42 && a.length === ta.off + ta.len && ta.len === ta.w * ta.h * 3, `${ta.w}×${ta.h}`);
  ok("long-edge resize is honoured", Math.max(ta.w, ta.h) === 600, `${ta.w}×${ta.h}`);
  await page.fill("[data-testid=exp-wm]", "© Lumen test"); await page.waitForTimeout(200);
  await doExport(page, "/tmp/exp-wm.tif"); const b = readFileSync("/tmp/exp-wm.tif"); const tb = parseTiff(b);
  ok("watermarked export keeps the same size", tb.w === ta.w && tb.h === ta.h);
  let diffBR = 0, diffElse = 0; for (let y = 0; y < ta.h; y++) for (let x = 0; x < ta.w; x++) { const o = ta.off + (y * ta.w + x) * 3; const d = Math.abs(a[o] - b[tb.off + (y * ta.w + x) * 3]) + Math.abs(a[o + 1] - b[tb.off + (y * ta.w + x) * 3 + 1]); if (d > 6) { if (x > ta.w * 0.5 && y > ta.h * 0.85) diffBR++; else diffElse++; } }
  ok("watermark changes pixels only in the bottom-right corner", diffBR > 80 && diffElse === 0, `corner ${diffBR}, elsewhere ${diffElse}`);
  await page.selectOption("[data-testid=exp-fmt]", "image/png"); await page.fill("[data-testid=exp-wm]", ""); await doExport(page, "/tmp/exp.png");
  const png = readFileSync("/tmp/exp.png"); ok("PNG export is a real PNG at the requested size", png.subarray(1, 4).toString() === "PNG" && Math.max(png.readUInt32BE(16), png.readUInt32BE(20)) === 600, `${png.readUInt32BE(16)}×${png.readUInt32BE(20)}`);
  // determinism: same photo + same parameters must give identical bytes (grain is seeded, nothing random)
  await page.selectOption("[data-testid=exp-fmt]", "image/tiff"); await doExport(page, "/tmp/det-1.tif"); await page.waitForTimeout(300); await doExport(page, "/tmp/det-2.tif");
  const d1 = readFileSync("/tmp/det-1.tif"), d2 = readFileSync("/tmp/det-2.tif"); ok("exporting the same edit twice gives byte-identical files (deterministic, per-pixel)", d1.length === d2.length && d1.equals(d2), `${d1.length} bytes`);
  await page.selectOption("[data-testid=exp-fmt]", "image/png");
  ok("export message states metadata is stripped", /no metadata/i.test(await page.innerText("[data-testid=exp-msg]")));
  // --- resolution ladder, upscaling, HDR, pixel-difference evidence ---
  const dims = (f: string) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], buf: b }; };
  const msg = () => page.locator("[data-testid=exp-msg]").innerText();
  await page.selectOption("[data-testid=exp-res]", "480p"); await doExport(page, "/tmp/r480.png"); let d = dims("/tmp/r480.png"); ok("480p export is 854 px on the long edge", d.w === 854, `${d.w}×${d.h}`);
  ok("downscaled export keeps the aspect ratio", Math.abs(d.w / d.h - 1600 / 1067) < 0.01);
  await page.selectOption("[data-testid=exp-res]", "360p"); await doExport(page, "/tmp/r360.png"); d = dims("/tmp/r360.png"); ok("360p export is 640 px", d.w === 640, `${d.w}×${d.h}`);
  await page.selectOption("[data-testid=exp-res]", "1080p"); await doExport(page, "/tmp/r1080.png"); d = dims("/tmp/r1080.png"); ok("1080p export is 1920 px (enlarged from a 1600 px source)", d.w === 1920, `${d.w}×${d.h}`);
  ok("enlarging is labelled honestly (Lanczos, no new detail)", (await msg()).includes("no new detail"));
  ok("a warning appears before exporting larger than the source", await page.locator("text=not AI super-resolution").isVisible());
  await page.selectOption("[data-testid=exp-res]", "4k"); await doExport(page, "/tmp/r4k.png"); d = dims("/tmp/r4k.png"); ok("4K export is 3840 px", d.w === 3840, `${d.w}×${d.h}`);
  await page.selectOption("[data-testid=exp-res]", "720p"); await page.selectOption("[data-testid=exp-range]", "hdr");
  const hn = await doExport(page, "/tmp/hdr.png"); d = dims("/tmp/hdr.png"); const txt = d.buf.toString("latin1"); const ci = txt.indexOf("cICP");
  ok("HDR export is a 16-bit PNG named -hdr", d.depth === 16 && hn.includes("-hdr") && d.w === 1280, `${hn} depth ${d.depth} ${d.w}×${d.h}`);
  ok("HDR export is tagged BT.2020 + PQ (cICP 9,16,0,1)", ci > 0 && d.buf[ci + 4] === 9 && d.buf[ci + 5] === 16 && d.buf[ci + 7] === 1);
  ok("HDR export message says so", (await msg()).includes("16-bit PQ/BT.2020"));
  ok("every export reports how many pixels differ from the original", (await msg()).includes("Edited pixels") || (await msg()).includes("not meaningful"), (await msg()).slice(-130));
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | ")); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
