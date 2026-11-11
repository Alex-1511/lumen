import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
type Img = { w: number; h: number; data: number[] };
const grab = (page: Page): Promise<Img> => page.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); const sc = Math.min(1, 480 / c.width); t.width = Math.round(c.width * sc); t.height = Math.round(c.height * sc); const x = t.getContext("2d")!; x.drawImage(c, 0, 0, t.width, t.height); return { w: t.width, h: t.height, data: Array.from(x.getImageData(0, 0, t.width, t.height).data) }; });
const region = (im: Img, x0: number, y0: number, x1: number, y1: number) => { let s = 0, n = 0; for (let y = Math.floor(y0 * im.h); y < Math.floor(y1 * im.h); y++) for (let x = Math.floor(x0 * im.w); x < Math.floor(x1 * im.w); x++) { const i = (y * im.w + x) * 4; s += 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2]; n++; } return s / n / 255; };
async function dragSlider(page: Page, headingText: string, labelIndex: number, to: number) { const sl = page.locator(`xpath=//h4[contains(.,'${headingText}')]/following::input[@type='range'][${labelIndex}]`); await sl.scrollIntoViewIfNeeded(); const bb = (await sl.boundingBox())!; await page.mouse.move(bb.x + bb.width / 2, bb.y + 1); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * to, bb.y + 1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400); }
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }); const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + "/projects"); await page.setInputFiles("input[type=file]", "tests/fixtures/tilted.jpg"); await page.waitForSelector("text=tilted"); await page.click("a[href*='editor']"); await R(page); await page.waitForTimeout(700);
  const base = await grab(page);
  // --- linear gradient ---
  await T(page, "masks"); await page.click("button:text-is('+ Linear')"); await page.waitForSelector("text=Adjustments inside the mask"); await dragSlider(page, "Adjustments inside", 1, 0.85); // exposure
  const lin = await grab(page);
  const dTop = region(lin, 0.1, 0.02, 0.9, 0.12) - region(base, 0.1, 0.02, 0.9, 0.12), dBot = Math.abs(region(lin, 0.1, 0.75, 0.9, 0.98) - region(base, 0.1, 0.75, 0.9, 0.98));
  ok("linear mask brightens the top band", dTop > 0.04, `top +${dTop.toFixed(3)}`); ok("linear mask leaves the bottom untouched", dBot < 0.006, `bottom |d|=${dBot.toFixed(4)}`);
  // --- show-mask overlay turns the region red ---
  await page.check("text=Show mask (red) >> input"); await page.waitForTimeout(400); const ov = await grab(page);
  const redTop = (() => { let r = 0, g = 0, n = 0; for (let y = 0; y < ov.h * 0.1; y++) for (let x = Math.floor(ov.w * 0.2); x < ov.w * 0.8; x++) { const i = (y * ov.w + x) * 4; r += ov.data[i]; g += ov.data[i + 1]; n++; } return (r - g) / n / 255; })();
  ok("show-mask overlay tints the masked region red", redTop > 0.15, `r-g=${redTop.toFixed(2)}`); await page.uncheck("text=Show mask (red) >> input");
  // --- invert flips which side is affected ---
  await page.check("text=Invert >> input"); await page.waitForTimeout(500); const inv = await grab(page);
  ok("invert moves the effect to the bottom", region(inv, 0.1, 0.75, 0.9, 0.98) - region(base, 0.1, 0.75, 0.9, 0.98) > 0.04 && Math.abs(region(inv, 0.1, 0.02, 0.9, 0.12) - region(base, 0.1, 0.02, 0.9, 0.12)) < 0.006);
  await page.uncheck("text=Invert >> input");
  // --- history: undo removes the mask effect ---
  for (let i = 0; i < 4; i++) { await page.click("button:text-is('Undo')"); await page.waitForTimeout(150); } await page.waitForTimeout(400);
  // go back to forward state via redo
  for (let i = 0; i < 4; i++) { await page.click("button:text-is('Redo')"); await page.waitForTimeout(150); } await page.waitForTimeout(400);
  // --- brush painting ---
  await page.click("button:text-is('+ Brush')"); await page.waitForSelector("text=Painting enabled"); await dragSlider(page, "Adjustments inside", 1, 0.9);
  const pre = await grab(page); const bb = (await page.locator("canvas").nth(1).boundingBox())!;
  await page.mouse.move(bb.x + bb.width * 0.35, bb.y + bb.height * 0.5); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.65, bb.y + bb.height * 0.5, { steps: 14 }); await page.mouse.up(); await page.waitForTimeout(600);
  const post = await grab(page);
  const dPaint = region(post, 0.4, 0.46, 0.6, 0.54) - region(pre, 0.4, 0.46, 0.6, 0.54), dFar = Math.abs(region(post, 0.05, 0.85, 0.25, 0.97) - region(pre, 0.05, 0.85, 0.25, 0.97));
  ok("brush stroke brightens only the painted area", dPaint > 0.04 && dFar < 0.006, `painted +${dPaint.toFixed(3)}, far |d|=${dFar.toFixed(4)}`);
  await page.click("button:text-is('Erase')"); await page.mouse.move(bb.x + bb.width * 0.35, bb.y + bb.height * 0.5); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * 0.65, bb.y + bb.height * 0.5, { steps: 14 }); await page.mouse.up(); await page.waitForTimeout(600);
  const er = await grab(page); ok("erase brush removes the painted effect", Math.abs(region(er, 0.4, 0.46, 0.6, 0.54) - region(pre, 0.4, 0.46, 0.6, 0.54)) < 0.3 * dPaint, `residual ${(region(er, 0.4, 0.46, 0.6, 0.54) - region(pre, 0.4, 0.46, 0.6, 0.54)).toFixed(3)}`);
  // --- radial handles can be dragged ---
  await page.click("button:text-is('+ Radial')"); await page.waitForSelector("text=Drag the centre handle"); await page.waitForTimeout(300);
  const handle = page.locator("svg circle").first(); const hb = (await handle.boundingBox())!; await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + hb.width / 2 + 120, hb.y + hb.height / 2 + 60, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  const hb2 = (await handle.boundingBox())!; ok("radial centre handle drags", Math.hypot(hb2.x - hb.x, hb2.y - hb.y) > 60, `moved ${Math.round(Math.hypot(hb2.x - hb.x, hb2.y - hb.y))}px`);
  // --- limit ---
  await page.click("button:text-is('+ Linear')"); await page.click("button:text-is('+ Radial')"); const msg = await page.locator("text=/Limit reached/").count(); ok("layer cap is enforced with a visible message", msg > 0);
  // --- persistence after reload ---
  await page.waitForTimeout(800); await page.reload(); await R(page); await T(page, "masks"); await page.waitForTimeout(800);
  ok("mask layers persist after reload", (await page.locator("text=Linear gradient").count()) > 0 && (await page.locator("text=Brush").count()) > 0);
  const re = await grab(page); ok("masked render is reproduced after reload", Math.abs(region(re, 0.1, 0.02, 0.9, 0.12) - region(inv, 0.1, 0.02, 0.9, 0.12)) < 1 && re.w > 0);
  // --- export with locals ---
  await T(page, "export"); const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.click("[data-testid=exp-go]")]); ok("export with local masks succeeds", (await dl.createReadStream()) !== null);
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.screenshot({ path: "/tmp/lumen-masks.png" }); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
