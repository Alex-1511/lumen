// SDR -> HDR output. Honest scope: an 8-bit SDR render is expanded into BT.2020 / PQ (SMPTE ST 2084) in a 16-bit PNG tagged with a cICP chunk.
// The highlights are inverse-tone-mapped (expanded); real HDR detail that was never captured cannot be recovered from an 8-bit JPEG.
import { crc32 } from "./zip";

const SRGB_LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const M1 = 2610 / 16384, M2 = (2523 / 4096) * 128, C1 = 3424 / 4096, C2 = (2413 / 4096) * 32, C3 = (2392 / 4096) * 32;
export const SDR_WHITE_NITS = 203; // BT.2408 reference white
/** PQ inverse EOTF: absolute nits -> 0..1 signal. */
export const pqEncode = (nits: number) => { const y = Math.pow(Math.max(0, Math.min(1, nits / 10000)), M1); return Math.pow((C1 + C2 * y) / (1 + C3 * y), M2); };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** rgba8 (sRGB) -> interleaved RGB 16-bit PQ/BT.2020. peakNits is where SDR white lands (highlights roll up to it). */
export function sdrToPq16(rgba: ArrayLike<number>, w: number, h: number, peakNits = 1000): Uint16Array {
  const out = new Uint16Array(w * h * 3), gain = peakNits / SDR_WHITE_NITS - 1;
  for (let i = 0, o = 0; i < w * h; i++, o += 3) {
    const r = SRGB_LIN[rgba[i * 4]], g = SRGB_LIN[rgba[i * 4 + 1]], b = SRGB_LIN[rgba[i * 4 + 2]];
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, k = SDR_WHITE_NITS * (1 + gain * Math.pow(smooth(0.72, 1, Math.sqrt(Y)), 2)); // expand only the top of the range
    const R = (0.6274 * r + 0.3293 * g + 0.0433 * b) * k, G = (0.0691 * r + 0.9195 * g + 0.0114 * b) * k, B = (0.0164 * r + 0.088 * g + 0.8956 * b) * k; // BT.709 -> BT.2020 primaries
    out[o] = Math.round(pqEncode(R) * 65535); out[o + 1] = Math.round(pqEncode(G) * 65535); out[o + 2] = Math.round(pqEncode(B) * 65535);
  }
  return out;
}

const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type), body = new Uint8Array(4 + data.length); body.set(t, 0); body.set(data, 4);
  const out = new Uint8Array(12 + data.length); out.set(u32(data.length), 0); out.set(body, 4); out.set(u32(crc32(body) >>> 0), 8 + data.length); return out;
}
export type Deflate = (raw: Uint8Array) => Promise<Uint8Array>; // zlib-wrapped deflate
/** Browser deflate through CompressionStream. */
export const browserDeflate: Deflate = async (raw) => { const cs = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate")); return new Uint8Array(await new Response(cs).arrayBuffer()); };

/** 16-bit RGB PNG. With `cicp`, the file is tagged BT.2020 primaries + PQ transfer, full range (HDR10-style still). */
export async function encodePng16(rgb: Uint16Array, w: number, h: number, deflate: Deflate, cicp = true): Promise<Uint8Array> {
  const stride = w * 6, raw = new Uint8Array(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; let o = y * (stride + 1) + 1; for (let x = 0; x < w * 3; x++) { const v = rgb[y * w * 3 + x]; raw[o++] = v >> 8; raw[o++] = v & 255; } }
  const ihdr = new Uint8Array(13); ihdr.set(u32(w), 0); ihdr.set(u32(h), 4); ihdr[8] = 16; ihdr[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr)];
  if (cicp) parts.push(chunk("cICP", new Uint8Array([9, 16, 0, 1])));
  parts.push(chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array(0)));
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let p = 0; for (const c of parts) { out.set(c, p); p += c.length; } return out;
}
