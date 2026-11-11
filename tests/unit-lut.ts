import { parseCube, identityLut, gradientMapLut, GRADIENT_PRESETS, sampleLut } from "../lib/lut";
let ok = 0, bad = 0; const t = (n: string, c: boolean, i = "") => { c ? ok++ : (bad++, console.log("FAIL", n, i)); };
const cube = (n: number, f: (r: number, g: number, b: number) => number[]) => { let s = `TITLE "test"\nLUT_3D_SIZE ${n}\n`; for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) s += f(r / (n - 1), g / (n - 1), b / (n - 1)).join(" ") + "\n"; return s; };
const id = parseCube(cube(5, (r, g, b) => [r, g, b])); t("identity parses", typeof id !== "string" && id.size === 5 && id.name === "test");
if (typeof id !== "string") { const o = sampleLut(id, 0.3, 0.6, 0.9); t("identity LUT leaves colours unchanged", Math.abs(o[0] - 0.3) < 0.01 && Math.abs(o[1] - 0.6) < 0.01 && Math.abs(o[2] - 0.9) < 0.01, o.join(",")); }
const inv = parseCube(cube(9, (r, g, b) => [1 - r, 1 - g, 1 - b])); if (typeof inv !== "string") { const o = sampleLut(inv, 0.25, 0.5, 1); t("invert LUT inverts", Math.abs(o[0] - 0.75) < 0.01 && Math.abs(o[2]) < 0.01, o.join(",")); }
t("wrong row count is rejected with a message", typeof parseCube("LUT_3D_SIZE 3\n0 0 0\n") === "string");
t("non-LUT file is rejected", /no LUT_1D_SIZE/.test(parseCube("hello") as string));
t("bad row is rejected", typeof parseCube("LUT_1D_SIZE 2\n0 0 0\nx y z\n") === "string");
const one = parseCube("LUT_1D_SIZE 2\n0 0 0\n1 1 1\n"); t("1D identity resamples to 3D", typeof one !== "string" && one.kind === "1d" && Math.abs(sampleLut(one, 0.4, 0.4, 0.4)[0] - 0.4) < 0.02);
const dom = parseCube("LUT_1D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n0 0 0\n2 2 2\n"); t("DOMAIN is normalised", typeof dom !== "string" && Math.abs(sampleLut(dom, 0.5, 0.5, 0.5)[1] - 0.5) < 0.02);
const gm = gradientMapLut(GRADIENT_PRESETS[0].stops); const dark = sampleLut(gm, 0, 0, 0), light = sampleLut(gm, 1, 1, 1), mid = sampleLut(gm, 0.5, 0.5, 0.5);
t("gradient map: black -> first stop, white -> last stop", Math.abs(dark[2] - 0.16) < 0.02 && Math.abs(light[0] - 1) < 0.02, `${dark} ${light}`);
t("gradient map is driven by luminance only (red 1,0,0 equals same-luma grey)", (() => { const a = sampleLut(gm, 1, 0, 0), b = sampleLut(gm, 0.2126, 0.2126, 0.2126); return Math.abs(a[0] - b[0]) < 0.03; })()); t("mid is between", mid[0] > dark[0] && mid[0] < light[0]);
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
