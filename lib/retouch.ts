// Retouching on real pixels: clone stamp, healing (harmonic colour matching), spot removal (automatic source search)
// and object removal (exemplar-based inpainting, Criminisi et al. 2004). Pure functions on RGBA bytes so they run in
// the browser and in Node tests. Operations are stored as parameters on the project and replayed on the untouched original.
export type RetouchOp =
  | { id: string; type: "clone" | "heal"; sx: number; sy: number; dx: number; dy: number; r: number }
  | { id: string; type: "spot"; x: number; y: number; r: number }
  | { id: string; type: "remove"; pts: [number, number][]; r: number };
// All coordinates are normalised to the source image (0..1). r is a radius as a fraction of the long edge.
export const RETOUCH_LABEL: Record<RetouchOp["type"], string> = { clone: "Clone", heal: "Heal", spot: "Spot removal", remove: "Object removal" };

type Img = { d: Uint8ClampedArray; w: number; h: number };
const cl = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const px = (im: Img, x: number, y: number, c: number) => im.d[(cl(Math.round(y), 0, im.h - 1) * im.w + cl(Math.round(x), 0, im.w - 1)) * 4 + c];

/** Copy a soft-edged disc from (sx,sy) to (dx,dy). Coordinates in pixels. */
export function cloneStamp(im: Img, sx: number, sy: number, dx: number, dy: number, r: number, feather = 0.25) {
  const src = new Uint8ClampedArray(im.d); const R = Math.max(1, r);
  for (let y = Math.floor(dy - R); y <= Math.ceil(dy + R); y++) for (let x = Math.floor(dx - R); x <= Math.ceil(dx + R); x++) {
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) continue; const dd = Math.hypot(x - dx, y - dy); if (dd > R) continue;
    const a = dd < R * (1 - feather) ? 1 : (R - dd) / (R * feather); const k = (y * im.w + x) * 4;
    for (let c = 0; c < 3; c++) { const s = src[(cl(Math.round(y + sy - dy), 0, im.h - 1) * im.w + cl(Math.round(x + sx - dx), 0, im.w - 1)) * 4 + c]; im.d[k + c] = im.d[k + c] * (1 - a) + s * a; }
  }
}

/** Heal: copy the source texture but solve for a smooth colour correction so the patch blends into its surroundings (Poisson-style boundary matching). */
export function healPatch(im: Img, sx: number, sy: number, dx: number, dy: number, r: number) {
  const R = Math.max(2, r), x0 = Math.max(0, Math.floor(dx - R - 2)), y0 = Math.max(0, Math.floor(dy - R - 2)), x1 = Math.min(im.w - 1, Math.ceil(dx + R + 2)), y1 = Math.min(im.h - 1, Math.ceil(dy + R + 2));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, n = bw * bh; const src = new Uint8ClampedArray(im.d); const ox = sx - dx, oy = sy - dy;
  const inside = new Uint8Array(n); const sv = new Float32Array(n * 3), h = new Float32Array(n * 3);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x, gx = x0 + x, gy = y0 + y; inside[i] = Math.hypot(gx - dx, gy - dy) <= R ? 1 : 0;
    for (let c = 0; c < 3; c++) { const s = px({ d: src, w: im.w, h: im.h }, gx + ox, gy + oy, c); sv[i * 3 + c] = s; h[i * 3 + c] = src[(gy * im.w + gx) * 4 + c] - s; } }
  // initialise the interior with the mean boundary difference, then relax Laplace's equation (SOR)
  let cnt = 0; const mean = [0, 0, 0]; for (let i = 0; i < n; i++) if (!inside[i]) { const x = i % bw, y = (i / bw) | 0; const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const xx = x + a, yy = y + b; return xx >= 0 && yy >= 0 && xx < bw && yy < bh && inside[yy * bw + xx]; }); if (near) { cnt++; for (let c = 0; c < 3; c++) mean[c] += h[i * 3 + c]; } }
  if (!cnt) return; for (let i = 0; i < n; i++) if (inside[i]) for (let c = 0; c < 3; c++) h[i * 3 + c] = mean[c] / cnt;
  const iters = Math.min(600, 60 + Math.round(R * 6)), w = 1.85;
  for (let it = 0; it < iters; it++) for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x; if (!inside[i]) continue;
    for (let c = 0; c < 3; c++) { let s = 0, m = 0; if (x > 0) { s += h[(i - 1) * 3 + c]; m++; } if (x < bw - 1) { s += h[(i + 1) * 3 + c]; m++; } if (y > 0) { s += h[(i - bw) * 3 + c]; m++; } if (y < bh - 1) { s += h[(i + bw) * 3 + c]; m++; } if (m) h[i * 3 + c] += w * (s / m - h[i * 3 + c]); } }
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x; if (!inside[i]) continue; const dd = Math.hypot(x0 + x - dx, y0 + y - dy), a = dd < R * 0.8 ? 1 : (R - dd) / (R * 0.2); const k = ((y0 + y) * im.w + x0 + x) * 4;
    for (let c = 0; c < 3; c++) im.d[k + c] = cl(sv[i * 3 + c] + h[i * 3 + c], 0, 255) * a + im.d[k + c] * (1 - a); }
}

/** Spot removal: search nearby for the source patch whose surroundings best match the blemish's surroundings, then heal from it. */
export function spotHeal(im: Img, x: number, y: number, r: number) {
  let best = Infinity, bx = x + r * 2.5, by = y;
  const ring: [number, number][] = []; for (let a = 0; a < 16; a++) for (const k of [1.25, 1.5]) ring.push([Math.cos((a / 16) * 6.2832) * r * k, Math.sin((a / 16) * 6.2832) * r * k]);
  for (let rad = 2; rad <= 6; rad += 0.5) for (let a = 0; a < 24; a++) { const t = (a / 24) * 6.2832, cx = x + Math.cos(t) * r * rad, cy = y + Math.sin(t) * r * rad;
    if (cx < r || cy < r || cx >= im.w - r || cy >= im.h - r) continue; let s = 0;
    for (const [ox, oy] of ring) for (let c = 0; c < 3; c++) { const d = px(im, x + ox, y + oy, c) - px(im, cx + ox, cy + oy, c); s += d * d; }
    // prefer smooth, blemish-free sources: penalise high local variance in the candidate centre
    let v = 0, m = 0; for (let c = 0; c < 3; c++) { let mu = 0; for (const [ox, oy] of ring.slice(0, 8)) mu += px(im, cx + ox * 0.3, cy + oy * 0.3, c); mu /= 8; m += mu; } void m;
    for (const [ox, oy] of ring.slice(0, 8)) for (let c = 0; c < 3; c++) { const d = px(im, cx + ox * 0.3, cy + oy * 0.3, c) - px(im, x + ox, y + oy, c); v += d * d * 0.25; }
    s += v; if (s < best) { best = s; bx = cx; by = cy; } }
  healPatch(im, bx, by, x, y, r);
}

/** Rasterise brush points (radius r, pixels) into a mask. */
export function maskFromPts(w: number, h: number, pts: [number, number][], r: number): Uint8Array {
  const m = new Uint8Array(w * h); const add = (cx: number, cy: number) => { for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 1; };
  for (let i = 0; i < pts.length; i++) { add(pts[i][0], pts[i][1]); if (i) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const L = Math.hypot(bx - ax, by - ay), st = Math.max(1, Math.ceil(L / Math.max(1, r * 0.4))); for (let s = 1; s < st; s++) add(ax + ((bx - ax) * s) / st, ay + ((by - ay) * s) / st); } }
  return m;
}

/** Object removal by exemplar-based inpainting (fills the masked area by copying the best-matching real patches from the rest of the photo). */
export function inpaint(im: Img, mask: Uint8Array, opts: { patch?: number; maxSide?: number } = {}): { filled: number } {
  const P = opts.patch ?? 4; let minX = im.w, minY = im.h, maxX = -1, maxY = -1, total = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (mask[y * im.w + x]) { total++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (!total) return { filled: 0 };
  const margin = Math.max(40, (maxX - minX + maxY - minY) / 2 | 0), X0 = Math.max(0, minX - margin), Y0 = Math.max(0, minY - margin), X1 = Math.min(im.w - 1, maxX + margin), Y1 = Math.min(im.h - 1, maxY + margin);
  const cw = X1 - X0 + 1, ch = Y1 - Y0 + 1, cap = opts.maxSide ?? 200, k = Math.min(1, cap / Math.max(cw, ch)); const w = Math.max(8, Math.round(cw * k)), h = Math.max(8, Math.round(ch * k));
  // working copy (area-averaged when reduced)
  const col = new Float32Array(w * h * 3), known = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx0 = X0 + Math.floor(x / k), sy0 = Y0 + Math.floor(y / k), sx1 = Math.min(X1, X0 + Math.floor((x + 1) / k) - (k < 1 ? 0 : 0)), sy1 = Math.min(Y1, Y0 + Math.floor((y + 1) / k)); let n = 0, mk = 0; const acc = [0, 0, 0];
    for (let yy = sy0; yy <= Math.max(sy0, sy1 - (k < 1 ? 1 : 0)); yy++) for (let xx = sx0; xx <= Math.max(sx0, sx1 - (k < 1 ? 1 : 0)); xx++) { const i = yy * im.w + xx; n++; if (mask[i]) mk++; else for (let c = 0; c < 3; c++) acc[c] += im.d[i * 4 + c]; }
    const kn = n - mk; known[y * w + x] = mk === 0 ? 1 : 0; for (let c = 0; c < 3; c++) col[(y * w + x) * 3 + c] = kn ? acc[c] / kn : 0; }
  const origKnown = known.slice(); const conf = new Float32Array(w * h); for (let i = 0; i < w * h; i++) conf[i] = known[i];
  const gray = (i: number) => col[i * 3] * 0.3 + col[i * 3 + 1] * 0.59 + col[i * 3 + 2] * 0.11;
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  // candidate source centres: patches fully known in the original working copy
  const cands: number[] = []; const stride = 2;
  for (let y = P; y < h - P; y += stride) for (let x = P; x < w - P; x += stride) { let ok = true; for (let yy = -P; yy <= P && ok; yy++) for (let xx = -P; xx <= P; xx++) if (!origKnown[(y + yy) * w + x + xx]) { ok = false; break; } if (ok) cands.push(y * w + x); }
  if (!cands.length) return { filled: 0 };
  let remaining = 0; for (let i = 0; i < w * h; i++) if (!known[i]) remaining++;
  let guard = remaining + 50;
  while (remaining > 0 && guard-- > 0) {
    // fill front = unknown pixels with a known 4-neighbour
    let bestP = -1, bi = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (known[i]) continue; if (!((inb(x - 1, y) && known[i - 1]) || (inb(x + 1, y) && known[i + 1]) || (inb(x, y - 1) && known[i - w]) || (inb(x, y + 1) && known[i + w]))) continue;
      let cs = 0, n = 0; for (let yy = -P; yy <= P; yy++) for (let xx = -P; xx <= P; xx++) if (inb(x + xx, y + yy)) { cs += conf[(y + yy) * w + x + xx]; n++; } const C = cs / n;
      // normal to the front from the known-mask gradient; isophote from image gradient on known pixels
      const nx = (inb(x + 1, y) && known[i + 1] ? 1 : 0) - (inb(x - 1, y) && known[i - 1] ? 1 : 0), ny = (inb(x, y + 1) && known[i + w] ? 1 : 0) - (inb(x, y - 1) && known[i - w] ? 1 : 0);
      let gx = 0, gy = 0; if (inb(x + 1, y) && inb(x - 1, y) && known[i + 1] && known[i - 1]) gx = gray(i + 1) - gray(i - 1); if (inb(x, y + 1) && inb(x, y - 1) && known[i + w] && known[i - w]) gy = gray(i + w) - gray(i - w);
      const nl = Math.hypot(nx, ny) || 1, D = (Math.abs(-gy * nx + gx * ny) / nl) / 255 + 0.001; const Pr = C * D; if (Pr > bestP) { bestP = Pr; bi = i; } }
    if (bi < 0) break; const cx = bi % w, cy = (bi / w) | 0;
    // find the best fully-known patch (SSD over the target patch's known pixels)
    let bestS = Infinity, bc = cands[0];
    for (const c of cands) { const sx = c % w, sy = (c / w) | 0; let s = 0; for (let yy = -P; yy <= P && s < bestS; yy++) for (let xx = -P; xx <= P; xx++) { const tx = cx + xx, ty = cy + yy; if (!inb(tx, ty)) continue; const ti = ty * w + tx; if (!known[ti]) continue; const si = (sy + yy) * w + sx + xx; for (let q = 0; q < 3; q++) { const d = col[ti * 3 + q] - col[si * 3 + q]; s += d * d; } } if (s < bestS) { bestS = s; bc = c; } }
    const sx = bc % w, sy = (bc / w) | 0; let cs = 0, cn = 0; for (let yy = -P; yy <= P; yy++) for (let xx = -P; xx <= P; xx++) if (inb(cx + xx, cy + yy)) { cs += conf[(cy + yy) * w + cx + xx]; cn++; } const Cp = cs / cn;
    for (let yy = -P; yy <= P; yy++) for (let xx = -P; xx <= P; xx++) { const tx = cx + xx, ty = cy + yy; if (!inb(tx, ty)) continue; const ti = ty * w + tx; if (known[ti]) continue; const si = (sy + yy) * w + sx + xx; for (let q = 0; q < 3; q++) col[ti * 3 + q] = col[si * 3 + q]; known[ti] = 1; conf[ti] = Cp; remaining--; }
  }
  // write back: only masked pixels change. When reduced, upsample the filled colours bilinearly and feather the mask edge.
  let filled = 0; const sm = new Float32Array(im.w * im.h); // feather alpha: distance-to-unmasked, 3px ramp
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const i = y * im.w + x; if (!mask[i]) continue; let dmin = 4; for (let r = 1; r < 4 && dmin === 4; r++) for (const [a, b] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= im.w || yy >= im.h || !mask[yy * im.w + xx]) { dmin = r; break; } } sm[i] = Math.min(1, dmin / 3 + 0.34); }
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const i = y * im.w + x; if (!mask[i]) continue; const fx = (x - X0 + 0.5) * k - 0.5, fy = (y - Y0 + 0.5) * k - 0.5, x0 = cl(Math.floor(fx), 0, w - 1), y0 = cl(Math.floor(fy), 0, h - 1), x1 = cl(x0 + 1, 0, w - 1), y1 = cl(y0 + 1, 0, h - 1), tx = cl(fx - x0, 0, 1), ty = cl(fy - y0, 0, 1);
    for (let c = 0; c < 3; c++) { const v = (col[(y0 * w + x0) * 3 + c] * (1 - tx) + col[(y0 * w + x1) * 3 + c] * tx) * (1 - ty) + (col[(y1 * w + x0) * 3 + c] * (1 - tx) + col[(y1 * w + x1) * 3 + c] * tx) * ty; im.d[i * 4 + c] = v; } filled++; }
  void sm; return { filled };
}

/** Replay all operations, in order, onto a copy of the original pixels. */
export function applyRetouch(im: Img, ops: RetouchOp[]) {
  const L = Math.max(im.w, im.h);
  for (const o of ops) {
    if (o.type === "clone") cloneStamp(im, o.sx * im.w, o.sy * im.h, o.dx * im.w, o.dy * im.h, o.r * L);
    else if (o.type === "heal") healPatch(im, o.sx * im.w, o.sy * im.h, o.dx * im.w, o.dy * im.h, o.r * L);
    else if (o.type === "spot") spotHeal(im, o.x * im.w, o.y * im.h, Math.max(3, o.r * L));
    else if (o.type === "remove") inpaint(im, maskFromPts(im.w, im.h, o.pts.map(([x, y]) => [x * im.w, y * im.h] as [number, number]), Math.max(2, o.r * L)));
  }
}
/** Draw a bitmap, apply the ops, return a canvas (full resolution). */
export function retouchedCanvas(b: ImageBitmap | HTMLCanvasElement, ops: RetouchOp[]): HTMLCanvasElement {
  const c = document.createElement("canvas"); c.width = b.width; c.height = b.height; const g = c.getContext("2d", { willReadFrequently: true })!; g.drawImage(b, 0, 0);
  if (ops.length) { const id = g.getImageData(0, 0, c.width, c.height); applyRetouch({ d: id.data, w: id.width, h: id.height }, ops); g.putImageData(id, 0, 0); } return c;
}
