// Named regions the assistant can aim an edit at ("the leaves", "the sky", "the subject"). Each one builds a REAL mask layer
// from Lumen's mask types (colour range, luminance range, gradient, subject ellipse). They are heuristic, and every layer says so.
import { LocalLayer, newLayer, skyLayer, subjectEllipse } from "./masks";
import type { Analysis } from "./analysis";

export interface Target { id: string; label: string; re: RegExp; build: (a?: Analysis | null) => LocalLayer | null; caveat: string }
const col = (name: string, hue: number, range: number, satMin: number, note: string) => () => { const l = newLayer("color", name); l.color = { on: true, hue, range, satMin }; l.feather = 0.5; l.note = note; return l; };
const lumL = (name: string, lo: number, hi: number) => () => { const l = newLayer("luminance", name); l.lum = { on: true, lo, hi, soft: 0.12 }; return l; };
export const TARGETS: Target[] = [
  { id: "sky", label: "Sky", re: /\b(the )?(sky|clouds?|heavens)\b/, build: () => skyLayer(), caveat: "Heuristic: top gradient limited to blue hues. Fails on grey or sunset skies." },
  { id: "foliage", label: "Foliage", re: /\b(the )?(leaf|leaves|foliage|grass|trees?|plants?|greens?|greenery|vegetation|bush(es)?|lawn|canopy)\b/, build: col("Foliage (green range)", 110, 55, 0.12, "Selects green hues anywhere in the frame (colour range). Not a pixel-exact leaf mask."), caveat: "Selects every green area, not only leaves." },
  { id: "water", label: "Water", re: /\b(the )?(water|ocean|sea|lake|river|pool)\b/, build: col("Water (blue-cyan range)", 200, 40, 0.1, "Selects blue-cyan hues. Reflections of other colours are not included."), caveat: "Selects blue-cyan hues only." },
  { id: "skin", label: "Skin", re: /\b(the )?(skin|skin ?tones?|complexion)\b/, build: col("Skin tones (colour range)", 22, 22, 0.1, "Selects orange-red skin hues. Also catches wood, sand and other warm colours."), caveat: "Also catches other warm colours." },
  { id: "shadows", label: "Shadows", re: /\b(the )?(shadows?|dark (areas|parts|regions)|darkest parts)\b/, build: lumL("Shadows (luminance range)", 0, 0.38), caveat: "Luminance range 0 to 38%." },
  { id: "highlights", label: "Highlights", re: /\b(the )?(highlights?|bright (areas|parts|regions)|brightest parts)\b/, build: lumL("Highlights (luminance range)", 0.62, 1), caveat: "Luminance range 62 to 100%." },
  { id: "midtones", label: "Midtones", re: /\b(the )?(midtones?|mid.?tones?)\b/, build: lumL("Midtones (luminance range)", 0.3, 0.7), caveat: "Luminance range 30 to 70%." },
  { id: "foreground", label: "Foreground", re: /\b(the )?(foreground|bottom of the (photo|image|frame))\b/, build: () => { const l = newLayer("linear", "Foreground (bottom gradient)"); l.linear = [0.5, 1, 0.5, 0.4]; l.feather = 0.6; l.note = "Gradient from the bottom edge."; return l; }, caveat: "Bottom gradient, not a depth mask." },
  { id: "background", label: "Background", re: /\b(the )?(background|backdrop|surroundings)\b/, build: (a) => (a?.subject ? subjectEllipse(a.subject, true) : null), caveat: "Everything outside an ellipse around the detected subject." },
  { id: "subject", label: "Subject", re: /\b(the )?(main )?(subject|person|people|man|woman|girl|boy|child|face|model|portrait|ants?|insects?|bugs?|bees?|butterfl\w+|birds?|dogs?|cats?|animals?|flowers?|car|building|object|focal point)\b/, build: (a) => (a?.subject ? subjectEllipse(a.subject, false) : null), caveat: "An ellipse around the detected subject box. Not a pixel-accurate cut-out, so it may include nearby background." },
];
export const findTarget = (clause: string) => { for (const t of TARGETS) { const m = clause.match(t.re); if (m) return { target: t, matched: m[0].trim() }; } return null; };
export const PRESERVE_RE = /\b(preserv\w*|keep\w*|protect\w*|maintain\w*|without (killing|touching|blowing|affecting|dulling|losing))\b[^,.;]*\b(sun\w*|highlights?|bright\w*|light)\b/;
