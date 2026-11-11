import { waveformBuffer, vectorBuffer, cbcr } from "../lib/scopes";
let ok = 0, bad = 0; const t = (n: string, c: boolean, i = "") => { c ? ok++ : (bad++, console.log("FAIL", n, i)); };
const img = (f: (x: number, y: number) => number[], w = 64, h = 32) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y), o = (y * w + x) * 4; d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255; } return { d, w, h }; };
// waveform of a horizontal ramp is a rising diagonal
const ramp = img((x) => [x * 4, x * 4, x * 4]); const wf = waveformBuffer(ramp.d, ramp.w, ramp.h, 64, 64);
const lit = (x: number) => { for (let y = 0; y < 64; y++) if (wf[(y * 64 + x) * 4 + 3]) return 63 - y; return -1; };
t("ramp waveform rises left to right", lit(5) < lit(32) && lit(32) < lit(60), `${lit(5)} ${lit(32)} ${lit(60)}`);
t("ramp waveform ends near the right heights", Math.abs(lit(63) - 63) <= 2 && lit(0) <= 2);
// vectorscope: grey at centre; red on the +Cr side; blue on +Cb side
const S = 64; const pos = (rgb: number[]) => { const im = img(() => rgb, 8, 8), b = vectorBuffer(im.d, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (b[(y * S + x) * 4 + 3]) return [x - S / 2, S / 2 - y]; return [NaN, NaN]; };
const g = pos([128, 128, 128]), r = pos([255, 0, 0]), b = pos([0, 0, 255]), gr = pos([0, 255, 0]);
t("grey sits at the centre", Math.abs(g[0]) <= 1 && Math.abs(g[1]) <= 1, g.join(","));
t("red is above centre (Cr+)", r[1] > 15 && Math.abs(r[0]) < 14, r.join(",")); t("blue is right of centre (Cb+)", b[0] > 20, b.join(","));
t("green is lower-left of centre", gr[0] < -8 && gr[1] < -8, gr.join(","));
t("cbcr of grey is zero", Math.abs(cbcr(.5, .5, .5)[0]) < 1e-9);
// skin-tone-ish warm colour falls between red and yellow: Cr positive, Cb negative
const sk = pos([224, 172, 140]); t("skin tone lands upper-left (Cr+, Cb-)", sk[1] > 0 && sk[0] < 0, sk.join(","));
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
