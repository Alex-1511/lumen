// Output sharpening: a final unsharp mask on the RESIZED pixels, because resizing and the target medium soften detail.
// "screen" = fine radius, modest amount. "print" = wider radius (ink spread), stronger amount. Luminance only, so no colour halos.
export type OutSharp = "off" | "screen" | "print";
export const OUT_SHARP: Record<Exclude<OutSharp, "off">, { radiusFrac: number; minRadius: number; amount: number; label: string }> = {
  screen: { radiusFrac: 0.0004, minRadius: 0.6, amount: 0.55, label: "Sharpen for screen" },
  print: { radiusFrac: 0.0011, minRadius: 1.0, amount: 0.9, label: "Sharpen for print" },
};
function boxBlurH(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) { const k = 2 * r + 1; for (let y = 0; y < h; y++) { const o = y * w; let acc = 0; for (let x = -r; x <= r; x++) acc += src[o + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { dst[o + x] = acc / k; acc += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } } }
function boxBlurV(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) { const k = 2 * r + 1; for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += src[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { dst[y * w + x] = acc / k; acc += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x]; } } }
/** In place on RGBA bytes. Returns the radius actually used (0 = nothing done). */
export function outputSharpen(px: Uint8ClampedArray, w: number, h: number, mode: OutSharp): number {
  if (mode === "off") return 0; const P = OUT_SHARP[mode]; const rad = Math.max(P.minRadius, P.radiusFrac * Math.max(w, h)); const r = Math.max(1, Math.round(rad));
  const n = w * h, Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
  let a = new Float32Array(n), b = new Float32Array(n); boxBlurH(Y, a, w, h, r); boxBlurV(a, b, w, h, r); boxBlurH(b, a, w, h, r); boxBlurV(a, b, w, h, r); // ~Gaussian (two box passes each way)
  const amt = P.amount; for (let i = 0; i < n; i++) { const d = (Y[i] - b[i]) * amt; if (Math.abs(d) < 1.2) continue; /* threshold keeps flat areas and noise untouched */ const o = i * 4; px[o] += d; px[o + 1] += d; px[o + 2] += d; }
  return r;
}
