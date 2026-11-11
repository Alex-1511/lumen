import { chromium, Page } from "playwright";
import { T, R } from "./_ui";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const BASE = process.env.BASE ?? "http://localhost:3100";
type Img = { w: number; h: number; d: number[] };
const grab = (page: Page): Promise<Img> => page.evaluate(() => { const c = document.querySelectorAll("canvas")[1] as HTMLCanvasElement; const t = document.createElement("canvas"); t.width = c.width; t.height = c.height; const x = t.getContext("2d")!; x.drawImage(c, 0, 0); return { w: t.width, h: t.height, d: Array.from(x.getImageData(0, 0, t.width, t.height).data) }; });
const px = (im: Img, x: number, y: number) => { const i = (Math.round(y) * im.w + Math.round(x)) * 4; return [im.d[i], im.d[i + 1], im.d[i + 2]]; };
const lum = (v: number[]) => (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255;
const firstX = (im: Img, y: number, ch: number, thr = 128) => { for (let x = 0; x < im.w; x++) if (px(im, x, y)[ch] > thr) return x; return -1; };
async function open(page: Page, file: string, name: string) { await page.goto(BASE + "/projects"); await page.evaluate(() => indexedDB.deleteDatabase("lumen")); await page.goto(BASE + "/projects"); await page.setInputFiles("input[type=file]", `tests/fixtures/${file}`); await page.waitForSelector(`text=${name}`); await page.click("a[href*='editor']"); await R(page); await page.waitForTimeout(700); await T(page, "edit"); }
async function slide(page: Page, label: string, to: number) { const sl = page.locator(`div.mb-2\\.5:has(span:has-text("${label}")) input[type=range]`).first(); await sl.scrollIntoViewIfNeeded(); const bb = (await sl.boundingBox())!; await page.mouse.move(bb.x + bb.width / 2, bb.y + 1); await page.mouse.down(); await page.mouse.move(bb.x + bb.width * to, bb.y + 1, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(450); }
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }); const errors: string[] = [];
  const mk = async () => { const p = await browser.newPage({ viewport: { width: 1500, height: 1000 } }); p.on("pageerror", (e) => errors.push(e.message)); p.on("console", (m) => m.type() === "error" && errors.push(m.text())); return p; };
  { const p = await mk(); await open(p, "haze.png", "haze"); const a = await grab(p); await slide(p, "Dehaze", 0.9); const b = await grab(p);
    const sd = (im: Img) => { let s = 0, s2 = 0, n = 0; for (let i = 0; i < im.d.length; i += 16) { const v = (0.2126 * im.d[i] + 0.7152 * im.d[i + 1] + 0.0722 * im.d[i + 2]) / 255; s += v; s2 += v * v; n++; } return Math.sqrt(s2 / n - (s / n) ** 2); };
    ok("dehaze increases tonal contrast on a hazy image", sd(b) > sd(a) * 1.08, `${sd(a).toFixed(3)} → ${sd(b).toFixed(3)}`); await p.close(); }
  { const p = await mk(); await open(p, "spot.png", "spot"); const a = await grab(p); const cx = a.w / 2, cy = a.h / 2, sc = a.w / 1200; const ring = [cx + 46 * sc, cy], far = [a.w * 0.05, a.h * 0.05];
    await slide(p, "Bloom", 0.9); const b = await grab(p);
    ok("bloom brightens the neighbourhood of a highlight", lum(px(b, ring[0], ring[1])) - lum(px(a, ring[0], ring[1])) > 0.02 && Math.abs(lum(px(b, far[0], far[1])) - lum(px(a, far[0], far[1]))) < 0.004, `ring +${(lum(px(b, ring[0], ring[1])) - lum(px(a, ring[0], ring[1]))).toFixed(3)}`);
    await slide(p, "Bloom", 0.5); await slide(p, "Bloom", 0); const z = await grab(p); await slide(p, "Halation", 0.9); const h = await grab(p); const rb = (im: Img) => { const v = px(im, ring[0], ring[1]); return (v[0] - v[2]) / 255; };
    ok("halation adds a red tint around a highlight", rb(h) - rb(z) > 0.02, `r−b ${rb(z).toFixed(3)} → ${rb(h).toFixed(3)}`); await p.close(); }
  { const p = await mk(); await open(p, "ca_edge.png", "ca_edge"); const a = await grab(p); const y = a.h / 2; const sa = firstX(a, y, 0) - firstX(a, y, 2);
    await slide(p, "Chromatic aberration", 0.95); const b = await grab(p); const sb = firstX(b, y, 0) - firstX(b, y, 2);
    ok("CA correction shifts red and blue channels in opposite radial directions", Math.abs(sa) <= 1 && Math.abs(sb) >= 2, `R−B edge offset ${sa}px → ${sb}px`); await p.close(); }
  { const p = await mk(); await open(p, "grid.png", "grid"); const a = await grab(p); const xa1 = firstX(a, a.h * 0.5, 1), xa2 = firstX(a, a.h * 0.15, 1);
    await slide(p, "Lens distortion", 0.95); const b = await grab(p); const xb1 = firstX(b, b.h * 0.5, 1), xb2 = firstX(b, b.h * 0.15, 1);
    ok("a straight line stays straight at zero distortion, bows when distortion is applied", Math.abs(xa1 - xa2) <= 2 && Math.abs(xb1 - xb2) >= 4, `bow ${Math.abs(xa1 - xa2)}px → ${Math.abs(xb1 - xb2)}px`); await p.close(); }
  { const barW = (im: Img, y: number) => { let x0 = -1, x1 = -1; for (let x = 0; x < im.w; x++) if (px(im, x, y)[1] > 128) { if (x0 < 0) x0 = x; x1 = x; } return x1 - x0; };
    const run = async (to: number) => { const p = await mk(); await open(p, "bars.png", "bars"); if (to) await slide(p, "Vertical perspective", to); const im = await grab(p); await p.close(); return im; };
    const rows = (im: Img) => { const r: number[] = []; for (let y = 0; y < im.h; y++) { const w = barW(im, y); if (w > 150) r.push(y); } return r; };
    const ends = (im: Img) => { const r = rows(im); return r.length ? [barW(im, r[0] + 1), barW(im, r[r.length - 1] - 1)] : [-1, -1]; };
    const a = await run(0), up = await run(0.9), dn = await run(0.1);
    const e0 = ends(a), eU = ends(up), eD = ends(dn); const d0 = e0[0] - e0[1], dU = eU[0] - eU[1], dD = eD[0] - eD[1];
    ok("vertical perspective: top/bottom width ratio changes with the slider, in opposite directions", Math.abs(d0) <= 6 && Math.abs(dU) > 20 && Math.abs(dD) > 20 && Math.sign(dU) !== Math.sign(dD), `top−bottom bar width: 0 → ${d0}, + → ${dU}, − → ${dD}; ends ${JSON.stringify([e0, eU, eD])} rows ${rows(up).length}`); }
  ok("no runtime errors in the browser console", errors.length === 0, errors.slice(0, 2).join(" | ")); await browser.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
