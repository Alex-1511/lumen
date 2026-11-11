// Real pixel measurements. Pure TS on RGBA data so it runs in the browser and in Node tests.
// These are heuristics on an 8-bit downsample; they are not a substitute for RAW-level analysis.

export interface Analysis {
  width: number; height: number;
  meanLuma: number; p1: number; p5: number; p50: number; p95: number; p99: number;
  clipHighPct: number; clipLowPct: number; dynamicRange: number; // p99-p1 spread, 0..1
  histogram: number[]; // 256 luma bins, normalised to max=1
  histR: number[]; histG: number[]; histB: number[];
  castR: number; castB: number; tintG: number;    // neutral-region channel bias; 0 = neutral
  neutralShare: number;                           // fraction of pixels used for WB estimate
  meanSat: number; colorfulness: number;
  sharpness: number; sharpnessCentre: number; sharpnessEdge: number;
  noiseLuma: number; noiseChroma: number;         // estimated sigma in 0..1 luma units
  subject: { x: number; y: number; w: number; h: number; cx: number; cy: number; confidence: number };
  skyShare: number; skyBlue: number; skyLuma: number; subjectLuma: number; bgLuma: number;
  lightLR: number; lightTB: number;               // + means brighter right / top
  backlit: boolean; isMonochrome: boolean; lowKey: boolean; highKey: boolean;
  horizonTiltDeg: number; horizonConfidence: number;
  meanRGB: [number, number, number]; bandWeight: number[]; bandSat: number[]; edgeCentreRatio: number; // style descriptors
  thirds: { nearestPowerPoint: number }; // distance of subject centre to closest thirds intersection (0..~0.7)
}

const lumaOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function downsample(src: Uint8ClampedArray, w: number, h: number, maxEdge: number) {
  const sc = Math.min(1, maxEdge / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * sc)), nh = Math.max(1, Math.round(h * sc));
  if (sc === 1) return { data: src, w, h };
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = Math.floor(x / sc), x1 = Math.min(w, Math.max(x0 + 1, Math.floor((x + 1) / sc)));
    const y0 = Math.floor(y / sc), y1 = Math.min(h, Math.max(y0 + 1, Math.floor((y + 1) / sc)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * w + xx) * 4; r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
    const o = (y * nw + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return { data: out, w: nw, h: nh };
}

// 3x3 Sobel gradient (less sensitive to pixel staircase than a 2-pixel central difference)
function sobel(Y: Float32Array, w: number, x: number, y: number): [number, number] {
  const i = y * w + x;
  const gx = (Y[i - w + 1] + 2 * Y[i + 1] + Y[i + w + 1]) - (Y[i - w - 1] + 2 * Y[i - 1] + Y[i + w - 1]);
  const gy = (Y[i + w - 1] + 2 * Y[i + w] + Y[i + w + 1]) - (Y[i - w - 1] + 2 * Y[i - w] + Y[i - w + 1]);
  return [gx, gy];
}
function pct(hist: number[], total: number, p: number) { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= total * p) return i / 255; } return 1; }

export function analyse(rgba: Uint8ClampedArray, w0: number, h0: number): Analysis {
  const { data, w, h } = downsample(rgba, w0, h0, 512);
  const N = w * h;
  const Y = new Float32Array(N), Cb = new Float32Array(N), Cr = new Float32Array(N);
  const hist = Array(256).fill(0), hR = Array(256).fill(0), hG = Array(256).fill(0), hB = Array(256).fill(0);
  let sumY = 0, sumSat = 0, clipH = 0, clipL = 0;
  let nr = 0, ng = 0, nb = 0, nn = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0;
  let skyN = 0, skyBlueSum = 0, skyLumaSum = 0, sumR = 0, sumG = 0, sumB = 0;
  const bandW = Array(8).fill(0), bandS = Array(8).fill(0); const CENTERS = [0, 30, 60, 120, 180, 240, 270, 300];
  for (let i = 0; i < N; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    sumR += r; sumG += g; sumB += b;
    const y = lumaOf(r, g, b); Y[i] = y; Cb[i] = b - y; Cr[i] = r - y; sumY += y;
    hist[Math.round(y * 255)]++; hR[data[i * 4]]++; hG[data[i * 4 + 1]]++; hB[data[i * 4 + 2]]++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const sat = mx > 0 ? (mx - mn) / mx : 0; sumSat += sat;
    if (sat > 0.12 && mx > 0.08) { const dl = mx - mn; let hh = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4; hh = ((hh * 60) + 360) % 360; let bi2 = 0, bd = 999; for (let k = 0; k < 8; k++) { const dd = Math.abs(((hh - CENTERS[k] + 540) % 360) - 180); if (dd < bd) { bd = dd; bi2 = k; } } bandW[bi2]++; bandS[bi2] += sat; }
    if (mx >= 0.99) clipH++; if (mx <= 0.012) clipL++;
    const a = r - g, c = (r + g) / 2 - b; rg += a; yb += c; rg2 += a * a; yb2 += c * c;
    if (y > 0.15 && y < 0.85 && sat < 0.28) { nr += r; ng += g; nb += b; nn++; }
    const py = Math.floor(i / w) / h;
    if (py < 0.45 && b > r * 1.05 && b > 0.35 && sat > 0.08 && y > 0.3) { skyN++; skyBlueSum += b - r; skyLumaSum += y; }
  }
  const meanY = sumY / N;
  const p = (q: number) => pct(hist, N, q);
  const mono = Math.sqrt(Math.max(0, rg2 / N - (rg / N) ** 2)) < 0.006 && Math.sqrt(Math.max(0, yb2 / N - (yb / N) ** 2)) < 0.006 && Math.abs(rg / N) < 0.02 && Math.abs(yb / N) < 0.02;
  // white balance bias from near-neutral midtone pixels (gray-world on a restricted set); weak when few neutrals
  let castR = 0, castB = 0, tintG = 0;
  if (nn > N * 0.03) { const m = (nr + ng + nb) / (3 * nn); castR = nr / nn / m - 1; castB = nb / nn / m - 1; tintG = ng / nn / m - 1; }
  // Laplacian-based sharpness and noise
  const lapAt = (x: number, y: number) => 4 * Y[y * w + x] - Y[y * w + x - 1] - Y[y * w + x + 1] - Y[(y - 1) * w + x] - Y[(y + 1) * w + x];
  let lapSum = 0, lapSq = 0, lc = 0, cSum = 0, cn = 0, eSum = 0, en = 0;
  const flatLaps: number[] = [], flatChroma: number[] = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const l = lapAt(x, y); lapSum += l; lapSq += l * l; lc++;
    const inC = x > w * 0.25 && x < w * 0.75 && y > h * 0.25 && y < h * 0.75;
    if (inC) { cSum += l * l; cn++; } else { eSum += l * l; en++; }
    const gx = Math.abs(Y[y * w + x + 1] - Y[y * w + x - 1]), gy = Math.abs(Y[(y + 1) * w + x] - Y[(y - 1) * w + x]);
    if (gx + gy < 0.02) { flatLaps.push(l); const i = y * w + x; flatChroma.push((4 * Cb[i] - Cb[i - 1] - Cb[i + 1] - Cb[i - w] - Cb[i + w] + 4 * Cr[i] - Cr[i - 1] - Cr[i + 1] - Cr[i - w] - Cr[i + w]) / 2); }
  }
  const sharp = Math.sqrt(lapSq / lc - (lapSum / lc) ** 2);
  const mad = (arr: number[]) => { if (arr.length < 50) return 0; const s = arr.map(Math.abs).sort((a, b) => a - b); return s[Math.floor(s.length / 2)] / 0.6745 / Math.sqrt(20); };
  // Subject: centre-weighted saliency from local contrast + saturation + luma distance from global mean
  const gw = 16, gh = 16; const sal = new Float32Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let s = 0, n = 0;
    for (let y = Math.floor(gy * h / gh); y < Math.floor((gy + 1) * h / gh); y++) for (let x = Math.floor(gx * w / gw); x < Math.floor((gx + 1) * w / gw); x++) {
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      s += Math.abs(lapAt(x, y)) * 2 + Math.abs(Y[y * w + x] - meanY) * 0.5 + Math.hypot(Cb[y * w + x], Cr[y * w + x]) * 0.6; n++;
    }
    const cx = (gx + 0.5) / gw - 0.5, cy = (gy + 0.5) / gh - 0.5;
    sal[gy * gw + gx] = (n ? s / n : 0) * (1 - 0.5 * Math.hypot(cx, cy));
  }
  const sorted = [...sal].sort((a, b) => a - b); const thr = sorted[Math.floor(sorted.length * 0.8)];
  let x0 = gw, x1 = -1, y0 = gh, y1 = -1, sw = 0, scx = 0, scy = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) { const v = sal[gy * gw + gx]; if (v >= thr) { x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy); sw += v; scx += v * (gx + 0.5) / gw; scy += v * (gy + 0.5) / gh; } }
  const subj = { x: x0 / gw, y: y0 / gh, w: (x1 - x0 + 1) / gw, h: (y1 - y0 + 1) / gh, cx: sw ? scx / sw : 0.5, cy: sw ? scy / sw : 0.5, confidence: Math.min(1, (sorted[sorted.length - 1] - sorted[Math.floor(sorted.length / 2)]) / (sorted[sorted.length - 1] + 1e-6)) };
  // Light direction from luminance gradient across thirds
  const regionMean = (xa: number, xb: number, ya: number, yb_: number) => { let s = 0, n = 0; for (let y = Math.floor(ya * h); y < Math.floor(yb_ * h); y++) for (let x = Math.floor(xa * w); x < Math.floor(xb * w); x++) { s += Y[y * w + x]; n++; } return n ? s / n : 0; };
  const L = regionMean(0, 1 / 3, 0, 1), R = regionMean(2 / 3, 1, 0, 1), T = regionMean(0, 1, 0, 1 / 3), B = regionMean(0, 1, 2 / 3, 1);
  const centre = regionMean(0.3, 0.7, 0.3, 0.7), edge = (L + R + T + B) / 4;
  // Horizon tilt: vote on edge-normal orientation. A level horizon has a vertical normal (theta = +-90 deg).
  const bins = new Float32Array(61); let tot = 0;
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const [gx, gy] = sobel(Y, w, x, y); const m = Math.hypot(gx, gy);
    if (m < 0.32) continue; tot += m;
    const theta = (Math.atan2(gy, gx) * 180) / Math.PI;           // -180..180
    const t = ((((theta + 90) % 180) + 180) % 180) - 90;           // fold to [-90, 90)
    const tilt = t > 0 ? t - 90 : t + 90;                          // 0 = level horizontal edge
    if (Math.abs(tilt) <= 15) bins[Math.round(tilt) + 30] += m;
  }
  let inRange = 0; for (let i = 15; i <= 45; i++) inRange += bins[i];
  let best = 0, bi = 30; for (let i = 17; i <= 43; i++) { const v = bins[i - 2] + bins[i - 1] + bins[i] + bins[i + 1] + bins[i + 2]; if (v > best) { best = v; bi = i; } }
  // confidence = share of in-range edge votes concentrated in one +-2 degree window (uniform noise gives ~0.16)
  const horizonConf = inRange > 0 ? best / inRange : 0;
  // refine: exact (unquantised) weighted mean of edge angles within +-2.5 deg of the peak
  let wsum = 0, wpos = 0; const peak = bi - 30;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const [gx, gy] = sobel(Y, w, x, y); const m = Math.hypot(gx, gy); if (m < 0.32) continue;
    const theta = (Math.atan2(gy, gx) * 180) / Math.PI; const t = ((((theta + 90) % 180) + 180) % 180) - 90; const tilt = t > 0 ? t - 90 : t + 90;
    if (Math.abs(tilt - peak) <= 2.5) { wsum += m; wpos += m * tilt; }
  }
  const hz = wsum > 0 ? Math.round((wpos / wsum) * 10) / 10 : 0;
  // subject-vs-background luminance using the heuristic subject box
  let sIn = 0, nIn = 0, sOut = 0, nOut = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const inside = x / w >= subj.x && x / w <= subj.x + subj.w && y / h >= subj.y && y / h <= subj.y + subj.h; if (inside) { sIn += Y[y * w + x]; nIn++; } else { sOut += Y[y * w + x]; nOut++; } }
  const ring = (regionMean(0, 1, 0, 0.1) + regionMean(0, 1, 0.9, 1) + regionMean(0, 0.1, 0, 1) + regionMean(0.9, 1, 0, 1)) / 4;
  const pts = [[1 / 3, 1 / 3], [2 / 3, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 2 / 3]];
  return {
    width: w0, height: h0, meanLuma: meanY, p1: p(0.01), p5: p(0.05), p50: p(0.5), p95: p(0.95), p99: p(0.99),
    clipHighPct: (clipH / N) * 100, clipLowPct: (clipL / N) * 100, dynamicRange: p(0.99) - p(0.01),
    histogram: hist.map((v) => v / Math.max(...hist)), histR: hR.map((v) => v / Math.max(...hR)), histG: hG.map((v) => v / Math.max(...hG)), histB: hB.map((v) => v / Math.max(...hB)),
    castR, castB, tintG, neutralShare: nn / N, meanSat: sumSat / N,
    colorfulness: Math.sqrt(rg2 / N - (rg / N) ** 2 + yb2 / N - (yb / N) ** 2),
    sharpness: sharp, sharpnessCentre: Math.sqrt(cSum / Math.max(1, cn)), sharpnessEdge: Math.sqrt(eSum / Math.max(1, en)),
    noiseLuma: mad(flatLaps), noiseChroma: mad(flatChroma),
    subject: subj, skyShare: skyN / N, skyBlue: skyN ? skyBlueSum / skyN : 0, skyLuma: skyN ? skyLumaSum / skyN : 0, subjectLuma: nIn ? sIn / nIn : meanY, bgLuma: nOut ? sOut / nOut : meanY,
    lightLR: R - L, lightTB: T - B, backlit: edge - centre > 0.12 && meanY < 0.5, isMonochrome: mono,
    lowKey: p(0.5) < 0.22 && p(0.99) >= 0.6, highKey: p(0.5) > 0.7,
    horizonTiltDeg: horizonConf > 0.35 && tot > 0 ? hz : 0, horizonConfidence: horizonConf,
    meanRGB: [sumR / N, sumG / N, sumB / N], bandWeight: bandW.map((v) => v / N), bandSat: bandS.map((v, k) => (bandW[k] ? v / bandW[k] : 0)), edgeCentreRatio: ring / Math.max(1e-3, centre),
    thirds: { nearestPowerPoint: Math.min(...pts.map(([px, py]) => Math.hypot(subj.cx - px, subj.cy - py))) },
  };
}
