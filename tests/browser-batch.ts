import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
import { readFileSync } from "fs";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
function readZip(buf: Buffer) { const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])); const n = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16); const out: { name: string; data: Buffer }[] = []; for (let i = 0; i < n; i++) { const nl = buf.readUInt16LE(off + 28), lo = buf.readUInt32LE(off + 42), size = buf.readUInt32LE(off + 24); const name = buf.subarray(off + 46, off + 46 + nl).toString(); const lnl = buf.readUInt16LE(lo + 26), lex = buf.readUInt16LE(lo + 28); out.push({ name, data: buf.subarray(lo + 30 + lnl + lex, lo + 30 + lnl + lex + size) }); off += 46 + nl; } return out; }
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true } as any); const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text())); page.on("crash", () => errors.push("crash"));
  await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects");
  await page.setInputFiles("input[type=file]", ["tests/fixtures/tilted.jpg", "tests/fixtures/horizon_clean.jpg"]); await page.waitForSelector("text=horizon_clean"); await page.waitForSelector("text=tilted");
  // make a manual edit in the first project and save it as a preset
  await page.locator("a[href*='editor']").first().click(); await R(page); await page.waitForTimeout(600); await T(page, "edit");
  const sl = page.locator(`div.mb-2\\.5:has(span:text-is("Exposure")) input[type=range]`).first(); await sl.scrollIntoViewIfNeeded(); const bb = (await sl.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 1); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.7, bb.y + 1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400);
  await T(page, "reference"); await page.fill("[data-testid=preset-name]", "Bright test"); await page.click("[data-testid=preset-save]"); await page.waitForSelector("[data-testid=preset-row]");
  ok("preset is saved and listed", (await page.locator("[data-testid=preset-row]").count()) === 1);
  await page.goto(BASE + "/projects"); await page.waitForSelector("[data-testid=sel]");
  ok("dashboard shows a checkbox per project", (await page.locator("[data-testid=sel]").count()) === 2);
  await page.locator("[data-testid=sel]").nth(0).check(); await page.locator("[data-testid=sel]").nth(1).check();
  ok("batch bar appears with the selection count", /2 selected/.test(await page.innerText("[data-testid=batch-bar]")));
  await page.selectOption("[data-testid=batch-preset]", { label: "Bright test" }); await page.click("[data-testid=batch-apply]"); await page.waitForFunction(() => /Applied/.test(document.querySelector("[data-testid=batch-msg]")?.textContent ?? ""), null, { timeout: 20000 });
  ok("batch apply reports success for both photos", /to 2 photos/.test(await page.innerText("[data-testid=batch-msg]")));
  // the other project's history must now contain the preset entry
  const hist = await page.evaluate(async () => { const req = indexedDB.open("lumen"); const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result))); const all: any[] = await new Promise((r) => { const q = db.transaction("projects").objectStore("projects").getAll(); q.onsuccess = () => r(q.result); }); return all.map((p) => ({ name: p.name, last: p.history[p.history.length - 1].label, exp: p.manual.exposure })); });
  ok("both projects got a 'Preset: Bright test' history entry and the exposure value", hist.length === 2 && hist.every((h) => h.last === "Preset: Bright test" && typeof h.exp === "number" && h.exp > 0), JSON.stringify(hist));
  // batch export as a zip
  await page.fill("[data-testid=batch-edge]", "500"); await page.fill("[data-testid=batch-wm]", "© batch");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click("[data-testid=batch-export]")]); await dl.saveAs("/tmp/batch.zip");
  const files = readZip(readFileSync("/tmp/batch.zip"));
  ok("zip contains one edited JPEG per selected photo", files.length === 2 && files.every((f) => f.name.endsWith("-edit.jpg") && f.data[0] === 0xff && f.data[1] === 0xd8), files.map((f) => f.name).join(", "));
  await page.waitForFunction(() => /Exported 2 of 2/.test(document.querySelector("[data-testid=batch-msg]")?.textContent ?? ""), null, { timeout: 20000 });
  ok("batch export reports 2 of 2", true);
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | ")); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
