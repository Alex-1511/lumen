import { T, R } from "./_ui";
import { chromium } from "playwright";
import { analyse } from "../lib/analysis";
import { statSync } from "fs";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + "/projects"); await page.setInputFiles("input[type=file]", "tests/fixtures/tilted.jpg");
  await page.waitForSelector("text=tilted", { timeout: 15000 }); ok("import: project appears on dashboard", true);
  await page.click("a[href^='/editor']"); await page.waitForSelector("canvas", { timeout: 15000 }); await R(page);
  const grab = () => page.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); t.width = c.width; t.height = c.height; const x = t.getContext("2d")!; x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height); return { w: t.width, h: t.height, data: Array.from(d.data) }; });
  const mean = (d: number[]) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4) / 255; };
  await page.waitForTimeout(600);
  const a = await grab(); ok("canvas renders a non-blank image", mean(a.data) > 0.05 && mean(a.data) < 0.95, `size=${a.w}x${a.h} mean=${mean(a.data).toFixed(3)}`);
  const rec = await page.locator("text=/Exposure compensation|Straighten|Noise reduction/").count(); ok("analysis proposes a recipe for a dark, tilted, noisy photo", rec >= 1, `ops matched=${rec}`);
  ok("recipe items state a reason", (await page.locator("text=/Histogram spans|Flat tonal|Dominant near-horizontal|Median luma is|Estimated noise/").count()) >= 1);
  // slider moves pixels
  await T(page, "edit"); const before = mean(a.data);
  const slider = page.locator("section#sec-light input[type=range]").first(); const bb = (await slider.boundingBox())!; await page.mouse.move(bb.x + bb.width / 2, bb.y + 1); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.8, bb.y + 1, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500);
  const b = await grab(); ok("exposure slider brightens the real canvas", mean(b.data) > before + 0.02, `${before.toFixed(3)} -> ${mean(b.data).toFixed(3)}`);
  // undo
  await page.click("button:has-text('Undo')"); await page.waitForTimeout(500); const c = await grab(); ok("undo restores the previous render", Math.abs(mean(c.data) - before) < 0.01, `${mean(c.data).toFixed(3)}`);
  // hold-before differs from edited
  await page.locator("button:has-text('Hold: before')").hover(); await page.mouse.down(); await page.waitForTimeout(400); const d = await grab(); await page.mouse.up(); ok("before view differs from edited view", Math.abs(mean(d.data) - mean(b.data)) > 0.015, `${mean(d.data).toFixed(3)}`);
  // toggling the AI exposure item off changes the image
  await T(page, "analysis"); const on = await page.locator("button:text-is('On')").first(); await on.click(); await page.waitForTimeout(500); const e = await grab(); const mad = (x: number[], y: number[]) => { let q = 0; for (let i = 0; i < x.length; i += 4) q += Math.abs(x[i + 1] - y[i + 1]); return q / (x.length / 4) / 255; }; const diff = e.w === c.w && e.h === c.h ? mad(e.data, c.data) : 1; ok("rejecting a recipe item changes the render", diff > 0.001, `mean abs diff=${diff.toFixed(4)}`);
  // straighten sign/magnitude on a clean horizon fixture
  { const p2 = await browser.newPage({ viewport: { width: 1500, height: 900 } }); await p2.goto(BASE + "/projects"); await p2.setInputFiles("input[type=file]", "tests/fixtures/horizon_clean.jpg"); await p2.waitForSelector("text=horizon_clean");
    await p2.click("a[href*='editor']"); await R(p2); await p2.waitForTimeout(700);
    const hasStraighten = (await p2.locator("text=/^Straighten/").count()) > 0; ok("clean tilted horizon: straighten is proposed", hasStraighten);
    const g = await p2.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); t.width = c.width; t.height = c.height; const x = t.getContext("2d")!; x.drawImage(c, 0, 0); return { w: t.width, h: t.height, data: Array.from(x.getImageData(0, 0, t.width, t.height).data) }; });
    const tilt = analyse(Uint8ClampedArray.from(g.data), g.w, g.h); ok("clean horizon is level after AI straighten (|tilt| <= 1.5°)", Math.abs(tilt.horizonTiltDeg) <= 1.5, `residual=${tilt.horizonTiltDeg}° conf=${tilt.horizonConfidence.toFixed(2)}`); await p2.close(); }
  // export
  await T(page, "export"); const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("[data-testid=exp-go]")]); const p = "/tmp/lumen-export.jpg"; await dl.saveAs(p);
  const sz = statSync(p).size; ok("export produces a JPEG file", sz > 20000, `${(sz / 1e6).toFixed(2)}MB name=${dl.suggestedFilename()}`);
  const dim = await page.evaluate(async () => document.body.innerText.match(/Exported (\d+)×(\d+)/)?.slice(1).join("x")); ok("export reports full-resolution output", !!dim && Number(dim.split("x")[0]) > 1400, String(dim));
  // original blob untouched
  const orig = await page.evaluate(async () => { const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open("lumen"); q.onsuccess = () => r(q.result); }); const all = await new Promise<any[]>((r) => { const q = db.transaction("projects").objectStore("projects").getAll(); q.onsuccess = () => r(q.result); }); return { size: all[0].original.size, mime: all[0].original.type, edits: all[0].history.length }; });
  ok("original file stored untouched; edits stored as parameters", orig.size === statSync("tests/fixtures/tilted.jpg").size && orig.edits > 1, JSON.stringify(orig));
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.screenshot({ path: "/tmp/lumen-editor.png" }); await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
