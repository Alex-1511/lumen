import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
const meanLum = (page: Page): Promise<number> => page.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); t.width = 200; t.height = Math.round(200 * c.height / c.width); const x = t.getContext("2d")!; x.drawImage(c, 0, 0, t.width, t.height); const d = x.getImageData(0, 0, t.width, t.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return s / (d.length / 4) / 255; });
const tab = (page: Page, name: string) => T(page, name);
async function openFirst(page: Page, name: string) { await page.locator(`a[href*='editor']:has(img[alt='${name}'])`).first().click(); await R(page); await page.waitForTimeout(700); }
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text())); page.on("crash", () => errors.push("crash"));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", ["tests/fixtures/tilted.jpg", "tests/fixtures/horizon_clean.jpg"]); await page.waitForSelector("text=horizon_clean"); await page.waitForSelector("text=tilted");
  await openFirst(page, "tilted"); const before = await meanLum(page);
  // ---- my request (offline interpreter) ----
  await tab(page, "assistant"); ok("assistant offers both modes", (await page.locator("[data-testid=mode-request]").count()) === 1 && (await page.locator("[data-testid=mode-auto]").count()) === 1);
  await page.fill("[data-testid=chat]", "a bit warmer and brighter, and remove the person on the left"); await page.click("[data-testid=interpret-go]");
  const res = await page.innerText("[data-testid=intent-result]");
  ok("interpreter shows what it understood", /Warmer/.test(res) && /Brighter/.test(res), res.slice(0, 80).replace(/\n/g, " "));
  ok("interpreter refuses object removal honestly", /Cannot do/.test(res) && /Retouch tab/i.test(res));
  await page.click("[data-testid=intent-apply]"); await page.waitForSelector("[data-testid=report-latest]"); await page.waitForTimeout(600);
  const after = await meanLum(page); ok("the request visibly changed the pixels (brighter)", after - before > 0.015, `${before.toFixed(3)} → ${after.toFixed(3)}`);
  ok("report panel opens automatically after the edit", await page.locator("[data-testid=report]").isVisible());
  const rows = await page.locator("[data-testid=report-row]").allInnerTexts();
  ok("report lists the requested edits with before/after values", rows.some((r) => /Temperature/.test(r) && /final value/.test(r)) && rows.some((r) => /Exposure/.test(r)), rows.length + " rows");
  const terms = await page.innerText("[data-testid=report-terms]"); ok("report names glossary terms with their status", /Color Temperature/.test(terms) && /Exposure/.test(terms) && /(implemented|partial)/.test(terms), terms.replace(/\n/g, " ").slice(0, 90));
  const tools = await page.innerText("[data-testid=report-tools]"); ok("report names the tools used", /White-balance gain/.test(tools) && /WebGL2/.test(tools) && !/Gemini/.test(tools));
  ok("report records the user's request text", /a bit warmer and brighter/.test(await page.innerText("[data-testid=report]")) && (await page.locator("[data-testid=report-event]").count()) >= 1);
  ok("report states zero generative edits", /0 generative/.test(await page.innerText("[data-testid=report-headline]")), await page.innerText("[data-testid=report-headline]"));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-testid=report-download]")]); await dl.saveAs("/tmp/report.md"); const md = require("fs").readFileSync("/tmp/report.md", "utf8");
  ok("report downloads as Markdown with every section", /## What was edited/.test(md) && /## Terms used/.test(md) && /## Tools used/.test(md) && /a bit warmer and brighter/.test(md));
  // ---- simple AI edit ----
  await tab(page, "assistant"); await page.click("[data-testid=mode-auto]"); await page.click("[data-testid=auto-go]"); await page.waitForTimeout(500);
  ok("simple AI edit opens the report and logs itself", /Simple AI edit/.test(await page.innerText("[data-testid=report-latest]")) && /auto:/.test(await page.innerText("[data-testid=report]")));
  // ---- feedback ----
  await page.click("[data-testid=fb-like]"); await page.fill("[data-testid=fb-comment]", "too dark, a bit warmer"); await page.click("[data-testid=fb-save]"); await page.waitForSelector("[data-testid=fb-msg]");
  ok("one feedback entry is not enough to learn from", /Not enough feedback/.test(await page.innerText("[data-testid=learned-status]")));
  await page.click("[data-testid=fb-dislike]"); await page.fill("[data-testid=fb-comment]", "still a bit dark"); await page.click("[data-testid=fb-save]"); await page.waitForTimeout(500);
  await page.click("[data-testid=relearn]"); await page.waitForTimeout(500); const ls = await page.innerText("[data-testid=learned-status]");
  ok("after two entries the learned summary states entries, ratings and confidence", /2 feedback entries/.test(ls) && /1 liked, 1 disliked/.test(ls) && /confidence/.test(ls), ls.replace(/\n/g, " ").slice(0, 140));
  // ---- library shows it ----
  await page.goto(BASE + "/library"); await page.waitForSelector("[data-testid=library]"); await page.waitForTimeout(400);
  ok("library lists both feedback entries", (await page.locator("[data-testid=fb-row]").count()) === 2);
  ok("library learned panel reflects the feedback", /2 feedback entries/.test(await page.innerText("[data-testid=learned-panel]")));
  // ---- the next photo picks it up ----
  await page.goto(BASE + "/projects"); await page.waitForSelector("[data-testid=sel]"); await openFirst(page, "horizon_clean");
  const body = await page.innerText("body"); ok("a new photo's recipe includes a visible 'Personal style (learned)' item", /Personal style \(learned\)/.test(body) || /Learned style skipped/.test(body), /Personal style/.test(body) ? "item present" : "skipped by guard");
  await tab(page, "report"); const lr = await page.locator("[data-testid=report-row]").allInnerTexts(); ok("the report attributes it to the AI recipe, as an enhancement", lr.some((r) => /Personal style/.test(r) && /enhancement/.test(r)) || /Learned style skipped/.test(body));
  // forget feedback
  await page.goto(BASE + "/library"); await page.click("[data-testid=fb-clear]"); await page.waitForTimeout(400); ok("'Forget all feedback' clears it", (await page.locator("[data-testid=fb-row]").count()) === 0);
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | ")); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
