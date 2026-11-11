import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const grab = (page: Page) => page.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); t.width = c.width; t.height = c.height; const x = t.getContext("2d")!; x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data; let y = 0, r = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { y += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; r += d[i]; b += d[i + 2]; n++; } return { luma: y / n / 255, warmth: Math.log((r / n + 1) / (b / n + 1)) }; });
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }); const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + "/projects"); await page.setInputFiles("input[type=file]", "tests/fixtures/tilted.jpg"); await page.waitForSelector("text=tilted"); await page.click("a[href*='editor']"); await R(page); await page.waitForTimeout(700);
  const before = await grab(page);
  await T(page, "reference"); await page.setInputFiles("input[type=file][accept='image/*']", "tests/fixtures/ref_warm.jpg"); await page.waitForSelector("text=Reference: ref_warm");
  ok("reference is described in plain terms", (await page.locator("text=/colour balance/").count()) > 0 && (await page.locator("text=/tonality/").count()) > 0);
  await page.click("button:text-is('Compare with my photo')"); await page.waitForSelector("text=Apply to manual layer");
  ok("match proposes brightness and temperature changes with reasons", (await page.locator("text=Overall brightness").count()) > 0 && (await page.locator("text=Colour temperature").count()) > 0 && (await page.locator("text=/median .* → /").count()) > 0);
  await page.click("button:text-is('Apply to manual layer')"); await page.waitForTimeout(700); const after = await grab(page);
  // reference luma is ~0.50 and warmth is clearly positive; the starting photo is dark and neutral/cool
  ok("applying the match brightens the real render toward the reference", after.luma > before.luma + 0.05, `${before.luma.toFixed(3)} → ${after.luma.toFixed(3)}`);
  ok("applying the match warms the real render", after.warmth > before.warmth + 0.03, `${before.warmth.toFixed(3)} → ${after.warmth.toFixed(3)}`);
  ok("applying a reference match opens the edit report", await page.locator("[data-testid=report-latest]").isVisible());
  await T(page, "reference"); await page.click("button:text-is('Compare with my photo')"); await page.waitForTimeout(400);
  const nothing = await page.locator("text=/already close|Apply to manual layer/").count(); ok("after applying, a second comparison asks for less (converges)", nothing > 0);
  await page.click("button:text-is('Undo')"); await page.waitForTimeout(500); const undone = await grab(page); ok("undo reverts the reference match", Math.abs(undone.luma - before.luma) < 0.01, `${undone.luma.toFixed(3)}`);
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
