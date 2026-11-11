"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { useThumbs } from "@/components/useThumbs";
import { FeedbackEntry, RefPhoto, clearFeedback, deleteFeedback, deleteRef, listFeedback, listRefs, updateRef } from "@/lib/store";
import { MAX_REF_BYTES, addReference } from "@/lib/library";
import { describeStyle, StyleProfile } from "@/lib/reference";
import { describeLearned, learnBias, learnedProfile } from "@/lib/learn";

export default function Library() {
  const [refs, setRefs] = useState<RefPhoto[]>([]); const [fb, setFb] = useState<FeedbackEntry[]>([]); const [msgs, setMsgs] = useState<string[]>([]); const [busy, setBusy] = useState(false); const input = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => { setRefs(await listRefs()); setFb(await listFeedback()); }, []);
  useEffect(() => { load(); }, [load]);
  const upload = async (files: FileList | File[]) => { setBusy(true); const errs: string[] = []; for (const f of Array.from(files)) { const r = await addReference(f); if (!r.ok) errs.push(r.error); } setMsgs(errs); setBusy(false); load(); };
  const thumbs = useThumbs(refs); const target = learnedProfile(refs), learned = learnBias(fb, "unknown");
  return (
    <Shell><div data-testid="library" className="px-8 py-6 max-w-6xl mx-auto">
        <h1 className="text-[20px] font-semibold mb-4">Style library</h1>
        <div className="rounded-lg border border-line bg-panel p-4 mb-6 text-xs text-mute">
          <p className="text-ink mb-1">How "learning" works here</p>
          <p>Upload photographs whose look you like (already edited, up to 12 MB each). Lumen measures them and keeps only numbers (tone, colour, contrast, sharpness) plus a small thumbnail. It also remembers the feedback you give on your own edits. Both feed a stored profile that nudges the planner. It is <b className="text-ink">not</b> neural-network training, and nothing leaves this browser.</p>
        </div>
        <div className="rounded-lg border border-dashed border-line p-8 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}>
          <p className="text-ink">Drop reference photographs here</p><p className="text-mute text-xs mt-1">JPEG, PNG, WebP. Max {MAX_REF_BYTES / 1048576} MB each.</p>
          <button className="btn mt-3" onClick={() => input.current?.click()}>Choose files</button>
          <input data-testid="lib-input" ref={input} type="file" multiple accept="image/*" hidden onChange={(e) => e.target.files && upload(e.target.files)} />
        </div>
        {busy && <p className="text-mute text-xs mt-2">Analysing…</p>}
        {msgs.map((m, i) => <p key={i} data-testid="lib-error" className="text-bad text-xs mt-2">{m}</p>)}
        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div><h2 className="text-mute text-xs uppercase tracking-widest mb-2">What I have learned</h2>
            <div data-testid="learned-panel" className="border border-line p-3 text-[12px] space-y-1">
              <p className="text-ink">From references ({refs.length})</p>
              {target ? describeStyle(target as StyleProfile).map((l, i) => <p key={i} className="text-mute">• {l}</p>) : <p className="text-mute">No references yet.</p>}
              <p className="text-ink pt-2">From your feedback ({fb.length})</p>
              {describeLearned(learned).map((l, i) => <p key={i} className="text-mute">• {l}</p>)}
              <p className="text-mute pt-2">Reference style is applied from the editor's Reference tab ("Learned style"). Feedback bias is added to each new plan as a visible, removable "Personal style (learned)" item.</p>
            </div></div>
          <div><div className="flex items-center justify-between mb-2"><h2 className="text-mute text-xs uppercase tracking-widest">Feedback history</h2>{fb.length > 0 && <button data-testid="fb-clear" onClick={async () => { await clearFeedback(); load(); }} className="text-[11px] text-mute hover:text-bad">Forget all feedback</button>}</div>
            <div className="border border-line p-3 text-[12px] space-y-2 max-h-72 overflow-auto">{fb.length === 0 ? <p className="text-mute">Nothing yet. Give feedback from the editor's Report tab.</p> : fb.map((e) => (
              <div key={e.id} data-testid="fb-row" className="border-b border-line pb-2"><div className="flex justify-between"><span className="text-ink">{e.projectName} <span className="text-mute">· {e.genre}</span></span><button onClick={async () => { await deleteFeedback(e.id); load(); }} className="text-mute hover:text-bad">Delete</button></div>
                <p className="text-mute">{e.liked === true ? "Liked" : e.liked === false ? "Did not like" : "No rating"}{e.comment ? ` · "${e.comment}"` : ""}{e.requests.length ? ` · asked for: ${e.requests.join("; ")}` : ""}</p></div>))}</div></div>
        </div>
        <h2 className="text-mute text-xs uppercase tracking-widest mt-8 mb-2">References ({refs.length})</h2>
        {refs.length === 0 ? <p className="text-mute text-xs">None yet.</p> : <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">{refs.map((r) => (
          <div key={r.id} data-testid="ref-card" className="border border-line bg-panel"><img alt={r.name} className="w-full aspect-[4/3] object-cover" src={thumbs[r.id]} />
            <div className="p-2 text-[11px]"><div className="truncate text-ink">{r.name}</div><div className="text-mute">{r.bytes ? (r.bytes / 1048576).toFixed(1) + " MB · " : ""}{describeStyle(r.profile as StyleProfile).slice(0, 2).join("; ")}</div>
              <input defaultValue={r.note ?? ""} placeholder="note (optional)" onBlur={async (e) => { await updateRef({ ...r, note: e.target.value }); }} className="w-full bg-bg border border-line p-1 mt-1 text-ink" />
              <button onClick={async () => { await deleteRef(r.id); load(); }} className="text-mute hover:text-bad mt-1">Delete</button></div></div>))}</div>}
      </div></Shell>
  );
}
