"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { KEY_INFO } from "@/lib/report";
import { Preset, deletePreset, listPresets } from "@/lib/store";

const describe = (p: Preset) => Object.entries(p.manual).filter(([, v]) => v !== undefined && v !== 0 && v !== false).slice(0, 8).map(([k, v]) => `${KEY_INFO[k]?.label ?? k}${typeof v === "number" ? " " + (v > 0 ? "+" : "") + Math.round(v * 100) / 100 : ""}`).join(", ") || "empty";
export default function Presets() {
  const [list, setList] = useState<Preset[]>([]);
  useEffect(() => { listPresets().then(setList); }, []);
  return (
    <Shell>
      <div className="mx-auto max-w-[820px] px-8 py-6">
        <h1 className="text-[20px] font-semibold">Presets</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-mute">A preset stores your manual edits only (not the AI recipe, crop, straighten or lens optics), so it sits on top of each photo's own recipe. Save one from the Looks tab in the editor. Apply it to many photos from Projects.</p>
        {list.length === 0 ? <div className="mt-6 rounded-lg border border-dashed border-line p-10 text-center text-[12px] text-mute">No presets yet. Edit a photo, then save your adjustments as a look.</div> :
          <div className="mt-5 divide-y divide-line rounded-lg border border-line bg-panel">{list.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><div className="truncate text-[13px]">{p.name}</div><div className="truncate text-[11px] text-mute">{describe(p)}</div></div>
              <button className="btn btn-ghost hover:!text-bad" onClick={async () => { await deletePreset(p.id); setList(await listPresets()); }}>Delete</button></div>))}</div>}
        <p className="mt-4 text-[12px] text-mute"><Link href="/projects" className="text-acc hover:underline">Go to Projects</Link> to apply a preset to a selection of photos.</p>
      </div>
    </Shell>
  );
}
