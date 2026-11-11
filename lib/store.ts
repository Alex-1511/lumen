// IndexedDB project store. The original file Blob is stored once and never rewritten.
import type { RetouchOp } from "./retouch";
import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { EditParams } from "./params";
import type { Genre, Intent } from "./planner";
import type { LocalLayer } from "./masks";
import type { EditEvent } from "./report";
import type { Learned } from "./learn";

export interface Snapshot { id: string; name: string; at: number; manual: Partial<EditParams>; aiOpacity: number; enabled: Record<string, boolean>; locals?: LocalLayer[] }
export interface HistoryEntry { label: string; manual: Partial<EditParams>; aiOpacity: number; enabled: Record<string, boolean>; at: number; locals?: LocalLayer[] }
export interface Project {
  id: string; name: string; created: number; updated: number; original: Blob; mime: string; width: number; height: number;
  exif?: Record<string, unknown>; thumb?: Blob; manual: Partial<EditParams>; aiOpacity: number; enabled: Record<string, boolean>; locals?: LocalLayer[]; retouch?: RetouchOp[]; lut?: import("./lut").LutState; fx?: import("./fx").FxItem[];
  genre: Genre; intent: Intent; ai?: Record<string, unknown>; log?: EditEvent[]; learned?: Learned | null; history: HistoryEntry[]; historyIndex: number; snapshots: Snapshot[]; parentId?: string;
}
/** A preset is a saved MANUAL layer (your own edits). It is applied on top of each photo's own AI recipe.
 *  Geometry and lens-optics values (crop, straighten, perspective, distortion, CA) are photo-specific and never saved. */
export interface Preset { id: string; name: string; created: number; manual: Partial<EditParams> }
export const PRESET_EXCLUDE = ["crop", "straighten", "perspV", "perspH", "distortion", "ca"] as const;
export function extractPreset(manual: Partial<EditParams>): Partial<EditParams> { const o: any = JSON.parse(JSON.stringify(manual)); for (const k of PRESET_EXCLUDE) delete o[k]; return o; }
export function applyPresetTo(manual: Partial<EditParams>, preset: Partial<EditParams>): Partial<EditParams> { return { ...manual, ...JSON.parse(JSON.stringify(preset)) }; }
export interface RefPhoto { id: string; name: string; created: number; thumb: Blob; profile: unknown; bytes?: number; note?: string; grade?: import("./gradefit").GradeStats }
/** One piece of feedback on a finished edit. `manual` = what you changed on top of the AI recipe; `correction` = the parsed meaning of your comment. */
export interface FeedbackEntry { id: string; projectId: string; projectName: string; at: number; genre: Genre; intent: Intent; liked: boolean | null; comment: string; requests: string[]; recipe: Partial<EditParams>; manual: Partial<EditParams>; correction: Partial<EditParams> }
interface Schema extends DBSchema { projects: { key: string; value: Project; indexes: { updated: number } }; refs: { key: string; value: RefPhoto }; presets: { key: string; value: Preset }; feedback: { key: string; value: FeedbackEntry } }
let dbp: Promise<IDBPDatabase<Schema>> | null = null;
const db = () => (dbp ??= openDB<Schema>("lumen", 4, { upgrade(d) { if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" }).createIndex("updated", "updated"); if (!d.objectStoreNames.contains("refs")) d.createObjectStore("refs", { keyPath: "id" }); if (!d.objectStoreNames.contains("presets")) d.createObjectStore("presets", { keyPath: "id" }); if (!d.objectStoreNames.contains("feedback")) d.createObjectStore("feedback", { keyPath: "id" }); } }));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export async function listProjects() { return (await (await db()).getAllFromIndex("projects", "updated")).reverse(); }
export async function getProject(id: string) { return (await db()).get("projects", id); }
export async function putProject(p: Project) { p.updated = Date.now(); await (await db()).put("projects", p); }
export async function deleteProject(id: string) { await (await db()).delete("projects", id); }
export async function duplicateProject(id: string) { const p = await getProject(id); if (!p) return; const c: Project = { ...p, id: uid(), name: p.name + " (copy)", created: Date.now(), parentId: p.id, history: [...p.history], snapshots: [...p.snapshots] }; await putProject(c); return c.id; }

export async function listRefs() { return (await (await db()).getAll("refs")).sort((a, b) => b.created - a.created); }
export async function putRef(r: RefPhoto) { await (await db()).put("refs", r); }
export async function deleteRef(id: string) { await (await db()).delete("refs", id); }

export async function listPresets() { return (await (await db()).getAll("presets")).sort((a, b) => b.created - a.created); }
export async function putPreset(p: Preset) { await (await db()).put("presets", p); }
export async function deletePreset(id: string) { await (await db()).delete("presets", id); }
/** Append a history entry to a stored project (used by batch apply). */
export async function applyPresetToProject(id: string, preset: Preset) {
  const p = await getProject(id); if (!p) return; const manual = applyPresetTo(p.manual, preset.manual);
  const entry: HistoryEntry = { label: "Preset: " + preset.name, manual, aiOpacity: p.aiOpacity, enabled: p.enabled, locals: p.locals, at: Date.now() };
  const history = [...p.history.slice(0, p.historyIndex + 1), entry]; await putProject({ ...p, manual, history, historyIndex: history.length - 1 });
}

export async function listFeedback() { return (await (await db()).getAll("feedback")).sort((a, b) => b.at - a.at); }
export async function putFeedback(f: FeedbackEntry) { await (await db()).put("feedback", f); }
export async function deleteFeedback(id: string) { await (await db()).delete("feedback", id); }
export async function clearFeedback() { await (await db()).clear("feedback"); }
export async function updateRef(r: RefPhoto) { await (await db()).put("refs", r); }
