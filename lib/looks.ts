// Look families: pick a family (Cinematic, Nature, Portrait...), then a variant (Old, Modern, Sci-fi... / Wildlife > Ant, Bird...),
// or type the variant you want. Every variant is a bundle of REAL parameter deltas applied at a strength you control.
import type { Effect } from "./effects";
const S: [number, number][] = [[0, 0.02], [0.25, 0.2], [0.5, 0.5], [0.75, 0.82], [1, 0.98]];
const FADE: [number, number][] = [[0, 0.06], [0.25, 0.27], [0.75, 0.78], [1, 0.97]];
let n = 0; const L = (family: string, name: string, desc: string, set: Effect["set"], extra: Partial<Effect> = {}, alias = ""): Effect & { alias: string } => ({ id: `${family}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-") + (n++ ? "" : ""), name, category: "Cinematic", desc, set, alias, ...extra });

export interface Family { id: string; name: string; blurb: string; groups: { name: string; looks: (Effect & { alias: string })[] }[] }
export const FAMILIES: Family[] = [
  { id: "cinematic", name: "Cinematic", blurb: "Film-style grades. Pick the era or mood.", groups: [{ name: "Looks", looks: [
    L("cin", "Natural", "Subtle contrast, gentle roll-off, true colour.", { contrast: 8, highlights: -8, shadows: 6, saturation: -4, vignette: 8 }, { curve: S }, "natural realistic subtle"),
    L("cin", "Modern", "Clean teal and orange, crisp, punchy.", { contrast: 14, clarity: 10, highlights: -12, shadows: 8, saturation: -4, gradeShH: -30, gradeShS: 30, gradeHiH: -8, gradeHiS: 24, vignette: 12 }, { curve: S }, "modern blockbuster contemporary hollywood teal orange"),
    L("cin", "Old", "Faded print: lifted blacks, warm cast, grain.", { fade: 40, contrast: -4, saturation: -18, temperature: 14, grain: 22, vignette: 22, gradeHiH: -4, gradeHiS: 18 }, { curve: FADE }, "old vintage classic retro 70s 80s aged"),
    L("cin", "Black and White", "High-contrast monochrome with grain.", { contrast: 26, blacks: -12, clarity: 10, grain: 18, vignette: 20 }, { bw: true }, "bw b&w black white monochrome noir silver"),
    L("cin", "Sci-fi", "Cold cyan shadows, magenta glow, hard contrast.", { contrast: 18, temperature: -14, saturation: 6, gradeShH: -40, gradeShS: 40, gradeHiH: 90, gradeHiS: 26, bloom: 22, clarity: 8 }, {}, "scifi sci-fi science fiction cyber future neon space"),
    L("cin", "Neo-noir", "Deep shadows, hard light, one cold tint.", { contrast: 34, blacks: -22, highlights: -14, saturation: -22, gradeShH: -20, gradeShS: 28, vignette: 34, grain: 14 }, {}, "noir neo dark crime detective thriller"),
    L("cin", "Western", "Dusty gold, sun-baked, grainy.", { temperature: 26, tint: 4, saturation: -10, contrast: 12, grain: 18, fade: 14, gradeHiH: -6, gradeHiS: 28, vignette: 16 }, {}, "western desert dusty sun baked gold cowboy"),
    L("cin", "Horror", "Sickly green, crushed, cold.", { saturation: -30, contrast: 20, blacks: -20, temperature: -10, tint: -14, gradeShH: -70, gradeShS: 30, vignette: 36, grain: 20 }, {}, "horror scary creepy dread green"),
    L("cin", "Romantic", "Soft, warm, glowing highlights.", { temperature: 14, contrast: -6, softFocus: 28, bloom: 20, saturation: 4, highlights: -10, gradeHiH: -6, gradeHiS: 22 }, {}, "romantic love dreamy soft warm wedding"),
    L("cin", "Anamorphic", "2.39:1 frame with halation glow.", { halation: 24, bloom: 12, contrast: 8 }, { cropRatio: 2.39 }, "anamorphic widescreen letterbox cinemascope"),
  ] }] },
  { id: "nature", name: "Nature", blurb: "Wildlife, space, sky and plants, each tuned differently.", groups: [
    { name: "Wildlife", looks: [
      L("nat", "Ant and insects", "Macro: crisp detail, rich colour, soft backdrop.", { clarity: 18, texture: 16, sharpAmount: 40, vibrance: 22, contrast: 10, bokeh: 35 }, {}, "ant ants insect insects bug bugs macro bee beetle spider close"),
      L("nat", "Birds", "Sharp feathers, clean sky, controlled highlights.", { sharpAmount: 45, texture: 14, clarity: 12, highlights: -14, vibrance: 14, dehaze: 10, bokeh: 25 }, {}, "bird birds feather eagle owl parrot"),
      L("nat", "Animals", "Earthy tones, fur texture, natural contrast.", { texture: 20, clarity: 14, contrast: 12, temperature: 6, vibrance: 12, sharpAmount: 35, vignette: 10 }, {}, "animal animals mammal fur deer lion tiger elephant dog cat fox"),
      L("nat", "Underwater", "Restore warmth and clarity lost in water.", { temperature: 20, dehaze: 28, contrast: 10, saturation: 8, clarity: 10 }, {}, "underwater sea marine fish coral dive"),
    ] },
    { name: "Space", looks: [
      L("nat", "Night sky", "Deep blacks, cool tone, brighter stars.", { exposure: 0.2, blacks: -24, contrast: 26, dehaze: 20, temperature: -16, clarity: 20, vibrance: 14, vignette: 14 }, {}, "night sky stars astro astrophotography"),
      L("nat", "Milky Way", "Pull out the galactic core, tame noise.", { contrast: 22, clarity: 30, dehaze: 28, vibrance: 26, temperature: -8, shadows: 14, nrLuma: 22 }, {}, "milky way galaxy core nebula"),
      L("nat", "Moon", "Detail in craters, neutral grey.", { clarity: 40, texture: 24, contrast: 22, saturation: -40, sharpAmount: 40 }, {}, "moon lunar craters"),
    ] },
    { name: "Sky", looks: [
      L("nat", "Blue sky", "Deeper blue, whiter clouds, less haze.", { dehaze: 26, contrast: 12, vibrance: 22, temperature: -6, highlights: -16, clarity: 10 }, {}, "blue sky clear day clouds"),
      L("nat", "Sunset", "Warm amber glow, rich highlights.", { temperature: 26, tint: 6, vibrance: 28, highlights: -18, contrast: 12, halation: 14, gradeHiH: -10, gradeHiS: 30 }, {}, "sunset sunrise golden hour dusk dawn orange"),
      L("nat", "Stormy", "Heavy, dramatic, desaturated.", { contrast: 28, clarity: 28, dehaze: 18, saturation: -16, highlights: -22, vignette: 24, temperature: -6 }, {}, "storm stormy dramatic moody clouds thunder"),
    ] },
    { name: "Flora", looks: [
      L("nat", "Flowers", "Vibrant petals, gentle glow.", { vibrance: 34, saturation: 8, softFocus: 14, clarity: 6, contrast: 6 }, {}, "flower flowers bloom petals garden blossom"),
      L("nat", "Forest", "Deep greens, moody light.", { contrast: 12, dehaze: 12, shadows: 10, vibrance: 20, gradeShH: -80, gradeShS: 18, highlights: -10, vignette: 16 }, {}, "forest trees woods jungle green leaves"),
      L("nat", "Autumn", "Warm oranges and golds.", { temperature: 22, vibrance: 30, contrast: 10, gradeHiH: -10, gradeHiS: 24, saturation: 6 }, {}, "autumn fall orange gold leaves"),
    ] },
  ] },
  { id: "portrait", name: "Portrait", blurb: "People: skin, light and mood.", groups: [{ name: "Looks", looks: [
    L("por", "Natural skin", "Gentle, true skin tones.", { contrast: 4, highlights: -8, shadows: 8, vibrance: 8, clarity: -6 }, {}, "natural skin face clean"),
    L("por", "Glamour", "Soft glow, bright and polished.", { softFocus: 30, bloom: 18, exposure: 0.15, contrast: -4, clarity: -10, saturation: 4 }, {}, "glamour beauty fashion soft glow polished"),
    L("por", "Moody", "Dark, directional, rich.", { exposure: -0.25, contrast: 20, shadows: -10, vignette: 28, saturation: -8, grain: 10 }, {}, "moody dark dramatic rich"),
    L("por", "High key", "Bright, airy, low contrast.", { exposure: 0.55, contrast: -12, shadows: 28, whites: 16, saturation: -8 }, {}, "high key bright airy light clean white"),
    L("por", "Golden hour", "Warm sun on skin.", { temperature: 24, highlights: -10, shadows: 10, vibrance: 14, halation: 12, gradeHiH: -4, gradeHiS: 24 }, {}, "golden hour warm sun glow"),
  ] }] },
  { id: "street", name: "Street and night", blurb: "City light, grit and neon.", groups: [{ name: "Looks", looks: [
    L("str", "Gritty", "Contrasty, textured, desaturated.", { contrast: 26, clarity: 26, texture: 18, saturation: -20, grain: 24, vignette: 18 }, {}, "gritty grunge raw street documentary"),
    L("str", "Neon night", "Magenta and cyan, glowing lights.", { contrast: 16, saturation: 18, bloom: 28, gradeShH: -30, gradeShS: 38, gradeHiH: 90, gradeHiS: 36, blacks: -10 }, {}, "neon night city cyberpunk lights"),
    L("str", "Film street", "Warm film stock, grain, faded blacks.", { fade: 26, grain: 26, temperature: 10, saturation: -10, contrast: 8 }, {}, "film kodak analog street"),
    L("str", "Rainy city", "Cool, wet, reflective.", { temperature: -12, contrast: 14, clarity: 14, dehaze: 10, saturation: -8, shadows: 8 }, {}, "rain rainy wet city cool"),
  ] }] },
  { id: "landscape", name: "Landscape", blurb: "Scenery, depth and drama.", groups: [{ name: "Looks", looks: [
    L("lan", "Vivid", "Saturated, sharp, punchy.", { vibrance: 30, saturation: 10, clarity: 16, contrast: 14, dehaze: 12 }, {}, "vivid punchy colourful"),
    L("lan", "Misty", "Soft haze, low contrast, pastel.", { dehaze: -22, contrast: -10, fade: 22, saturation: -8, softFocus: 14 }, {}, "misty fog soft haze pastel"),
    L("lan", "Dramatic", "Deep contrast and local punch.", { contrast: 30, clarity: 30, dehaze: 16, highlights: -22, vignette: 22, saturation: -6 }, {}, "dramatic hdr bold epic"),
    L("lan", "Desert", "Warm, golden, crisp.", { temperature: 22, contrast: 14, clarity: 14, vibrance: 14, dehaze: 14 }, {}, "desert dune sand warm arid"),
    L("lan", "Snow", "Clean whites, cool shadows.", { exposure: 0.3, whites: 12, temperature: -10, contrast: 8, dehaze: 8, gradeShH: 0, gradeShS: 14 }, {}, "snow winter ice white cold arctic"),
  ] }] },
];
export const allLooks = () => FAMILIES.flatMap((f) => f.groups.flatMap((g) => g.looks.map((l) => ({ ...l, family: f.id, group: g.name }))));
/** Match free text to a variant by word overlap (name, alias, description). Returns the best match and its score, or null. */
export function matchLook(familyId: string, text: string) {
  const words = text.toLowerCase().replace(/[^a-z0-9& -]/g, " ").split(/\s+/).filter((w) => w.length > 1); if (!words.length) return null;
  let best: { look: ReturnType<typeof allLooks>[number]; score: number } | null = null;
  for (const l of allLooks()) { if (l.family !== familyId) continue; const hay = ` ${l.name} ${l.alias} ${l.desc} `.toLowerCase(); let sc = 0;
    for (const w of words) { if (l.name.toLowerCase().split(/\s+/).includes(w)) sc += 3; else if (l.alias.split(/\s+/).includes(w)) sc += 2; else if (hay.includes(w)) sc += 1; }
    if (sc > 0 && (!best || sc > best.score)) best = { look: l, score: sc }; }
  return best;
}
