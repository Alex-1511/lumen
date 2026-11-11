// Pure export helpers (no DOM needed except drawWatermark, which takes a 2D context).

/** Baseline TIFF: little-endian, uncompressed, 8-bit RGB, single strip, no ICC profile, no EXIF. */
export function encodeTiff(rgba: ArrayLike<number>, w: number, h: number, dpi = 300): Uint8Array {
  const ENTRIES = 11, ifdSize = 2 + ENTRIES * 12 + 4, ifdOff = 8;
  const bpsOff = ifdOff + ifdSize, xrOff = bpsOff + 6, yrOff = xrOff + 8, dataOff = yrOff + 8, dataLen = w * h * 3;
  const out = new Uint8Array(dataOff + dataLen), dv = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, ifdOff, true);
  dv.setUint16(ifdOff, ENTRIES, true);
  let p = ifdOff + 2;
  const entry = (tag: number, type: number, count: number, value: number) => { dv.setUint16(p, tag, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true); if (type === 3 && count === 1) dv.setUint16(p + 8, value, true); else dv.setUint32(p + 8, value, true); p += 12; };
  const SHORT = 3, LONG = 4, RATIONAL = 5;
  entry(256, LONG, 1, w); entry(257, LONG, 1, h); entry(258, SHORT, 3, bpsOff); entry(262, SHORT, 1, 2); entry(273, LONG, 1, dataOff);
  entry(277, SHORT, 1, 3); entry(278, LONG, 1, h); entry(279, LONG, 1, dataLen); entry(282, RATIONAL, 1, xrOff); entry(283, RATIONAL, 1, yrOff); entry(296, SHORT, 1, 2);
  dv.setUint32(p, 0, true); // no next IFD
  dv.setUint16(bpsOff, 8, true); dv.setUint16(bpsOff + 2, 8, true); dv.setUint16(bpsOff + 4, 8, true);
  dv.setUint32(xrOff, dpi, true); dv.setUint32(xrOff + 4, 1, true); dv.setUint32(yrOff, dpi, true); dv.setUint32(yrOff + 4, 1, true);
  for (let i = 0, o = dataOff; i < w * h; i++, o += 3) { out[o] = rgba[i * 4]; out[o + 1] = rgba[i * 4 + 1]; out[o + 2] = rgba[i * 4 + 2]; }
  return out;
}

export type WmPos = "br" | "bl" | "tr" | "tl" | "c";
export interface Watermark { text: string; pos: WmPos; size: number; opacity: number } // size: % of long edge (height of text), opacity 0..100
export interface ExportOpts { fmt: string; q: number; edge: number; watermark?: Watermark; range?: "sdr" | "hdr"; peak?: number; sharpen?: "off" | "screen" | "print" }

/** Draws a text watermark. Size scales with the image, so it looks the same at every export size. */
export function drawWatermark(g: CanvasRenderingContext2D, w: number, h: number, wm: Watermark) {
  const text = wm.text.trim(); if (!text) return;
  const px = Math.max(10, Math.round(Math.max(w, h) * (wm.size / 100))), m = Math.round(px * 0.8);
  g.save(); g.globalAlpha = Math.min(1, Math.max(0, wm.opacity / 100)); g.font = `600 ${px}px Inter, system-ui, sans-serif`; g.textBaseline = "alphabetic";
  const tw = g.measureText(text).width;
  const x = wm.pos === "c" ? (w - tw) / 2 : wm.pos.endsWith("l") ? m : w - tw - m;
  const y = wm.pos === "c" ? (h + px * 0.7) / 2 : wm.pos.startsWith("t") ? m + px * 0.8 : h - m;
  g.shadowColor = "rgba(0,0,0,0.55)"; g.shadowBlur = px * 0.18; g.fillStyle = "#fff"; g.fillText(text, x, y); g.restore();
}

export const FORMATS: { value: string; label: string; ext: string; lossy: boolean }[] = [
  { value: "image/jpeg", label: "JPEG", ext: "jpg", lossy: true },
  { value: "image/png", label: "PNG", ext: "png", lossy: false },
  { value: "image/webp", label: "WebP", ext: "webp", lossy: true },
  { value: "image/tiff", label: "TIFF (8-bit, uncompressed)", ext: "tif", lossy: false },
];
export const extFor = (fmt: string) => FORMATS.find((f) => f.value === fmt)?.ext ?? "jpg";
