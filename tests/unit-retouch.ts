// Retouch engine against ground truth: every result is compared with a known clean image.
import { applyRetouch, cloneStamp, healPatch, inpaint, maskFromPts, spotHeal } from "../lib/retouch";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const W = 240, H = 160;
const mk = (f: (x: number, y: number, c: number) => number) => { const d = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 4; c++) d[(y * W + x) * 4 + c] = c === 3 ? 255 : f(x, y, c); return d; };
const mae = (a: Uint8ClampedArray, b: Uint8ClampedArray, cx: number, cy: number, r: number) => { let s = 0, n = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r) for (let c = 0; c < 3; c++) { s += Math.abs(a[(y * W + x) * 4 + c] - b[(y * W + x) * 4 + c]); n++; } return s / n; };
const rnd = (() => { let s = 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
const noise = new Float32Array(W * H).map(() => rnd() * 8 - 4);

// 1. clone copies the source pixels exactly in the stamp centre
{ const d = mk((x, y, c) => (x < 120 ? 200 : 40) + c * 10); const img = { d, w: W, h: H }; const ref = new Uint8ClampedArray(d);
  cloneStamp(img, 60, 80, 180, 80, 20); ok("clone: stamp centre equals the source colour", d[(80 * W + 180) * 4] === ref[(80 * W + 60) * 4], `${d[(80 * W + 180) * 4]} vs ${ref[(80 * W + 60) * 4]}`);
  ok("clone: pixels outside the stamp are untouched", d[(10 * W + 10) * 4] === ref[(10 * W + 10) * 4] && d[(80 * W + 230) * 4] === ref[(80 * W + 230) * 4]); }

// 2. heal removes a dark blemish on a smooth gradient and matches colour where a plain clone cannot
{ const clean = mk((x, y, c) => 60 + x * 0.6 + y * 0.4 + c * 6 + noise[y * W + x]); const dirty = new Uint8ClampedArray(clean); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 150, y - 80) < 9) for (let c = 0; c < 3; c++) dirty[(y * W + x) * 4 + c] = 20;
  const a = new Uint8ClampedArray(dirty), b = new Uint8ClampedArray(dirty); healPatch({ d: a, w: W, h: H }, 70, 80, 150, 80, 12); cloneStamp({ d: b, w: W, h: H }, 70, 80, 150, 80, 12);
  const eh = mae(a, clean, 150, 80, 9), ec = mae(b, clean, 150, 80, 9), e0 = mae(dirty, clean, 150, 80, 9);
  ok("heal: blemish area error vs the clean photo is small", eh < 6, `blemish ${e0.toFixed(1)} -> healed ${eh.toFixed(1)}`);
  ok("heal beats a plain clone from the same source (colour matching works)", eh < ec * 0.5, `heal ${eh.toFixed(1)} vs clone ${ec.toFixed(1)}`); }

// 3. spot removal finds its own source
{ const clean = mk((x, y, c) => 90 + Math.sin(x / 9) * 20 + y * 0.3 + c * 5 + noise[y * W + x]); const dirty = new Uint8ClampedArray(clean); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 120, y - 70) < 5) for (let c = 0; c < 3; c++) dirty[(y * W + x) * 4 + c] = 235;
  const a = new Uint8ClampedArray(dirty); const e0 = mae(dirty, clean, 120, 70, 5); spotHeal({ d: a, w: W, h: H }, 120, 70, 8); const e1 = mae(a, clean, 120, 70, 5);
  ok("spot: a bright dust spot is removed automatically", e1 < e0 * 0.25 && e1 < 14, `${e0.toFixed(1)} -> ${e1.toFixed(1)}`); }

// 4. object removal continues structure (stripes) across a masked block
{ const clean = mk((x, y, c) => (Math.floor(x / 8) % 2 ? 210 : 50) + c * 3); const dirty = new Uint8ClampedArray(clean); const mask = new Uint8Array(W * H); for (let y = 55; y < 95; y++) for (let x = 100; x < 140; x++) { mask[y * W + x] = 1; for (let c = 0; c < 3; c++) dirty[(y * W + x) * 4 + c] = 120; }
  const a = new Uint8ClampedArray(dirty); const t0 = Date.now(); const r = inpaint({ d: a, w: W, h: H }, mask); const ms = Date.now() - t0;
  const e0 = mae(dirty, clean, 120, 75, 18), e1 = mae(a, clean, 120, 75, 18);
  ok("remove: masked block is filled", r.filled === 1600, String(r.filled)); ok("remove: stripes continue through the hole (error far below grey fill)", e1 < e0 * 0.45, `grey fill ${e0.toFixed(1)} -> inpainted ${e1.toFixed(1)} in ${ms} ms`);
  let leak = 0; for (let i = 0; i < W * H; i++) if (!mask[i] && a[i * 4] !== dirty[i * 4]) leak++; ok("remove: pixels outside the mask are untouched", leak === 0, String(leak)); }

// 5. replay is deterministic and normalised ops land on the right pixels
{ const base = mk((x, y, c) => 100 + x * 0.3 + c * 4 + noise[y * W + x]); const ops: any[] = [{ id: "a", type: "heal", sx: 0.3, sy: 0.5, dx: 0.6, dy: 0.5, r: 0.04 }, { id: "b", type: "spot", x: 0.4, y: 0.3, r: 0.02 }];
  const p = new Uint8ClampedArray(base), q = new Uint8ClampedArray(base); applyRetouch({ d: p, w: W, h: H }, ops); applyRetouch({ d: q, w: W, h: H }, ops);
  ok("replaying the same ops gives identical pixels", Buffer.compare(Buffer.from(p.buffer), Buffer.from(q.buffer)) === 0); ok("ops change pixels near their position", mae(p, base, Math.round(0.6 * W), Math.round(0.5 * H), 8) > 0.1);
  const m = maskFromPts(W, H, [[10, 10], [60, 10]], 3); let n = 0; for (const v of m) n += v; ok("brush mask covers a stroke (line, not just dots)", n > 6 * 50 * 0.9, String(n)); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
