// Effects as a stack: each item has its own strength you can change at any time (not a click-to-add counter).
// The stack is resolved on top of the normal edit at render AND at export, so what you see is what you export.
import { EditParams } from "./params";
import { Effect, applyEffect, applyEffectToAdjust } from "./effects";
import { allLooks } from "./looks";
import { EFFECTS } from "./effects";
import { LocalLayer, zeroAdjust } from "./masks";

export interface FxItem { uid: string; effectId: string; label: string; strength: number; target?: string; extra?: Partial<EditParams>; text?: string }
export const findEffect = (id: string): Effect | undefined => EFFECTS.find((e) => e.id === id) ?? allLooks().find((l) => l.id === id);

export function resolveFx(params: EditParams, locals: LocalLayer[], fx: FxItem[] | undefined, dims: { w: number; h: number }): { params: EditParams; locals: LocalLayer[]; notes: string[] } {
  if (!fx?.length) return { params, locals, notes: [] };
  let p: any = { ...params }; let ls = locals; const notes: string[] = [];
  for (const it of fx) { const e = findEffect(it.effectId); if (!e) continue;
    if (it.target) { const t = ls.find((l) => l.id === it.target); if (!t) continue; const r = applyEffectToAdjust({ ...zeroAdjust(), ...t.adjust }, e, it.strength); ls = ls.map((l) => (l.id === t.id ? { ...l, adjust: r.adjust } : l)); if (r.skipped.length) notes.push(`${e.name} on ${t.name}: skipped ${r.skipped.join(", ")}`); continue; }
    p = applyEffect(p, e, it.strength, dims);
    for (const [k, v] of Object.entries(it.extra ?? {})) if (typeof v === "number") p[k] = (p[k] ?? 0) + v * it.strength; }
  return { params: p as EditParams, locals: ls, notes };
}
