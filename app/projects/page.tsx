"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { useThumbs } from "@/components/useThumbs";
import { ACCEPT, importMany } from "@/lib/import";
import { Preset, Project, applyPresetToProject, deleteProject, duplicateProject, getProject, listPresets, listProjects } from "@/lib/store";
import { FORMATS, extFor } from "@/lib/export";
import { analyseBitmap, download, renderExport, resolveState, statsLine } from "@/lib/pipeline";
import { RESOLUTIONS } from "@/lib/resample";
import { zipStore } from "@/lib/zip";

export default function Projects() {
  const input = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]); const [msgs, setMsgs] = useState<string[]>([]); const [drag, setDrag] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [presets, setPresets] = useState<Preset[]>([]); const [presetId, setPresetId] = useState("");
  const [bo, setBo] = useState({ fmt: "image/jpeg", q: 90, edge: 2048, wm: "" }); const [busy, setBusy] = useState(""); const [batchMsg, setBatchMsg] = useState("");
  const refresh = useCallback(async () => setProjects(await listProjects()), []);
  useEffect(() => { refresh(); listPresets().then(setPresets); }, [refresh]);
  const thumbs = useThumbs(projects);
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const handle = async (files: FileList | File[]) => { const r = await importMany(files); setMsgs(r.errors); refresh(); };

  const applyBatchPreset = async () => { const pr = presets.find((x) => x.id === presetId); if (!pr) return; setBusy("Applying…"); for (const id of sel) await applyPresetToProject(id, pr); await refresh(); setBusy(""); setBatchMsg(`Applied "${pr.name}" to ${sel.size} photo${sel.size > 1 ? "s" : ""}. Each keeps its own AI recipe, crop and geometry.`); };

  /** Renders the given project ids. One photo downloads as a plain image file; only two or more are bundled into a ZIP. */
  const exportIds = async (ids: string[], opts = bo) => {
    const files: { name: string; data: Uint8Array; blob: Blob }[] = [], lines: string[] = [], used = new Map<string, number>(), fails: string[] = []; let i = 0;
    for (const id of ids) { i++; const pj = await getProject(id); if (!pj) continue; setBusy(`Exporting ${i}/${ids.length}: ${pj.name}`);
      try { const b = await createImageBitmap(pj.original, { imageOrientation: "from-image" }); const st = resolveState(pj, analyseBitmap(b));
        const r = await renderExport(b, pj.width, pj.height, st, { fmt: opts.fmt, q: opts.q, edge: opts.edge, watermark: opts.wm.trim() ? { text: opts.wm, pos: "br", size: 3, opacity: 70 } : undefined }); b.close();
        lines.push(statsLine(r.stats)); const n = used.get(pj.name) ?? 0; used.set(pj.name, n + 1); files.push({ name: `${pj.name}${n ? `-${n + 1}` : ""}-edit.${extFor(opts.fmt)}`, blob: r.blob, data: new Uint8Array(await r.blob.arrayBuffer()) });
      } catch (e: any) { fails.push(`${pj.name}: ${e.message}`); } }
    let where = "";
    if (files.length === 1) { download(files[0].blob, files[0].name); where = files[0].name; }
    else if (files.length > 1) { download(new Blob([zipStore(files.map((f) => ({ name: f.name, data: f.data }))) as BlobPart], { type: "application/zip" }), "lumen-batch.zip"); where = "lumen-batch.zip"; }
    setBusy(""); setBatchMsg(`Exported ${files.length} of ${ids.length}${where ? " as " + where : ""} (8-bit sRGB, metadata stripped). ${files.length === 1 ? lines[0] : ""}${fails.length ? " Failed: " + fails.join("; ") : ""}`);
  };

  return (
    <Shell onNew={() => input.current?.click()}>
      <input ref={input} type="file" multiple accept={ACCEPT.join(",")} hidden onChange={(e) => { if (e.target.files) handle(e.target.files); e.target.value = ""; }} />
      <div className="px-8 py-6 min-h-full" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}>
        <div className="flex items-end justify-between"><div><h1 className="text-[20px] font-semibold">Projects</h1><p className="mt-1 text-[12px] text-mute">{projects.length} photo{projects.length === 1 ? "" : "s"}. Stored in this browser only; originals are never modified.</p></div>
          <button className="btn btn-primary" onClick={() => input.current?.click()}><Icon name="plus" size={14} />Add photos</button></div>
        {drag && <div className="mt-4 rounded-lg border border-dashed border-acc p-6 text-center text-[12px] text-acc">Drop to import</div>}
        {msgs.map((m, i) => <p key={i} className="mt-2 text-[12px] text-bad">{m}</p>)}

        {sel.size > 0 && <div data-testid="batch-bar" className="sticky top-0 z-10 mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-acc/60 bg-panel p-3 text-[12px]">
          <span className="self-center font-medium text-acc">{sel.size} selected</span>
          <label className="text-mute">Preset<select data-testid="batch-preset" value={presetId} onChange={(e) => setPresetId(e.target.value)} className="fld mt-1 block !w-44"><option value="">{presets.length ? "Choose…" : "No presets yet"}</option>{presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <button data-testid="batch-apply" disabled={!presetId || !!busy} onClick={applyBatchPreset} className="btn">Apply preset</button>
          <span className="w-px self-stretch bg-line" />
          <label className="text-mute">Format<select data-testid="batch-fmt" value={bo.fmt} onChange={(e) => setBo({ ...bo, fmt: e.target.value })} className="fld mt-1 block !w-40">{FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
          <label className="text-mute">Resolution<select data-testid="batch-res" value={RESOLUTIONS.find((r) => r.edge === bo.edge)?.value ?? "custom"} onChange={(e) => { const r = RESOLUTIONS.find((x) => x.value === e.target.value); if (r && r.edge >= 0) setBo({ ...bo, edge: r.edge }); }} className="fld mt-1 block !w-44">{RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
          <label className="text-mute">Long edge px<input data-testid="batch-edge" type="number" min={0} value={bo.edge} onChange={(e) => setBo({ ...bo, edge: Math.max(0, +e.target.value) })} className="fld mt-1 block !w-24" /></label>
          <label className="text-mute">Watermark<input data-testid="batch-wm" value={bo.wm} onChange={(e) => setBo({ ...bo, wm: e.target.value })} placeholder="optional text" className="fld mt-1 block !w-36" /></label>
          <button data-testid="batch-export" disabled={!!busy} onClick={() => exportIds([...sel])} className="btn btn-primary">{sel.size === 1 ? "Export image" : `Export ${sel.size} (ZIP)`}</button>
          <button onClick={() => setSel(new Set())} className="btn btn-ghost">Clear</button>
          {(busy || batchMsg) && <p data-testid="batch-msg" className="w-full text-mute">{busy || batchMsg}</p>}
        </div>}

        {projects.length === 0 ? <div className="mt-8 rounded-lg border border-dashed border-line p-12 text-center"><p className="text-[14px]">No photos yet</p><p className="mt-1 text-[12px] text-mute">Drop photos anywhere on this page, or use Add photos.</p></div> :
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{projects.map((p) => (
            <div key={p.id} className={`group rounded-lg border bg-panel ${sel.has(p.id) ? "border-acc" : "border-line"}`}>
              <div className="relative">
                <Link href={`/editor?id=${p.id}`} className="block aspect-[4/3] overflow-hidden rounded-t-lg bg-bg">{thumbs[p.id] && <img alt={p.name} className="h-full w-full object-cover" src={thumbs[p.id]} />}</Link>
                <label className="absolute left-2 top-2 grid h-6 w-6 cursor-pointer place-items-center rounded bg-black/55 text-[11px]" title="Select"><input data-testid="sel" aria-label={`Select ${p.name}`} type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></label>
              </div>
              <div className="p-2.5"><div className="truncate text-[13px]">{p.name}</div>
                <div className="text-[11px] text-mute">{p.width}×{p.height} · {p.history.length - 1} edits{p.snapshots.length ? ` · ${p.snapshots.length} snapshots` : ""}</div>
                <div className="mt-2 flex gap-1 text-[11px]">
                  <button data-testid="quick-export" title="Export this photo as a JPEG" className="btn btn-ghost !px-2 !py-1" disabled={!!busy} onClick={() => exportIds([p.id], { ...bo, fmt: "image/jpeg", q: 92, edge: 0 })}>Export</button>
                  <button className="btn btn-ghost !px-2 !py-1" onClick={async () => { await duplicateProject(p.id); refresh(); }}>Copy</button>
                  <button className="btn btn-ghost !px-2 !py-1 hover:!text-bad" onClick={async () => { await deleteProject(p.id); setSel((s) => { const n = new Set(s); n.delete(p.id); return n; }); refresh(); }}>Delete</button></div></div>
            </div>))}</div>}
        {!sel.size && batchMsg && <p data-testid="batch-msg" className="mt-3 text-[12px] text-mute">{busy || batchMsg}</p>}
      </div>
    </Shell>
  );
}
