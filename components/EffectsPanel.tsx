"use client";
import { useEffect, useMemo, useState } from "react";
import { EFFECTS, EFFECT_CATEGORIES, Effect, effectParamKeys } from "@/lib/effects";
import { FAMILIES, allLooks, matchLook } from "@/lib/looks";
import { FxItem, findEffect } from "@/lib/fx";
import { interpretRequest, mergeOps } from "@/lib/intent";
import { EditParams } from "@/lib/params";

const FAV_KEY = "lumen.fav-effects";
const loadFavs = (): string[] => { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; } };
const uid = () => Math.random().toString(36).slice(2, 9);
const famOf = (id: string) => allLooks().find((l) => l.id === id)?.family;

export default function EffectsPanel({ fx, setFx, onReset, layers = [] }: { fx: FxItem[]; setFx: (n: FxItem[]) => void; onReset: () => void; layers?: { id: string; name: string }[] }) {
  const [q, setQ] = useState(""); const [chip, setChip] = useState("All effects"); const [fam, setFam] = useState<string | null>(null); const [typed, setTyped] = useState(""); const [msg, setMsg] = useState("");
  const [favs, setFavs] = useState<string[]>([]); const [target, setTarget] = useState("");
  useEffect(() => setFavs(loadFavs()), []);
  const toggleFav = (id: string) => { const n = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]; setFavs(n); try { localStorage.setItem(FAV_KEY, JSON.stringify(n)); } catch {} };

  const add = (e: Effect, extra?: Partial<EditParams>, text?: string) => {
    const f = famOf(e.id); const keep = fx.filter((x) => (f ? famOf(x.effectId) !== f || x.target !== (target || undefined) : x.effectId !== e.id || x.target !== (target || undefined)));
    setFx([...keep, { uid: uid(), effectId: e.id, label: e.name, strength: 0.7, target: target || undefined, extra, text }]);
    const fm = f ? FAMILIES.find((x) => x.id === f)?.name : ""; setMsg(`${fm ? fm + ": " : ""}${e.name} added at 70%. Drag its strength below, or pick another variant to swap it.`);
  };
  const upd = (u: string, patch: Partial<FxItem>) => setFx(fx.map((x) => (x.uid === u ? { ...x, ...patch } : x)));
  const typedGo = () => { if (!fam || !typed.trim()) return; const m = matchLook(fam, typed);
    const mods = interpretRequest(typed); const extra = mergeOps(mods.ops) as Partial<EditParams>; const hasExtra = Object.keys(extra).length > 0;
    if (m) { add(m.look, hasExtra ? extra : undefined, typed); setMsg(`Matched "${m.look.name}"${hasExtra ? ` plus your words (${mods.ops.map((o) => o.label).join(", ")})` : ""}. Strength is adjustable below.`); }
    else if (hasExtra) { const base = FAMILIES.find((f) => f.id === fam)!.groups[0].looks[0]; add(base, extra, typed); setMsg(`No variant named like that, so I used "${base.name}" with your words (${mods.ops.map((o) => o.label).join(", ")}).`); }
    else setMsg(`I could not match "${typed}" to a variant. Pick one below, or try words like old, modern, sci-fi, bird, sunset.`); };

  const tools = useMemo(() => EFFECTS.filter((e) => (chip === "All effects" ? true : chip === "Favorites" ? favs.includes(e.id) : e.category === chip) && (!q || (e.name + " " + e.desc + " " + e.category).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name)), [q, chip, favs]);
  const looksHit = useMemo(() => (q ? allLooks().filter((l) => (l.name + " " + l.alias + " " + l.desc).toLowerCase().includes(q.toLowerCase())) : []), [q]);
  const chips = ["All effects", "Favorites", ...EFFECT_CATEGORIES.filter((c) => EFFECTS.some((e) => e.category === c))];
  const F = fam ? FAMILIES.find((f) => f.id === fam) : null;

  return (
    <div data-testid="effects-panel" className="text-[12px]">
      {fx.length > 0 && <div data-testid="fx-stack" className="border-b border-line p-3">
        <div className="mb-2 flex items-center justify-between"><span className="cap">Active effects ({fx.length})</span><button data-testid="fx-clear" onClick={() => setFx([])} className="text-[11px] text-mute hover:text-ink">Remove all</button></div>
        <div className="space-y-2.5">{fx.map((it) => <div key={it.uid} data-testid="fx-item" className="rounded-lg border border-line bg-panel2 p-2.5">
          <div className="flex items-center justify-between"><span className="font-medium">{it.label}{it.text ? <span className="ml-1 font-normal text-mute">"{it.text}"</span> : null}</span><button aria-label={`Remove ${it.label}`} onClick={() => setFx(fx.filter((x) => x.uid !== it.uid))} className="text-mute hover:text-ink">×</button></div>
          <div className="mt-1.5 flex items-center gap-2"><input data-testid="fx-item-strength" type="range" min={0} max={100} value={Math.round(it.strength * 100)} onChange={(e) => upd(it.uid, { strength: +e.target.value / 100 })} className="flex-1" /><span className="w-9 text-right tabular-nums text-mute">{Math.round(it.strength * 100)}%</span></div>
          <select value={it.target ?? ""} onChange={(e) => upd(it.uid, { target: e.target.value || undefined })} className="fld mt-1.5 w-full"><option value="">Whole photo</option>{layers.map((l) => <option key={l.id} value={l.id}>Only inside mask: {l.name}</option>)}</select>
        </div>)}</div></div>}

      <div className="p-3">
        {!F ? <>
          <input data-testid="fx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search looks and effects" className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 outline-none focus:border-acc" />
          {layers.length > 0 && <label className="mt-2 block text-[11px] text-mute">New effects go to<select data-testid="fx-target" value={target} onChange={(e) => setTarget(e.target.value)} className="fld mt-1 w-full"><option value="">Whole photo</option>{layers.map((l) => <option key={l.id} value={l.id}>Only inside mask: {l.name}</option>)}</select></label>}
          {looksHit.length > 0 && <div className="mt-3 space-y-1">{looksHit.map((l) => <button key={l.id} onClick={() => add(l)} className="block w-full rounded border border-line px-2.5 py-1.5 text-left hover:border-acc"><span className="text-ink">{l.name}</span> <span className="text-mute">{FAMILIES.find((f) => f.id === l.family)?.name} / {l.group}</span></button>)}</div>}
          {!q && <><h4 className="cap mb-2 mt-4">Looks</h4>
            <div className="grid grid-cols-2 gap-2">{FAMILIES.map((f) => <button key={f.id} data-testid={`fam-${f.id}`} onClick={() => { setFam(f.id); setTyped(""); setMsg(""); }} className="rounded-lg border border-line bg-panel2 p-3 text-left transition hover:border-acc">
              <div className="text-[13px] font-medium">{f.name}</div><div className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-mute">{f.blurb}</div><div className="mt-1.5 text-[10px] text-mute">{f.groups.reduce((n, g) => n + g.looks.length, 0)} variants</div></button>)}</div></>}
          <h4 className="cap mb-2 mt-5">Tools</h4>
          <div className="mb-2 flex flex-wrap gap-1.5">{chips.map((c) => <button key={c} data-testid={`fx-chip-${c}`} onClick={() => setChip(c)} className={`rounded-full border px-2.5 py-0.5 text-[11px] ${chip === c ? "border-acc text-ink" : "border-line text-mute hover:text-ink"}`}>{c}</button>)}</div>
          <div className="grid grid-cols-2 gap-2">{tools.map((e) => <div key={e.id} data-testid={`fx-${e.id}`} className="group relative rounded-lg border border-line bg-panel2 p-2.5 hover:border-acc">
            <button data-testid={`fx-apply-${e.id}`} onClick={() => add(e)} className="block w-full text-left"><div className="font-medium">{e.name}</div><div className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-mute">{e.desc}</div><div className="mt-1 text-[10px] text-mute">{effectParamKeys(e).length ? `Sets ${effectParamKeys(e).slice(0, 3).join(", ")}${effectParamKeys(e).length > 3 ? "…" : ""}` : "Crop only"}</div></button>
            <button aria-label="Favorite" data-testid={`fx-fav-${e.id}`} onClick={() => toggleFav(e.id)} className={`absolute right-1.5 top-1.5 text-[13px] ${favs.includes(e.id) ? "text-warn" : "text-mute opacity-0 group-hover:opacity-100"}`}>{favs.includes(e.id) ? "★" : "☆"}</button>
            {e.note && <div className="mt-1 text-[10px] text-warn">{e.note}</div>}</div>)}</div>
          {tools.length === 0 && <p className="mt-4 text-center text-mute">No effects match.</p>}
        </> : <>
          <button data-testid="fam-back" onClick={() => setFam(null)} className="text-[11px] text-mute hover:text-ink">← All looks</button>
          <h3 className="mt-2 text-[16px] font-semibold">{F.name}</h3><p className="mt-0.5 text-mute">{F.blurb}</p>
          <div className="mt-3 flex gap-2"><input data-testid="fam-type" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") typedGo(); }} placeholder={`Type it: ${fam === "nature" ? "ant, bird, sunset, milky way" : fam === "cinematic" ? "old, sci-fi, B&W, warmer" : "a style or subject"}`} className="min-w-0 flex-1 rounded-lg border border-line bg-panel2 px-3 py-2 outline-none focus:border-acc" /><button data-testid="fam-go" onClick={typedGo} disabled={!typed.trim()} className="btn btn-primary">Go</button></div>
          {F.groups.map((g) => <div key={g.name} className="mt-4">{F.groups.length > 1 && <h4 className="cap mb-1.5">{g.name}</h4>}
            <div className="grid grid-cols-2 gap-2">{g.looks.map((l) => { const on = fx.some((x) => x.effectId === l.id); return <button key={l.id} data-testid={`look-${l.id}`} onClick={() => add(l)} className={`rounded-lg border p-2.5 text-left transition ${on ? "border-acc bg-acc/10" : "border-line bg-panel2 hover:border-acc"}`}><div className="font-medium">{l.name}</div><div className="mt-0.5 line-clamp-3 text-[10.5px] leading-snug text-mute">{l.desc}</div></button>; })}</div></div>)}
        </>}
        <p data-testid="fx-msg" className="mt-3 text-[11px] leading-relaxed text-mute">{msg || "Effects are adjustable: each one keeps its own strength, applies on top of your edit and exports exactly as you see it."}</p>
        <button onClick={onReset} className="mt-2 text-[11px] text-acc hover:underline">Reset my edits</button>
      </div>
    </div>
  );
}
