// Regression: a manual edit must survive leaving the editor immediately, and exports must differ from the original pixel-wise.
import { chromium } from "playwright";
import fs from "node:fs";
import { R, T } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/horizon_clean.jpg"); await page.waitForSelector("a[href^='/editor']");
  await page.click("a[href^='/editor']"); await R(page); await T(page, "edit");
  const exp = page.locator("div.mb-2\\.5:has(span:text-is(\"Exposure\")) input[type=range]"); await exp.scrollIntoViewIfNeeded(); await exp.focus();
  for (let i = 0; i < 25; i++) await page.keyboard.press("ArrowRight");
  await page.click("a:text-is('Projects')");               // leave IMMEDIATELY: no waiting for the debounce
  await page.waitForSelector("[data-testid=quick-export]");
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("[data-testid=quick-export]")]);
  const edited = fs.readFileSync(await d.path()!); const orig = fs.readFileSync("tests/fixtures/horizon_clean.jpg");
  const js = (a: string, b: string) => `(async () => {
    var luma = async function (b64) { var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); var bm = await createImageBitmap(new Blob([bytes])); var c = document.createElement("canvas"); c.width = 200; c.height = 133; var g = c.getContext("2d"); g.drawImage(bm, 0, 0, 200, 133); var d = g.getImageData(0, 0, 200, 133).data; var s = 0; for (var i = 0; i < d.length; i += 4) s += d[i] * .2126 + d[i + 1] * .7152 + d[i + 2] * .0722; return s / (d.length / 4); };
    return { e: await luma("${a}"), o: await luma("${b}") }; })()`;
  const stats: any = await page.evaluate(js(edited.toString("base64"), orig.toString("base64")));
  ok("edit made just before leaving the editor is exported (brighter than the original)", stats.e > stats.o + 2, `edited ${stats.e.toFixed(1)} vs original ${stats.o.toFixed(1)}`);
  await page.reload(); await page.click("a[href^='/editor']"); await R(page); await T(page, "edit");
  const v = await page.locator("div.mb-2\\.5:has(span:text-is(\"Exposure\")) input[type=range]").inputValue();
  ok("the slider value is still there after reopening", parseFloat(v) > 0.2, v);
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
