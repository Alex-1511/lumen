import { T, R } from "./_ui";
import { chromium } from "playwright";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text())); page.on("crash", () => errors.push("crash"));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/library"); await page.waitForSelector("[data-testid=library]");
  ok("empty library says so", /No references yet/.test(await page.innerText("[data-testid=learned-panel]")));
  await page.setInputFiles("[data-testid=lib-input]", { name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(13 * 1024 * 1024, 1) }); await page.waitForSelector("[data-testid=lib-error]");
  const err = await page.innerText("[data-testid=lib-error]"); ok("a 13 MB reference is rejected with a clear message", /huge\.jpg/.test(err) && /12 MB/.test(err), err);
  ok("rejected file is not stored", (await page.locator("[data-testid=ref-card]").count()) === 0);
  await page.setInputFiles("[data-testid=lib-input]", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }); await page.waitForTimeout(300);
  ok("a non-image is rejected", /not an image/.test(await page.innerText("[data-testid=lib-error]")));
  await page.setInputFiles("[data-testid=lib-input]", ["tests/fixtures/ref_warm.jpg", "tests/fixtures/horizon_clean.jpg"]); await page.waitForSelector("[data-testid=ref-card]"); await page.waitForTimeout(800);
  ok("valid references are analysed and listed", (await page.locator("[data-testid=ref-card]").count()) === 2);
  const lp = await page.innerText("[data-testid=learned-panel]"); ok("learned panel describes the references' style in words", /From references \(2\)/.test(lp) && /(tonality|colour|balance|saturat)/i.test(lp), lp.replace(/\n/g, " ").slice(0, 120));
  ok("references persist across reload", await (async () => { await page.reload(); await page.waitForSelector("[data-testid=ref-card]"); return (await page.locator("[data-testid=ref-card]").count()) === 2; })());
  // editor can use the learned style
  await page.goto(BASE + "/projects"); await page.setInputFiles("input[type=file]", "tests/fixtures/tilted.jpg"); await page.waitForSelector("text=tilted"); await page.click("a[href*='editor']"); await R(page); await page.waitForTimeout(600);
  await T(page, "reference"); await page.click("[data-testid=ref-learned]"); await page.waitForSelector("text=Learned style (mean of 2 references)"); await page.click("button:text-is('Compare with my photo')"); await page.waitForTimeout(800);
  ok("the editor can compare the photo with the learned style", /Apply to manual layer|already close/.test(await page.innerText("body")));
  await page.setInputFiles("[data-testid=ref-input]", { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(13 * 1024 * 1024, 1) }); await page.waitForSelector("[data-testid=ref-error]");
  ok("the editor's reference upload enforces the same 12 MB limit", /12 MB/.test(await page.innerText("[data-testid=ref-error]")));
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | ")); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
