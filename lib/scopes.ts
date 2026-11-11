// Video-style scopes computed from the rendered preview pixels (not from the source): Luma waveform (RGB parade colours merged) and a Cb/Cr vectorscope (BT.709).
/** Waveform: x = image column, y = brightness (0 at the bottom). Returns an RGBA buffer OW x OH. */
export function waveformBuffer(d: Uint8ClampedArray, w: number, h: number, OW: number, OH: number): Uint8ClampedArray {
  const acc = new Float32Array(OW * OH * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, ox = Math.min(OW - 1, Math.floor((x / w) * OW)); for (let c = 0; c < 3; c++) { const oy = OH - 1 - Math.min(OH - 1, Math.round((d[i + c] / 255) * (OH - 1))); acc[(oy * OW + ox) * 3 + c] += 1; } }
  const gain = (OH * 1.6) / h; const out = new Uint8ClampedArray(OW * OH * 4); for (let p = 0; p < OW * OH; p++) { const r = Math.min(1, acc[p * 3] * gain), g = Math.min(1, acc[p * 3 + 1] * gain), b = Math.min(1, acc[p * 3 + 2] * gain); const k = 255; out[p * 4] = r * k; out[p * 4 + 1] = g * k; out[p * 4 + 2] = b * k; out[p * 4 + 3] = r + g + b > 0 ? 255 : 0; } return out;
}
export const cbcr = (r: number, g: number, b: number): [number, number] => { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; return [(b - y) / 1.8556, (r - y) / 1.5748]; }; // each in about -0.5..0.5
/** Vectorscope: Cb on x, Cr on y (up), centred. Saturated primaries sit near the rim; neutral greys at the centre. */
export function vectorBuffer(d: Uint8ClampedArray, S: number): Uint8ClampedArray {
  const acc = new Float32Array(S * S); const n = d.length / 4, step = Math.max(1, Math.floor(n / 60000));
  for (let p = 0; p < n; p += step) { const [cb, cr] = cbcr(d[p * 4] / 255, d[p * 4 + 1] / 255, d[p * 4 + 2] / 255); const x = Math.round(S / 2 + cb * (S - 2)), y = Math.round(S / 2 - cr * (S - 2)); if (x >= 0 && x < S && y >= 0 && y < S) acc[y * S + x]++; }
  let mx = 1; for (const v of acc) if (v > mx) mx = v; const out = new Uint8ClampedArray(S * S * 4); for (let p = 0; p < S * S; p++) { const v = acc[p] ? 90 + 165 * Math.sqrt(acc[p] / mx) : 0; out[p * 4] = v; out[p * 4 + 1] = v; out[p * 4 + 2] = v; out[p * 4 + 3] = acc[p] ? 255 : 0; } return out;
}
/** Draw a scope onto a 2D canvas context with a simple graticule. */
export function drawScope(g: CanvasRenderingContext2D, W: number, H: number, kind: "wave" | "vector", d: Uint8ClampedArray, w: number, h: number) {
  g.clearRect(0, 0, W, H); g.fillStyle = "#101010"; g.fillRect(0, 0, W, H);
  if (kind === "wave") { g.strokeStyle = "rgba(255,255,255,.12)"; for (const f of [0, .25, .5, .75, 1]) { const y = Math.round((1 - f) * (H - 1)) + .5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } const b = waveformBuffer(d, w, h, W, H); const im = new ImageData(b, W, H); const t = document.createElement("canvas"); t.width = W; t.height = H; t.getContext("2d")!.putImageData(im, 0, 0); g.globalCompositeOperation = "lighter"; g.drawImage(t, 0, 0); g.globalCompositeOperation = "source-over"; return; }
  const S = Math.min(W, H); const ox = Math.round((W - S) / 2); g.strokeStyle = "rgba(255,255,255,.14)"; g.beginPath(); g.arc(ox + S / 2, S / 2, S * 0.46, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(ox, S / 2); g.lineTo(ox + S, S / 2); g.moveTo(ox + S / 2, 0); g.lineTo(ox + S / 2, S); g.stroke();
  g.strokeStyle = "rgba(255,170,120,.55)"; g.beginPath(); g.moveTo(ox + S / 2, S / 2); const a = (123 * Math.PI) / 180; g.lineTo(ox + S / 2 + Math.cos(a) * S * 0.46, S / 2 - Math.sin(a) * S * 0.46); g.stroke(); // skin-tone line (~123 degrees on this Cb/Cr layout)
  const b = vectorBuffer(d, S); const t = document.createElement("canvas"); t.width = S; t.height = S; t.getContext("2d")!.putImageData(new ImageData(b, S, S), 0, 0); g.drawImage(t, ox, 0);
}
