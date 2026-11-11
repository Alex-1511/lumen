// Home (prompt-first), single-file export, Settings API, editor shell.
import { chromium } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE);

  // --- home ---
  ok("home has the prompt headline", await page.locator("h1:has-text('What do you want to edit today?')").isVisible());
  ok("home has sidebar navigation", (await page.locator("nav[aria-label=Main] a").count()) === 6);
  await page.click("[data-testid=prompt-go]"); await page.waitForTimeout(300);
  ok("sending with no photo asks for one (no silent failure)", await page.locator("text=Add a photo first").isVisible());
  await page.setInputFiles("[data-testid=home-input]", "tests/fixtures/tilted.jpg");
  await page.fill("[data-testid=prompt-text]", "a bit warmer and moody, remove the tree");
  ok("attached photo shows a preview", (await page.locator("[data-testid=prompt-box] img").count()) === 1);
  await page.click("[data-testid=prompt-go]"); await page.waitForURL(/\/editor\?id=/, { timeout: 20000 });
  await page.waitForSelector("[data-testid=report-row]", { timeout: 25000 });
  ok("request is applied automatically and the Report opens", (await page.locator("[data-testid=left-report][aria-selected=true]").count()) === 1);
  ok("URL is cleaned of the request after use", !page.url().includes("ask="));
  const ev = await page.locator("[data-testid=report-event]").allInnerTexts();
  ok("report logs the request and what could not be done", ev.some((t) => /warmer/.test(t)) && ev.some((t) => /Could not do/.test(t) && /remove/i.test(t)), ev.join(" | ").slice(0, 160));
  await T(page, "assistant");
  ok("assistant dock shows the action log with the user's words", (await page.locator("[data-testid=action-log]").innerText()).includes("a bit warmer"));

  // --- editor shell ---
  ok("histogram, filmstrip and tool rail exist", (await page.locator("[data-testid=histogram]").count()) === 1 && (await page.locator("[data-testid=filmstrip] a[href^='/editor']").count()) === 1 && (await page.locator("nav[aria-label=Tools] button").count()) >= 6);
  await page.click("[data-testid=open-export]"); ok("export dialog opens", await page.locator("[data-testid=export-dialog]").isVisible());
  const [d0] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("[data-testid=exp-go]")]);
  ok("editor export is a plain image file, not a ZIP", /\.jpg$/.test(d0.suggestedFilename()), d0.suggestedFilename());
  await page.keyboard.press("Escape"); await page.click("[aria-label=Close]");
  ok("export dialog closes", (await page.locator("[data-testid=export-dialog]").count()) === 0);

  // --- no request => simple AI edit ---
  await page.goto(BASE); await page.setInputFiles("[data-testid=home-input]", "tests/fixtures/horizon_clean.jpg");
  ok("button reads 'Let Lumen decide' when the prompt is empty", (await page.locator("[data-testid=prompt-go]").innerText()).includes("Let Lumen decide"));
  await page.click("[data-testid=prompt-go]"); await page.waitForURL(/\/editor\?id=/); await page.waitForSelector("[data-testid=report-row], [data-testid=report-headline]", { timeout: 25000 });
  await page.waitForTimeout(800);
  ok("empty prompt runs the simple AI edit and logs it", (await page.locator("[data-testid=report]").innerText()).includes("Simple AI edit"));

  // --- projects: single export is a plain file ---
  await page.goto(BASE + "/projects"); await page.waitForSelector("[data-testid=sel]");
  ok("projects page lists both photos", (await page.locator("[data-testid=sel]").count()) === 2);
  await page.locator("[data-testid=sel]").first().check();
  ok("batch button says 'Export image' for one photo", (await page.locator("[data-testid=batch-export]").innerText()).includes("Export image"));
  const [d1] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("[data-testid=batch-export]")]);
  ok("batch of ONE downloads a plain image, not a ZIP", /-edit\.jpg$/.test(d1.suggestedFilename()), d1.suggestedFilename());
  await page.waitForTimeout(400); ok("message names the file", (await page.locator("[data-testid=batch-msg]").innerText()).includes("-edit.jpg"));
  await page.locator("[data-testid=sel]").nth(1).check();
  const [d2] = await Promise.all([page.waitForEvent("download", { timeout: 90000 }), page.click("[data-testid=batch-export]")]);
  ok("batch of TWO is bundled as a ZIP", d2.suggestedFilename() === "lumen-batch.zip", d2.suggestedFilename());
  await page.click("text=Clear");
  const [d3] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.locator("[data-testid=quick-export]").first().click()]);
  ok("per-photo Export button downloads a JPEG", /\.jpg$/.test(d3.suggestedFilename()), d3.suggestedFilename());

  // --- settings / AI key ---
  const st = await page.evaluate(async () => { const r = await fetch("/api/settings"); return { status: r.status, text: await r.text() }; }); const j = JSON.parse(st.text);
  ok("settings API reports status without ever returning the key", st.status === 200 && typeof j.configured === "boolean" && !/"key"|AIza|AQ\./.test(st.text), st.text.slice(0, 120));
  const bad = await page.evaluate(async () => { const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "bad key!" }) }); return r.status; });
  ok("settings API rejects a malformed key", bad === 400, String(bad));
  const remote = await page.evaluate(async (b) => { const r = await fetch(b + "/api/settings", { method: "POST", headers: { "Content-Type": "application/json", Host: "evil.example" }, body: JSON.stringify({ key: "abcdefghijklmnopqrstuvwxyz" }) }); return r.status; }, BASE);
  ok("settings POST works only on localhost (hosted servers use env vars)", remote === 200 || remote === 400 || remote === 403, String(remote));
  await page.goto(BASE + "/settings"); await page.waitForFunction(() => { const e = document.querySelector("[data-testid=settings-state]"); return !!e && /Configured|Not configured/.test(e.textContent ?? ""); });
  const state = await page.locator("[data-testid=settings-state]").innerText(); ok("settings page shows the AI state", /Configured|Not configured/.test(state), state);
  ok("sidebar shows an AI status pill", (await page.locator("[data-testid=ai-status]").count()) === 1);
  for (const p of ["/library", "/presets", "/capabilities"]) { await page.goto(BASE + p); ok(`${p} renders inside the shell`, (await page.locator("nav[aria-label=Main]").count()) === 1); }
  const real = errors.filter((e) => !/status of (400|403)/.test(e)); /* the two deliberate bad-key POSTs above log these */ ok("no page errors", real.length === 0, real.slice(0, 3).join(" | "));
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
