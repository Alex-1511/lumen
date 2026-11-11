// Output sharpening and the responsive set, through the real export dialog.
import { chromium } from "playwright";
import fs from "node:fs";
import { R, T } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage(); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", "tests/fixtures/ref_warm.jpg"); await page.waitForSelector("a[href^='/editor']"); await page.click("a[href^='/editor']"); await R(page);
  const edgeEnergy = async (path: string) => page.evaluate(`(async function(){ var b = ${JSON.stringify(fs.readFileSync(path).toString("base64"))}; var by = Uint8Array.from(atob(b), function(c){return c.charCodeAt(0)}); var bm = await createImageBitmap(new Blob([by])); var c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height; var x = c.getContext("2d"); x.drawImage(bm,0,0); var d = x.getImageData(0,0,c.width,c.height).data, s = 0; for (var i = 0; i < d.length - 4; i += 4) s += Math.abs(d[i] - d[i+4]); return s / (d.length/4); })()`) as Promise<number>;
  const doExport = async (sharp: string, name: string) => { await T(page, "export"); await page.selectOption("[data-testid=exp-fmt]", "image/png"); await page.selectOption("[data-testid=exp-sharpen]", sharp); const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-testid=exp-go]")]); const p = `/tmp/${name}.png`; await dl.saveAs(p); await page.keyboard.press("Escape").catch(() => {}); await page.click("[aria-label=Close]").catch(() => {}); return p; };
  const none = await edgeEnergy(await doExport("off", "sh-off")), scr = await edgeEnergy(await doExport("screen", "sh-screen")), prt = await edgeEnergy(await doExport("print", "sh-print"));
  ok("screen sharpening raises edge energy of the exported file", scr > none * 1.02, `${none.toFixed(4)} -> ${scr.toFixed(4)}`); ok("print sharpening raises it further", prt > scr, `${prt.toFixed(4)}`);
  await T(page, "export"); const dls: string[] = []; page.on("download", (d) => dls.push(d.suggestedFilename())); await page.click("[data-testid=exp-responsive]"); await page.waitForFunction(() => /Exported \d+ sizes/.test(document.querySelector("[data-testid=exp-msg]")?.textContent ?? ""), null, { timeout: 60000 });
  ok("responsive set downloads several widths", dls.length >= 1 && dls.every((n) => /-\d+w\./.test(n)), dls.join(", ")); ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
