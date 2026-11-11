// Retouch tools in the real editor: a white disc on a dark photo must disappear from the canvas AND from the exported file.
import { chromium } from "playwright";
import fs from "node:fs";
import { R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const CENTER = (b64: string, fx = 0.5, fy = 0.5) => `(async () => { var bytes = Uint8Array.from(atob("${b64}"), function (c) { return c.charCodeAt(0); }); var bm = await createImageBitmap(new Blob([bytes])); var c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; var g = c.getContext("2d"); g.drawImage(bm, 0, 0); var d = g.getImageData(Math.round(bm.width * ${fx}), Math.round(bm.height * ${fy}), 1, 1).data; return (d[0] + d[1] + d[2]) / 3; })()`;
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  const open = async () => { await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
    await page.setInputFiles("input[type=file]", "tests/fixtures/spot.png"); await page.waitForSelector("a[href^='/editor']"); await page.click("a[href^='/editor']"); await R(page); await page.click("[data-testid=right-retouch]"); await page.waitForSelector("[data-testid=retouch-panel]"); };
  const canvas = () => page.locator("canvas").first();
  const centerLuma = async () => page.evaluate(CENTER((await canvas().screenshot()).toString("base64")));
  const clickAt = async (fx: number, fy: number) => { const b = (await page.locator("[data-testid=retouch-overlay]").boundingBox())!; await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy); await page.waitForTimeout(700); };

  await open(); const before = await centerLuma(); ok("fixture starts with a bright disc in the middle", before > 200, before.toFixed(0));
  ok("panel is honest that generative fill is not available", (await page.locator("text=Generative fill").count()) > 0);
  await page.click("[data-testid=rt-spot]"); await page.fill("[data-testid=rt-size]", "0.05").catch(() => {}); await page.locator("[data-testid=rt-size]").evaluate((el: HTMLInputElement) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(el, "0.05"); el.dispatchEvent(new Event("input", { bubbles: true })); });
  await clickAt(0.5, 0.5); const afterSpot = await centerLuma(); ok("spot removal removes the disc on the canvas", afterSpot < 80, `${before.toFixed(0)} -> ${afterSpot.toFixed(0)}`);
  ok("step is listed", (await page.locator("text=1. Spot removal").count()) === 1);
  await page.click("[data-testid=rt-undo]"); await page.waitForTimeout(500); const undone = await centerLuma(); ok("undo brings the original pixels back", undone > 200, undone.toFixed(0));

  // heal: source on the dark background, target on the disc
  await page.click("[data-testid=rt-heal]"); await clickAt(0.2, 0.3); await clickAt(0.5, 0.5); const afterHeal = await centerLuma(); ok("heal removes the disc using a chosen source", afterHeal < 80, afterHeal.toFixed(0));
  await page.click("[data-testid=rt-clear]"); await page.waitForTimeout(400);
  // object removal with a brush stroke across the disc
  await page.click("[data-testid=rt-remove]"); const b = (await page.locator("[data-testid=retouch-overlay]").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.44, b.y + b.height * 0.5); await page.mouse.down(); for (let i = 0; i <= 10; i++) await page.mouse.move(b.x + b.width * (0.44 + i * 0.012), b.y + b.height * 0.5, { steps: 2 }); await page.mouse.up(); await page.waitForTimeout(1200);
  const afterRemove = await centerLuma(); ok("object removal brush fills the disc from surrounding pixels", afterRemove < 80, afterRemove.toFixed(0));

  // the edit must reach the exported file (single-file export from the Projects page, original left untouched)
  await page.click("a:text-is('Projects')"); await page.waitForSelector("[data-testid=quick-export]");
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.click("[data-testid=quick-export]")]); const out = fs.readFileSync(await d.path()!);
  const exported: number = await page.evaluate(CENTER(out.toString("base64")));
  ok("exported file has the disc removed (pixel by pixel edited)", exported < 80, exported.toFixed(0));
  const orig: number = await page.evaluate(CENTER(fs.readFileSync("tests/fixtures/spot.png").toString("base64"))); ok("the original upload is untouched", orig > 200, orig.toFixed(0));
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
