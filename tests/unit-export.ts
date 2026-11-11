import zlib from "node:zlib";
import { lanczosResize, edgeFor, RESOLUTIONS } from "../lib/resample";
import { pqEncode, sdrToPq16, encodePng16 } from "../lib/hdr";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, i = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${i ? "  [" + i + "]" : ""}`); };
const solid = (w: number, h: number, v: number) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) a.set([v, v / 2, 255 - v, 255], i * 4); return a; };

// --- resampling ---
const same = lanczosResize(solid(8, 6, 100), 8, 6, 8, 6); ok("resize to same size is identity", same[0] === 100 && same.length === 8 * 6 * 4);
const up = lanczosResize(solid(10, 10, 90), 10, 10, 37, 23); ok("upscale keeps a flat colour flat and gives exact output size", up.length === 37 * 23 * 4 && up.every((v, i) => (i % 4 === 0 ? Math.abs(v - 90) <= 1 : true)));
const dn = lanczosResize(solid(400, 300, 200), 400, 300, 40, 30); ok("downscale keeps a flat colour flat", dn.every((v, i) => (i % 4 === 0 ? Math.abs(v - 200) <= 1 : true)));
const chk = new Uint8ClampedArray(64 * 64 * 4); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const v = (x + y) % 2 ? 255 : 0; chk.set([v, v, v, 255], (y * 64 + x) * 4); }
const half = lanczosResize(chk, 64, 64, 16, 16); const mid = half[(8 * 16 + 8) * 4]; ok("a 1px checkerboard averages to mid-grey when downscaled (anti-aliased, no moire)", Math.abs(mid - 127) < 14, String(mid));
const ramp = new Uint8ClampedArray(32 * 2 * 4); for (let y = 0; y < 2; y++) for (let x = 0; x < 32; x++) ramp.set([x * 8, x * 8, x * 8, 255], (y * 32 + x) * 4);
const r2 = lanczosResize(ramp, 32, 2, 96, 6); let mono = true; for (let x = 1; x < 96; x++) if (r2[x * 4] < r2[(x - 1) * 4] - 3) mono = false; ok("upscaling a gradient stays monotonic (no visible ringing beyond 3 levels)", mono);
const big = lanczosResize(solid(300, 200, 50), 300, 200, 1200, 800); ok("4x upscale returns the exact pixel count", big.length === 1200 * 800 * 4);
ok("resolution ladder maps names to long edges", edgeFor("360p", 0) === 640 && edgeFor("1080p", 0) === 1920 && edgeFor("4k", 0) === 3840 && edgeFor("8k", 0) === 7680 && edgeFor("orig", 0) === 0 && edgeFor("custom", 500) === 500 && RESOLUTIONS.length === 8);

// --- HDR ---
ok("PQ: 0 nits -> 0, 10000 nits -> 1", pqEncode(0) < 1e-5 && Math.abs(pqEncode(10000) - 1) < 1e-9);
ok("PQ: 203 nits (reference white) is about 0.58", Math.abs(pqEncode(203) - 0.5807) < 0.003, pqEncode(203).toFixed(4));
ok("PQ: 1000 nits is about 0.75", Math.abs(pqEncode(1000) - 0.7518) < 0.003, pqEncode(1000).toFixed(4));
const px = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255, 255, 0, 0, 255]);
const hdr = sdrToPq16(px, 4, 1, 1000);
ok("SDR white lands on the 1000 nit peak, black stays 0", Math.abs(hdr[0] / 65535 - pqEncode(1000)) < 0.003 && hdr[3] === 0 && hdr[4] === 0 && hdr[5] === 0, `${hdr[0]}`);
ok("mid grey is not expanded (stays near 44 nits)", Math.abs(hdr[6] / 65535 - pqEncode(0.2158 * 203)) < 0.01);
ok("HDR peak setting changes the highlights only", sdrToPq16(px, 4, 1, 4000)[0] > hdr[0] && Math.abs(sdrToPq16(px, 4, 1, 4000)[6] - hdr[6]) < 2);
ok("pure red moves into the wider BT.2020 gamut (green/blue stay small, red below white)", hdr[9] > hdr[10] && hdr[9] < hdr[0]);
(async () => {
  const bytes = await encodePng16(hdr, 4, 1, async (r) => new Uint8Array(zlib.deflateSync(r)), true);
  ok("PNG16 has a valid signature", bytes[0] === 137 && String.fromCharCode(bytes[1], bytes[2], bytes[3]) === "PNG");
  const txt = Buffer.from(bytes).toString("latin1"); ok("IHDR says 16-bit RGB", bytes[24] === 16 && bytes[25] === 2);
  const i = txt.indexOf("cICP"); ok("cICP chunk tags BT.2020 + PQ + full range", i > 0 && bytes[i + 4] === 9 && bytes[i + 5] === 16 && bytes[i + 6] === 0 && bytes[i + 7] === 1);
  const j = txt.indexOf("IDAT"), len = (bytes[j - 4] << 24) | (bytes[j - 3] << 16) | (bytes[j - 2] << 8) | bytes[j - 1]; const raw = zlib.inflateSync(Buffer.from(bytes.subarray(j + 4, j + 4 + len)));
  ok("pixel data round-trips", raw.length === 1 + 4 * 6 && ((raw[1] << 8) | raw[2]) === hdr[0]);
  require("node:fs").writeFileSync("/tmp/hdr-test.png", bytes);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
