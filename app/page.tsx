"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "@/components/Shell";
import Icon from "@/components/Icon";
import { useThumbs } from "@/components/useThumbs";
import { ACCEPT, importMany } from "@/lib/import";
import { Project, listProjects } from "@/lib/store";
import registry from "@/data/registry.json";
import ConnectAgents from "@/components/ConnectAgents";

// Starter requests. Each one is phrased in words the offline interpreter really understands (lib/intent.ts).
const CATS: [string, string][] = [["Cinematic", "Moody and cinematic"], ["Nature", "Make the leaves richer and sharpen the subject"], ["Portrait", "Soft, warm and flattering"], ["Street", "Gritty, high contrast street look"], ["Landscape", "Dramatic sky, rich colour, recover the highlights"], ["Black & white", "Black and white with punch"], ["Retouch", "Remove the small distraction and clean it up"], ["Match a look", "Match the colour grade of my reference"]];
const STARTERS = ["Make it brighter and warmer", "Moody and cinematic", "Clean, natural and sharp", "Black and white with punch", "Teal and orange look", "Fix the tilt and recover the highlights"];

export default function Home() {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState<string[]>([]); const [drag, setDrag] = useState(false); const [hint, setHint] = useState("");
  const [projects, setProjects] = useState<Project[]>([]); const [theme, setThemeState] = useState<"ice" | "ember">("ice"); const [connect, setConnect] = useState(false);
  useEffect(() => { try { const t = localStorage.getItem("lumen-theme"); if (t === "ember" || t === "ice") setThemeState(t); } catch {} }, []);
  const setTheme = (t: "ice" | "ember") => { setThemeState(t); try { localStorage.setItem("lumen-theme", t); } catch {} };
  const load = useCallback(async () => setProjects(await listProjects()), []);
  useEffect(() => { load(); }, [load]);
  const thumbs = useThumbs(projects);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => { const u = files.map((f) => URL.createObjectURL(f)); setPreviews(u); return () => u.forEach(URL.revokeObjectURL); }, [files]);
  const add = (fl: FileList | File[]) => { setHint(""); const incoming = Array.from(fl); setFiles((x) => [...x, ...incoming.filter((f) => f.type.startsWith("image/") || /\.(dng|cr3|nef|arw|raf|tiff?|heic)$/i.test(f.name))].slice(0, 20)); };
  const go = async () => {
    if (!files.length) { setHint("Add a photo first. Use the + button or drop one here."); input.current?.click(); return; }
    setBusy(true); const { projects: made, errors } = await importMany(files); setErrs(errors);
    if (!made.length) { setBusy(false); return; }
    const q = text.trim() ? `&ask=${encodeURIComponent(text.trim())}` : "&auto=1"; // no request = let Lumen decide (simple AI edit)
    router.push(`/editor?id=${made[0].id}${q}`);
  };
  const counts = (registry as { status: string }[]).reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  return (
    <Shell onNew={() => input.current?.click()}>
      <input ref={input} data-testid="home-input" type="file" multiple accept={ACCEPT.join(",")} hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
      <div data-testid="landing" data-theme={theme} className="lm-home relative min-h-full overflow-hidden">
        <div aria-hidden className="lm-edge lm-edge-l" /><div aria-hidden className="lm-edge lm-edge-r" /><div aria-hidden className="lm-glow" />
        <div className="absolute right-5 top-4 z-10 flex items-center gap-1 rounded-full border border-line bg-panel/70 p-0.5 text-[11px] backdrop-blur" role="group" aria-label="Colour theme">
          {([["ice", "Blue-black"], ["ember", "Warm black"]] as const).map(([k, l]) => <button key={k} data-testid={`theme-${k}`} aria-pressed={theme === k} onClick={() => setTheme(k)} className={`rounded-full px-3 py-1 ${theme === k ? "bg-[var(--lm-acc)] font-semibold text-[#07090d]" : "text-mute hover:text-ink"}`}>{l}</button>)}</div>
        <div className="relative mx-auto max-w-[920px] px-8 pt-[10vh] pb-20">
          <div className="mb-5 flex justify-center"><button onClick={() => setConnect(true)} data-testid="home-connect" className="lm-pill"><span className="h-1.5 w-1.5 rounded-full bg-[var(--lm-acc)]" />Connect Claude Code, Codex or any agent<Icon name="plus" size={11} /></button></div>
          <h1 className="lm-title text-center text-[44px] font-semibold leading-[1.08] tracking-tight">What do you want to edit today?</h1>
          <p className="mx-auto mt-3 max-w-[560px] text-center text-[14px] leading-relaxed text-mute">Drop a photo, describe the look, and Lumen edits it with a real renderer. Targeted changes use masks. Everything stays adjustable and undoable.</p>
          <div data-testid="prompt-box" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
            className={`lm-prompt mt-9 rounded-2xl border p-3.5 ${drag ? "border-[var(--lm-acc)]" : "border-line"}`}>
            {files.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{files.map((f, i) => <div key={i} className="relative">
              <img alt={f.name} src={previews[i]} className="h-16 w-16 rounded-lg object-cover" />
              <button aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-panel2 text-mute hover:text-ink"><Icon name="close" size={10} /></button></div>)}</div>}
            <textarea data-testid="prompt-text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }} rows={2}
              placeholder={files.length ? "Describe the edit, e.g. warmer, more contrast, moody. Leave empty to let Lumen decide." : "Describe the edit you want, then add a photo with +"} className="w-full resize-none bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-mute" />
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-2"><button data-testid="home-add" title="Add photos" aria-label="Add photos" onClick={() => input.current?.click()} className="btn btn-ghost h-8 w-8 !p-0 border !border-line"><Icon name="plus" /></button>
                <span className="lm-pill !py-1 text-[11px]"><span className="h-1.5 w-1.5 rounded-full bg-[var(--lm-acc)]" />Lumen AI</span></div>
              <div className="flex items-center gap-3"><span className="text-[11px] text-mute">{files.length ? `${files.length} photo${files.length > 1 ? "s" : ""}` : "JPEG, PNG, WebP"}</span>
                <button data-testid="prompt-go" onClick={go} disabled={busy} className="lm-go h-9 rounded-lg px-5 text-[13px] font-semibold">{busy ? "Opening…" : text.trim() ? "Edit" : files.length ? "Let Lumen decide" : "Edit"}</button></div>
            </div>
          </div>
          {hint && <p className="mt-2 text-center text-[12px] text-warn">{hint}</p>}
          {errs.map((m, i) => <p key={i} className="mt-2 text-center text-[12px] text-bad">{m}</p>)}
          <div className="mt-5 flex flex-wrap justify-center gap-2" data-testid="home-cats">{CATS.map(([c, t]) => <button key={c} onClick={() => setText(t)} className="lm-chip">{c}</button>)}</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">{STARTERS.map((s) => <button key={s} onClick={() => setText(s)} className="rounded-full border border-line px-3 py-1 text-[12px] text-mute hover:border-[var(--lm-acc)] hover:text-ink">{s}</button>)}</div>

          <section className="mt-16">
            <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[14px] font-semibold">Continue editing</h2>{projects.length > 0 && <Link href="/projects" className="text-[12px] text-mute hover:text-ink">All projects</Link>}</div>
            {projects.length === 0 ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-[12px] text-mute">Nothing here yet. Your edited photos will show up here.</p> :
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{projects.slice(0, 8).map((p) => (
                <Link key={p.id} href={`/editor?id=${p.id}`} data-testid="recent" className="group block">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-panel ring-1 ring-transparent transition group-hover:ring-[var(--lm-acc)]">{thumbs[p.id] && <img alt={p.name} src={thumbs[p.id]} className="h-full w-full object-cover" />}</div>
                  <div className="mt-1.5 truncate text-[12px]">{p.name}</div><div className="text-[11px] text-mute">{p.history.length - 1} edit{p.history.length === 2 ? "" : "s"}</div></Link>))}</div>}
          </section>

          <section className="mt-14">
            <h2 className="mb-3 text-[14px] font-semibold">What Lumen can do</h2>
            <div className="grid gap-3 sm:grid-cols-3">{[
              ["Targeted edits with masks", "Say \"darken the leaves, sharpen the ant, keep the sunlight\" and Lumen builds masks and applies each change only there.", "/capabilities"],
              ["Match any grade", "Add stills or a named look. Lumen measures the grade, searches slider values with the real renderer, and reports how much closer it got.", "/library"],
              ["Effects with a choice of kind", "Cinematic, Nature, Portrait and more, each with variants you can type, a strength slider, and an optional mask.", "/capabilities"],
              ["Retouch", "Spot heal, clone and object removal that copies real patches from your own photo.", "/capabilities"],
              ["Export 360p to 8K, SDR or HDR", "Original-resolution export that carries every edit, in JPEG, PNG, WebP or TIFF.", "/projects"],
              ["Agents and MCP", `Let Claude Code, Codex or Antigravity drive Lumen. ${counts.implemented ?? 0} techniques implemented, ${counts.partial ?? 0} partial, the rest honestly labelled.`, "/capabilities"],
            ].map(([t, d, h]) => <Link key={t} href={h} className="lm-card rounded-xl border border-line p-4"><div className="text-[13px] font-medium">{t}</div><p className="mt-1 text-[12px] leading-relaxed text-mute">{d}</p></Link>)}</div>
          </section>
        </div>
        <ConnectAgents open={connect} onClose={() => setConnect(false)} />
      </div>
    </Shell>
  );
}
