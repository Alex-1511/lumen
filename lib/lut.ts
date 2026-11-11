// Colour LUTs. A .cube file (1D or 3D) or a gradient map becomes one 3D lookup table that the WebGL shader samples with hardware trilinear
// interpolation. Stored as 8-bit RGB (size^3 * 3 bytes) so it is small enough to live in the project database.
export interface LutData { name: string; size: number; data: Uint8Array; kind: "3d" | "1d" | "gradient" }
export interface LutState { lut: LutData; amount: number } // amount 0..1
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const q = (v: number) => Math.round(clamp01(v) * 255);

/** Parse an Adobe/Resolve .cube file. Returns an error string instead of throwing so the UI can show it. */
export function parseCube(text: string, fileName = "LUT"): LutData | string {
  let title = fileName.replace(/\.cube$/i, ""), n1 = 0, n3 = 0, dmin = [0, 0, 0], dmax = [1, 1, 1]; const rows: number[][] = [];
  for (const raw of text.split(/\r?\n/)) { const l = raw.trim(); if (!l || l[0] === "#") continue; const w = l.split(/\s+/);
    if (/^TITLE$/i.test(w[0])) { title = l.replace(/^TITLE\s+/i, "").replace(/^"|"$/g, "") || title; continue; }
    if (/^LUT_1D_SIZE$/i.test(w[0])) { n1 = parseInt(w[1], 10); continue; } if (/^LUT_3D_SIZE$/i.test(w[0])) { n3 = parseInt(w[1], 10); continue; }
    if (/^DOMAIN_MIN$/i.test(w[0])) { dmin = w.slice(1, 4).map(Number); continue; } if (/^DOMAIN_MAX$/i.test(w[0])) { dmax = w.slice(1, 4).map(Number); continue; }
    if (/^[A-Z_]+$/i.test(w[0]) && isNaN(Number(w[0]))) continue; // other keywords
    const v = w.slice(0, 3).map(Number); if (v.length < 3 || v.some((x) => !Number.isFinite(x))) return `Line "${l.slice(0, 40)}" is not a valid LUT row.`; rows.push(v); }
  const norm = (v: number[]) => v.map((x, i) => (x - dmin[i]) / Math.max(1e-6, dmax[i] - dmin[i]));
  if (n3) { if (n3 < 2 || n3 > 65) return `LUT_3D_SIZE ${n3} is not supported (2 to 65).`; if (rows.length !== n3 ** 3) return `Expected ${n3 ** 3} rows for a ${n3}-point 3D LUT but found ${rows.length}.`;
    const data = new Uint8Array(n3 ** 3 * 3); rows.forEach((r, i) => { const o = norm(r); data[i * 3] = q(o[0]); data[i * 3 + 1] = q(o[1]); data[i * 3 + 2] = q(o[2]); }); return { name: title, size: n3, data, kind: "3d" }; }
  if (n1) { if (n1 < 2 || n1 > 4096) return `LUT_1D_SIZE ${n1} is not supported.`; if (rows.length !== n1) return `Expected ${n1} rows for a 1D LUT but found ${rows.length}.`;
    const S = 33, data = new Uint8Array(S ** 3 * 3), curve = rows.map(norm); // 1D = same curve per channel, resampled into a 3D table
    const f = (c: number, t: number) => { const p = t * (n1 - 1), i = Math.min(n1 - 2, Math.floor(p)), k = p - i; return curve[i][c] * (1 - k) + curve[i + 1][c] * k; };
    for (let b = 0; b < S; b++) for (let g = 0; g < S; g++) for (let r = 0; r < S; r++) { const o = ((b * S + g) * S + r) * 3; data[o] = q(f(0, r / (S - 1))); data[o + 1] = q(f(1, g / (S - 1))); data[o + 2] = q(f(2, b / (S - 1))); }
    return { name: title, size: S, data, kind: "1d" }; }
  return "This file has no LUT_1D_SIZE or LUT_3D_SIZE line, so it is not a .cube LUT.";
}
export function identityLut(size = 17): LutData { const data = new Uint8Array(size ** 3 * 3); for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) { const o = ((b * size + g) * size + r) * 3; data[o] = q(r / (size - 1)); data[o + 1] = q(g / (size - 1)); data[o + 2] = q(b / (size - 1)); } return { name: "Identity", size, data, kind: "3d" }; }
export type Stop = { at: number; rgb: [number, number, number] }; // at 0..1 luminance, rgb 0..1
/** Gradient Map: every pixel's luminance picks a colour from the gradient. */
export function gradientMapLut(stops: Stop[], name = "Gradient map", size = 33): LutData {
  const s = [...stops].sort((a, b) => a.at - b.at); const at = (y: number): number[] => { if (y <= s[0].at) return s[0].rgb; if (y >= s[s.length - 1].at) return s[s.length - 1].rgb; for (let i = 0; i < s.length - 1; i++) if (y <= s[i + 1].at) { const k = (y - s[i].at) / Math.max(1e-6, s[i + 1].at - s[i].at); return s[i].rgb.map((v, c) => v * (1 - k) + s[i + 1].rgb[c] * k); } return s[0].rgb; };
  const data = new Uint8Array(size ** 3 * 3); for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) { const y = 0.2126 * (r / (size - 1)) + 0.7152 * (g / (size - 1)) + 0.0722 * (b / (size - 1)); const c = at(y), o = ((b * size + g) * size + r) * 3; data[o] = q(c[0]); data[o + 1] = q(c[1]); data[o + 2] = q(c[2]); }
  return { name, size, data, kind: "gradient" };
}
export const GRADIENT_PRESETS: { id: string; name: string; stops: Stop[] }[] = [
  { id: "duotone-blue-amber", name: "Duotone: navy to amber", stops: [{ at: 0, rgb: [0.03, 0.05, 0.16] }, { at: 1, rgb: [1, 0.78, 0.4] }] },
  { id: "sunset", name: "Sunset", stops: [{ at: 0, rgb: [0.08, 0.02, 0.18] }, { at: 0.5, rgb: [0.85, 0.25, 0.3] }, { at: 1, rgb: [1, 0.9, 0.55] }] },
  { id: "teal-orange", name: "Teal to orange", stops: [{ at: 0, rgb: [0.02, 0.12, 0.16] }, { at: 0.5, rgb: [0.45, 0.5, 0.5] }, { at: 1, rgb: [1, 0.68, 0.4] }] },
  { id: "cyanotype", name: "Cyanotype", stops: [{ at: 0, rgb: [0.0, 0.07, 0.2] }, { at: 1, rgb: [0.85, 0.95, 1] }] },
  { id: "infrared", name: "Infrared", stops: [{ at: 0, rgb: [0.1, 0, 0.1] }, { at: 0.5, rgb: [0.9, 0.2, 0.3] }, { at: 1, rgb: [1, 0.95, 0.85] }] },
];
/** Apply a LUT on the CPU (used by tests as ground truth and by the scopes-free headless path). Trilinear like the GPU. */
export function sampleLut(l: LutData, r: number, g: number, b: number): [number, number, number] {
  const N = l.size, f = (v: number) => clamp01(v) * (N - 1); const [x, y, z] = [f(r), f(g), f(b)]; const [x0, y0, z0] = [Math.min(N - 2, Math.floor(x)), Math.min(N - 2, Math.floor(y)), Math.min(N - 2, Math.floor(z))]; const [fx, fy, fz] = [x - x0, y - y0, z - z0];
  const at = (i: number, j: number, k: number, c: number) => l.data[((k * N + j) * N + i) * 3 + c] / 255; const out: number[] = [0, 0, 0];
  for (let c = 0; c < 3; c++) { let s = 0; for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += at(x0 + dx, y0 + dy, z0 + dz, c) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz); out[c] = s; }
  return out as [number, number, number];
}
