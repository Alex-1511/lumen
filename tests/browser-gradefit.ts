// Grade matching against ground truth: make a reference by grading a photo with KNOWN settings, then see how much of that grade the fitter recovers.
import { chromium } from "playwright";
import fs from "node:fs";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage(); const errs: string[] = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE + "/headless"); await page.waitForFunction("window.lumenGradeFit");
  const img = fs.readFileSync("tests/fixtures/horizon_clean.jpg").toString("base64");
  const grades: [string, any][] = [
    ["teal and orange", { contrast: 22, saturation: -6, gradeShH: -30, gradeShS: 40, gradeHiH: -8, gradeHiS: 36 }],
    ["faded warm film", { fade: 40, temperature: 20, saturation: -15, contrast: -6, gradeHiS: 20 }],
    ["dark and moody", { exposure: -0.5, contrast: 26, blacks: -14, saturation: -12, temperature: -12 }],
  ];
  for (const [name, g] of grades) {
    const r: any = await page.evaluate(`window.lumenGradeFit(${JSON.stringify(img)}, ${JSON.stringify(g)})`);
    ok(`${name}: distance to the reference drops by at least 60%`, r.after < r.before * 0.4, `${r.before.toFixed(3)} -> ${r.after.toFixed(3)} in ${r.evals} renders, ${r.ms} ms`);
    ok(`${name}: the fitter proposes real slider changes`, Object.keys(r.patch).length >= 2, JSON.stringify(r.patch).slice(0, 140));
  }
  ok("no page errors", errs.length === 0, errs.join("|"));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
