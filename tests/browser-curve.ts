import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const meanLum = (page: Page): Promise<number> => page.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); t.width = 200; t.height = Math.round(200 * c.height / c.width); const x = t.getContext("2d")!; x.drawImage(c, 0, 0, t.width, t.height); const d = x.getImageData(0, 0, t.width, t.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4) / 255; });
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text())); page.on("crash", () => errors.push("crash"));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/tilted.jpg"); await page.waitForSelector("text=tilted"); await page.click("a[href*='editor']"); await R(page); await page.waitForTimeout(700); await T(page, "edit");
  const svg = page.locator("[data-testid=curve-editor]"); await svg.scrollIntoViewIfNeeded(); const bb = (await svg.boundingBox())!; const k = bb.width / 220;
  const at = (x: number, y: number) => ({ x: bb.x + (8 + x * 204) * k, y: bb.y + (8 + (1 - y) * 204) * k });
  const base = await meanLum(page);
  ok("curve editor starts with two endpoint handles", (await page.locator("[data-testid=curve-point]").count()) === 2);
  // add a midpoint and drag it up
  const a = at(0.5, 0.5), b = at(0.5, 0.8); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500);
  const up = await meanLum(page);
  ok("clicking the curve adds a point", (await page.locator("[data-testid=curve-point]").count()) === 3);
  ok("dragging the midpoint up brightens the image", up - base > 0.04, `${base.toFixed(3)} → ${up.toFixed(3)}`);
  // drag down
  const c2 = at(0.5, 0.2); await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(c2.x, c2.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(500);
  const dn = await meanLum(page); ok("dragging it down darkens the image", base - dn > 0.04, `${base.toFixed(3)} → ${dn.toFixed(3)}`);
  // endpoint x stays locked
  const pts = await page.locator("[data-testid=curve-point]").evaluateAll((els) => els.map((e) => +(e.getAttribute("cx") as string)));
  ok("endpoints keep x at 0 and 1", Math.abs(pts[0] - 8) < 0.5 && Math.abs(pts[2] - 212) < 0.5, JSON.stringify(pts));
  // double-click removes it
  await page.mouse.dblclick(c2.x, c2.y); await page.waitForTimeout(500); const rem = await meanLum(page);
  ok("double-click removes an inner point and restores the original tone", (await page.locator("[data-testid=curve-point]").count()) === 2 && Math.abs(rem - base) < 0.01, `${rem.toFixed(3)} vs ${base.toFixed(3)}`);
  // undo restores the previous curve (history entries were committed)
  await page.keyboard.press("Control+z"); await page.waitForTimeout(500); ok("undo brings the removed point back", (await page.locator("[data-testid=curve-point]").count()) === 3);
  // reset
  await page.click("button:text-is('Reset')"); await page.waitForTimeout(500); ok("reset returns to identity", (await page.locator("[data-testid=curve-point]").count()) === 2 && Math.abs((await meanLum(page)) - base) < 0.01);
  // presets still work and show up as points
  await page.click("button:text-is('Medium S')"); await page.waitForTimeout(500); ok("preset curve populates the editor", (await page.locator("[data-testid=curve-point]").count()) === 4);
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | ")); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
