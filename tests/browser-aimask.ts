// The user's scenario: "darken the leaves, sharpen the ant, keep the sunlight bright". The assistant must build MASKS, change only those regions, and leave the sky alone.
import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const region = (page: Page, y0: number, y1: number): Promise<number> => page.evaluate(`(function(){ var cs = document.querySelectorAll("canvas"); var c = cs[1]; var t = document.createElement("canvas"); t.width = 200; t.height = Math.round(200 * c.height / c.width); var x = t.getContext("2d"); x.drawImage(c, 0, 0, t.width, t.height); var a = Math.floor(t.height * ${y0}), b = Math.floor(t.height * ${y1}); var d = x.getImageData(0, a, t.width, b - a).data, s = 0; for (var k = 0; k < d.length; k += 4) s += (0.2126 * d[k] + 0.7152 * d[k+1] + 0.0722 * d[k+2]) / 255; return s / (d.length / 4); })()`) as Promise<number>;
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/leaves_sun.png"); await page.waitForSelector("a[href^='/editor']"); await page.click("a[href^='/editor']"); await R(page); await page.waitForTimeout(800);
  const skyB = await region(page, 0.02, 0.28), leafB = await region(page, 0.45, 0.95);
  await T(page, "assistant"); await page.fill("[data-testid=chat]", "Darken the leaves and sharpen the ant, preserving the sunlight brightness"); await page.click("[data-testid=interpret-go]");
  const res = await page.innerText("[data-testid=intent-result]");
  ok("the interpreter plans MASKS, not 'cannot do'", /mask/i.test(res) && /(leaves|foliage)/i.test(res) && !/Cannot do/.test(res), res.slice(0, 160).replace(/\n/g, " "));
  ok("it says the mask is approximate", /cut-out|approx|not a pixel/i.test(res));
  await page.click("[data-testid=intent-apply]"); await page.waitForTimeout(900);
  const skyA = await region(page, 0.02, 0.28), leafA = await region(page, 0.45, 0.95);
  ok("the leaves got darker", leafA < leafB - 0.02, `${leafB.toFixed(3)} -> ${leafA.toFixed(3)}`);
  ok("the sunlit sky is preserved (within 1.5%)", Math.abs(skyA - skyB) < 0.015, `${skyB.toFixed(3)} -> ${skyA.toFixed(3)}`);
  await T(page, "masks"); const layers = await page.locator("[data-testid=layer-row]").count().catch(() => 0);
  ok("the Masks tab shows the layers that were created", layers >= 1 || /(leaves|foliage|subject)/i.test(await page.locator("body").innerText()), `${layers} rows`);
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
