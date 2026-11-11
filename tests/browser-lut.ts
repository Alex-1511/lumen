// 3D LUT + gradient map on the real GPU renderer (via the headless runner), plus the Grade-tab UI path.
import { chromium } from "playwright";
import fs from "node:fs";
import { R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const cube = (n: number, f: (r: number, g: number, b: number) => number[]) => { let s = `TITLE "t"\nLUT_3D_SIZE ${n}\n`; for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) s += f(r / (n - 1), g / (n - 1), b / (n - 1)).map((v) => v.toFixed(5)).join(" ") + "\n"; return s; };
const MEAN = `(async function (b64) { var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); var bm = await createImageBitmap(new Blob([bytes])); var c = document.createElement("canvas"); c.width = 160; c.height = Math.round(160 * bm.height / bm.width); var x = c.getContext("2d"); x.drawImage(bm, 0, 0, c.width, c.height); var d = x.getImageData(0, 0, c.width, c.height).data; var r = 0, g = 0, b = 0, n = d.length / 4; for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [r / n, g / n, b / n]; })`;
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/headless"); await page.waitForFunction("window.lumenRun");
  const img = fs.readFileSync("tests/fixtures/horizon_clean.jpg").toString("base64");
  const run = async (lut: any) => { const r: any = await page.evaluate(`window.lumenRun(${JSON.stringify({ image: img, lut, edge: 320 })})`); return { r, m: (await page.evaluate(`${MEAN}(${JSON.stringify(r.base64)})`)) as number[] }; };
  const base = await run(undefined);
  const idn = await run({ cube: cube(9, (r, g, b) => [r, g, b]) }); ok("identity LUT leaves the render unchanged (mean within 2 levels)", idn.m.every((v, i) => Math.abs(v - base.m[i]) < 2), `${base.m.map((v) => v.toFixed(1))} vs ${idn.m.map((v) => v.toFixed(1))}`);
  const inv = await run({ cube: cube(9, (r, g, b) => [1 - r, 1 - g, 1 - b]) }); ok("invert LUT inverts the real render (mean R ~ 255 - R)", Math.abs(inv.m[0] - (255 - base.m[0])) < 6 && Math.abs(inv.m[2] - (255 - base.m[2])) < 6, `${inv.m.map((v) => v.toFixed(1))}`);
  const half = await run({ cube: cube(9, (r, g, b) => [1 - r, 1 - g, 1 - b]), amount: 0.5 }); ok("amount 50% blends halfway", Math.abs(half.m[0] - (base.m[0] + inv.m[0]) / 2) < 6, `${half.m[0].toFixed(1)}`);
  const red = await run({ cube: cube(9, (r, g, b) => [Math.min(1, r * 1.0 + 0.3), g * 0.8, b * 0.8]) }); ok("a warm LUT raises red and lowers blue", red.m[0] > base.m[0] + 20 && red.m[2] < base.m[2] - 5, `${red.m.map((v) => v.toFixed(1))}`);
  const gm = await run({ gradient: "cyanotype" }); ok("gradient map makes the image blue-dominant", gm.m[2] > gm.m[0] + 20, `${gm.m.map((v) => v.toFixed(1))}`);
  const bad = await run({ cube: "junk" }); ok("a broken LUT is reported, not silently ignored", (bad.r.unsupported ?? []).some((u: any) => /LUT/.test(u.phrase)) && Math.abs(bad.m[0] - base.m[0]) < 2);
  // UI path
  const ui = await browser.newPage({ viewport: { width: 1440, height: 900 } }); await ui.goto(BASE + "/projects"); await ui.evaluate(() => indexedDB.deleteDatabase("lumen")); await ui.goto(BASE + "/projects");
  await ui.setInputFiles("input[type=file]", "tests/fixtures/horizon_clean.jpg"); await ui.waitForSelector("a[href^='/editor']"); await ui.click("a[href^='/editor']"); await R(ui);
  await ui.click("[data-testid=right-grade]"); const before = await ui.locator("canvas").first().screenshot();
  fs.writeFileSync("/tmp/invert.cube", cube(9, (r, g, b) => [1 - r, 1 - g, 1 - b])); await ui.setInputFiles("[data-testid=lut-file]", "/tmp/invert.cube"); await ui.waitForSelector("[data-testid=lut-active]"); await ui.waitForTimeout(500);
  const after = await ui.locator("canvas").first().screenshot(); ok("importing a .cube in the editor changes the preview", Buffer.compare(before, after) !== 0);
  fs.writeFileSync("/tmp/bad.cube", "nonsense"); await ui.setInputFiles("[data-testid=lut-file]", "/tmp/bad.cube"); await ui.waitForSelector("[data-testid=lut-msg]"); ok("a bad .cube shows an error", /not a \.cube/.test(await ui.locator("[data-testid=lut-msg]").innerText()));
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
