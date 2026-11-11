// Lanczos-3 resampling for export (downscale with proper anti-aliasing, upscale with sharp reconstruction).
// Streams rows so an 8K output needs a few MB of scratch, not hundreds.
const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos = (x: number) => (Math.abs(x) >= 3 ? 0 : sinc(x) * sinc(x / 3));
interface Taps { start: Int32Array; len: Int32Array; w: Float32Array; max: number }
function taps(srcN: number, dstN: number): Taps {
  const scale = srcN / dstN, f = Math.max(1, scale), sup = 3 * f, max = Math.ceil(sup * 2) + 2;
  const start = new Int32Array(dstN), len = new Int32Array(dstN), w = new Float32Array(dstN * max);
  for (let i = 0; i < dstN; i++) {
    const c = (i + 0.5) * scale; let a = Math.floor(c - sup + 0.5), b = Math.ceil(c + sup - 0.5); a = Math.max(0, a); b = Math.min(srcN - 1, b);
    let sum = 0; for (let j = a; j <= b; j++) { const v = lanczos((j + 0.5 - c) / f); w[i * max + (j - a)] = v; sum += v; }
    if (sum !== 0) for (let j = a; j <= b; j++) w[i * max + (j - a)] /= sum;
    start[i] = a; len[i] = b - a + 1;
  }
  return { start, len, w, max };
}
/** RGBA8 in, RGBA8 out. */
export function lanczosResize(src: ArrayLike<number>, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  if (sw === dw && sh === dh) { out.set(src as ArrayLike<number> as any); return out; }
  const hx = taps(sw, dw), vy = taps(sh, dh), cache = new Map<number, Float32Array>();
  const row = (y: number) => {
    let r = cache.get(y); if (r) return r; r = new Float32Array(dw * 4); const base = y * sw * 4;
    for (let x = 0; x < dw; x++) { const s = hx.start[x], n = hx.len[x], o = x * hx.max; let R = 0, G = 0, B = 0, A = 0;
      for (let k = 0; k < n; k++) { const wt = hx.w[o + k], p = base + (s + k) * 4; R += src[p] * wt; G += src[p + 1] * wt; B += src[p + 2] * wt; A += src[p + 3] * wt; }
      r[x * 4] = R; r[x * 4 + 1] = G; r[x * 4 + 2] = B; r[x * 4 + 3] = A; }
    cache.set(y, r); return r;
  };
  for (let y = 0; y < dh; y++) {
    const s = vy.start[y], n = vy.len[y], o = y * vy.max, acc = new Float32Array(dw * 4);
    for (let k = 0; k < n; k++) { const wt = vy.w[o + k], r = row(s + k); for (let i = 0; i < acc.length; i++) acc[i] += r[i] * wt; }
    out.set(acc as any, y * dw * 4); // Uint8ClampedArray rounds and clamps
    for (const key of cache.keys()) if (key < s) cache.delete(key);
  }
  return out;
}

/** Resolution ladder. Long-edge pixels for a 16:9 frame of that name; "original" keeps the source size. */
export const RESOLUTIONS: { value: string; label: string; edge: number }[] = [
  { value: "orig", label: "Original size", edge: 0 }, { value: "360p", label: "360p (640 px)", edge: 640 }, { value: "480p", label: "480p (854 px)", edge: 854 },
  { value: "720p", label: "720p HD (1280 px)", edge: 1280 }, { value: "1080p", label: "1080p Full HD (1920 px)", edge: 1920 }, { value: "4k", label: "4K UHD (3840 px)", edge: 3840 },
  { value: "8k", label: "8K UHD (7680 px)", edge: 7680 }, { value: "custom", label: "Custom long edge…", edge: -1 },
];
export const edgeFor = (res: string, custom: number) => { const r = RESOLUTIONS.find((x) => x.value === res); return !r ? 0 : r.edge === -1 ? Math.max(0, Math.round(custom)) : r.edge; };
