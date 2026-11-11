// Waveform and vectorscope on the live preview: they must draw real data and react to edits.
import { chromium } from "playwright";
import { R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/ref_warm.jpg"); await page.waitForSelector("a[href^='/editor']"); await page.click("a[href^='/editor']"); await R(page);
  const stat = async () => page.evaluate(`(function(){ var c = document.querySelector("[data-testid=histogram]"); var d = c.getContext("2d").getImageData(0,0,c.width,c.height).data; var dot = function (d, o) { return d[o] >= 90 && Math.abs(d[o] - d[o+1]) < 6 && Math.abs(d[o+1] - d[o+2]) < 6; }; var lit = 0, sx = 0, sy = 0, n = 0; for (var y = 0; y < c.height; y++) for (var x = 0; x < c.width; x++) { var o = (y*c.width+x)*4; if (dot(d, o)) { lit++; sx += x; sy += y; n++; } } var R = 0; if (n) { var cx = c.width/2, cy = c.height/2; for (var y2 = 0; y2 < c.height; y2++) for (var x2 = 0; x2 < c.width; x2++) { var o2 = (y2*c.width+x2)*4; if (dot(d, o2)) R += Math.hypot(x2 - cx, y2 - cy); } R /= n; } return { lit: lit, spread: R, w: c.width, h: c.height }; })()`) as Promise<{ lit: number; spread: number; w: number; h: number }>;
  const hist = await stat(); ok("histogram draws", hist.lit > 100, `${hist.lit}`);
  await page.click("[data-testid=scope-wave]"); await page.waitForTimeout(500); const wf = await stat(); ok("waveform draws real data", wf.lit > 200 && wf.h === 100, `${wf.lit}`);
  await page.click("[data-testid=scope-vector]"); await page.waitForTimeout(500); const vs = await stat(); ok("vectorscope draws real data on a square plot", vs.lit > 50 && vs.h === 160, `${vs.lit}`);
  await page.click("[data-testid=right-effects]"); await page.waitForSelector("[data-testid=fx-apply-black-white]"); await page.click("[data-testid=fx-apply-black-white]"); await page.waitForTimeout(700); const bw = await stat();
  ok("after Black & White the vectorscope collapses toward the centre", bw.spread < vs.spread * 0.8, `${vs.spread.toFixed(1)} -> ${bw.spread.toFixed(1)}`);
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
