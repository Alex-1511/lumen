// Effects library: every effect must change real pixels in the direction its name promises.
import { chromium } from "playwright";
import { R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const METRICS = (a: string, b: string) => `(async () => {
  var dec = async function (b64) { var bytes = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); var bm = await createImageBitmap(new Blob([bytes])); var c = document.createElement("canvas"); c.width = 320; c.height = Math.round(320 * bm.height / bm.width); var g = c.getContext("2d"); g.drawImage(bm, 0, 0, c.width, c.height); return g.getImageData(0, 0, c.width, c.height); };
  var A = await dec("${a}"), B = await dec("${b}");
  var diff = 0, n = A.data.length / 4; for (var i = 0; i < A.data.length; i += 4) diff += Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
  var grad = function (I) { var s = 0, w = I.width; for (var y = 0; y < I.height - 1; y++) for (var x = 0; x < w - 1; x++) { var k = (y * w + x) * 4, l = I.data[k] * .3 + I.data[k + 1] * .6 + I.data[k + 2] * .1, r = I.data[k + 4] * .3 + I.data[k + 5] * .6 + I.data[k + 6] * .1, d = I.data[k + w * 4] * .3 + I.data[k + w * 4 + 1] * .6 + I.data[k + w * 4 + 2] * .1; s += Math.abs(l - r) + Math.abs(l - d); } return s / (w * I.height); };
  var sat = function (I) { var s = 0; for (var i = 0; i < I.data.length; i += 4) s += Math.max(I.data[i], I.data[i + 1], I.data[i + 2]) - Math.min(I.data[i], I.data[i + 1], I.data[i + 2]); return s / (I.data.length / 4); };
  return { diff: diff / (3 * n), gA: grad(A), gB: grad(B), sA: sat(A), sB: sat(B) }; })()`;
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/horizon_clean.jpg"); await page.waitForSelector("a[href^='/editor']");
  await page.click("a[href^='/editor']"); await R(page);
  await page.click("[data-testid=right-effects]"); await page.waitForSelector("[data-testid=effects-panel]");
  ok("library lists the effects from the supplied vocabulary", (await page.locator("[data-testid^=fx-apply-]").count()) >= 30);
  for (const n of ["Box Blur", "Gaussian Blur", "Mosaic Blur", "Sharpen", "Tilt-Shift", "Bokeh", "Cinematic", "Vibrant"]) ok(`has "${n}"`, (await page.locator(`text=${n}`).count()) > 0);
  await page.fill("[data-testid=fx-search]", "blur"); ok("search narrows the grid", (await page.locator("[data-testid^=fx-apply-]").count()) < 12);
  await page.fill("[data-testid=fx-search]", "");
  const canvas = page.locator("canvas").first();
  const shot = async () => (await canvas.screenshot()).toString("base64");
  const clear = async () => { await page.click("text=Reset my edits"); await page.waitForTimeout(250); };
  const cases: [string, string, (m: any) => boolean][] = [
    ["sharpen", "edge energy rises", (m) => m.gB > m.gA * 1.02],
    ["mosaic-blur", "pixels change", (m) => m.diff > 0.5],
    ["soft-focus", "pixels change", (m) => m.diff > 0.5],
    ["vibrant", "saturation rises", (m) => m.sB > m.sA],
    ["black-white", "saturation collapses", (m) => m.sB < m.sA * 0.2],
    ["cinematic", "pixels change", (m) => m.diff > 1],
    ["matte", "pixels change", (m) => m.diff > 1],
    ["bleach-bypass", "saturation falls and the render changes", (m) => m.sB < m.sA * 0.9 && m.diff > 3],
    ["cross-processing", "pixels change strongly", (m) => m.diff > 3],
    ["filmic-tone-map", "pixels change", (m) => m.diff > 1],
  ];
  for (const [id, what, test] of cases) {
    await clear(); const before = await shot(); await page.click(`[data-testid=fx-apply-${id}]`); await page.waitForTimeout(500); const after = await shot();
    const m: any = await page.evaluate(METRICS(after, before).replace(/\$\{a\}/g, "")); // A=after, B=before
    ok(`${id}: ${what}`, test({ ...m, gA: m.gB, gB: m.gA, sA: m.sB, sB: m.sA }), JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]: any) => [k, +v.toFixed(2)]))));
  }
  // Blur and sharpen are judged on a detailed image (grid), where edge energy is measurable.
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/grid.png"); await page.waitForSelector("a[href^='/editor']");
  await page.click("a[href^='/editor']"); await R(page); await page.click("[data-testid=right-effects]");
  const detail: [string, string, (m: any) => boolean][] = [
    ["box-blur", "edge energy drops", (m) => m.gB < m.gA * 0.95],
    ["gaussian-blur", "edge energy drops", (m) => m.gB < m.gA * 0.95],
    ["motion-blur", "edge energy drops", (m) => m.gB < m.gA * 0.95],
    ["tilt-shift", "edge energy drops", (m) => m.gB < m.gA * 0.97],
    ["bokeh", "edge energy drops outside the focus area", (m) => m.gB < m.gA * 0.97],
  ];
  const canvas2 = page.locator("canvas").first();
  for (const [id, what, test] of detail) {
    await clear(); const before = (await canvas2.screenshot()).toString("base64"); await page.click(`[data-testid=fx-apply-${id}]`); await page.waitForTimeout(600); const after = (await canvas2.screenshot()).toString("base64");
    const m: any = await page.evaluate(METRICS(after, before));
    ok(`${id} on detailed image: ${what}`, test({ ...m, gA: m.gB, gB: m.gA }), JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]: any) => [k, +v.toFixed(2)]))));
  }
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/horizon_clean.jpg"); await page.waitForSelector("a[href^='/editor']");
  await page.click("a[href^='/editor']"); await R(page); await page.click("[data-testid=right-effects]");
  await clear(); await page.click("[data-testid=fx-apply-anamorphic]"); await page.waitForTimeout(400);
  const box = await page.locator("canvas").first().boundingBox(); ok("anamorphic crops to a wide frame", !!box && box.width / box.height > 2, box ? (box.width / box.height).toFixed(2) : "");
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
