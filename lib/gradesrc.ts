// Helpers for turning several still frames (uploads, links, library photos) into ONE measured reference grade.
// Day and night frames are separated by median luma so a "night" scene is never graded toward a "day" frame.
import { GradeStats, gradeStatsOf } from "./gradefit";

export function averageStats(list: GradeStats[]): GradeStats | null {
  if (!list.length) return null; const n = list.length;
  const pct = list[0].pct.map((_, i) => list.reduce((s, g) => s + g.pct[i], 0) / n);
  const zones = [0, 1, 2].map((k) => ({ w: list.reduce((s, g) => s + g.zones[k].w, 0) / n, a: list.reduce((s, g) => s + g.zones[k].a, 0) / n, b: list.reduce((s, g) => s + g.zones[k].b, 0) / n, sat: list.reduce((s, g) => s + g.zones[k].sat, 0) / n }));
  return { pct, zones, meanSat: list.reduce((s, g) => s + g.meanSat, 0) / n, mono: list.filter((g) => g.mono).length > n / 2 };
}
/** Median luma below this is treated as a night / low-key frame. */
export const NIGHT_MEDIAN = 0.28;
export function splitDayNight(list: GradeStats[]) { return { night: list.filter((g) => g.pct[3] < NIGHT_MEDIAN), day: list.filter((g) => g.pct[3] >= NIGHT_MEDIAN) }; }
/** Pick the reference set that matches the photo being graded. Falls back to everything when one side is missing. */
export function pickFor(list: GradeStats[], photoMedian: number): { stats: GradeStats | null; used: "day" | "night" | "all"; count: number } {
  const { day, night } = splitDayNight(list); const wantNight = photoMedian < NIGHT_MEDIAN; const pool = wantNight ? night : day;
  if (pool.length) return { stats: averageStats(pool), used: wantNight ? "night" : "day", count: pool.length };
  return { stats: averageStats(list), used: "all", count: list.length };
}
export async function statsFromBlob(blob: Blob): Promise<GradeStats> {
  const b = await createImageBitmap(blob, { imageOrientation: "from-image" }); const s = Math.min(1, 320 / Math.max(b.width, b.height)); const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(b.width * s)); c.height = Math.max(1, Math.round(b.height * s));
  const x = c.getContext("2d", { willReadFrequently: true })!; x.drawImage(b, 0, 0, c.width, c.height); b.close(); return gradeStatsOf(x.getImageData(0, 0, c.width, c.height).data);
}
