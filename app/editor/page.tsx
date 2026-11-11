"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import CurveEditor from "@/components/CurveEditor";
import EffectsPanel from "@/components/EffectsPanel";
import GradePanel from "@/components/GradePanel";
import AiEditPanel from "@/components/AiEditPanel";
import { importMany } from "@/lib/import";
import { drawScope } from "@/lib/scopes";
import { TARGETS } from "@/lib/targets";
import RetouchOverlay, { RMode } from "@/components/RetouchOverlay";
import { RETOUCH_LABEL, RetouchOp, retouchedCanvas } from "@/lib/retouch";
import { focusFrom } from "@/lib/effects";
import { FxItem, resolveFx } from "@/lib/fx";
import Icon from "@/components/Icon";
import AiStatus from "@/components/AiStatus";
import { useThumbs } from "@/components/useThumbs";
import { FORMATS, WmPos, extFor } from "@/lib/export";
import { download, renderExport, statsLine } from "@/lib/pipeline";
import { RESOLUTIONS, edgeFor } from "@/lib/resample";
import { IntentResult, interpretRequest, mergeOps } from "@/lib/intent";
import { EditEvent, KEY_INFO, buildReport, reportToMarkdown } from "@/lib/report";
import { LEARN_KEYS, Learned, describeLearned, learnBias, learnedProfile } from "@/lib/learn";
import { MAX_REF_BYTES, addReference } from "@/lib/library";
import { useSearchParams } from "next/navigation";
import { EditParams, HSL_BANDS, compose, defaultParams, manualDeltaFor, clamp } from "@/lib/params";
import { Renderer } from "@/lib/renderer";
import { Analysis, analyse } from "@/lib/analysis";
import { Genre, Intent, Plan, plan as makePlan, recipeLocals, recipeToParams } from "@/lib/planner";
import { ADJUST_KEYS, LocalAdjust, LocalLayer, MAX_LOCALS, MapCtx, newLayer, zeroAdjust, outToSrc, rasteriseStrokes, skyLayer, srcToOut, subjectEllipse } from "@/lib/masks";
import { FeedbackEntry, HistoryEntry, Preset, Project, RefPhoto, applyPresetTo, deletePreset, extractPreset, getProject, listProjects, listFeedback, listPresets, listRefs, putFeedback, putPreset, putProject, putRef, uid } from "@/lib/store";
import { MatchResult, matchReference, styleProfile, StyleProfile, describeStyle } from "@/lib/reference";

type NumKey = "exposure" | "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "temperature" | "tint" | "vibrance" | "saturation" | "texture" | "clarity" | "sharpAmount" | "nrLuma" | "nrColor" | "vignette" | "grain" | "straighten" | "dehaze" | "bloom" | "halation" | "distortion" | "ca" | "perspV" | "perspH" | "gradeShH" | "gradeShS" | "gradeHiH" | "gradeHiS" | "gradeBal";
const GROUPS: { title: string; items: { k: NumKey; label: string; min: number; max: number; step: number }[] }[] = [
  { title: "Light", items: [
    { k: "exposure", label: "Exposure", min: -3, max: 3, step: 0.01 }, { k: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
    { k: "highlights", label: "Highlights", min: -100, max: 100, step: 1 }, { k: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
    { k: "whites", label: "Whites", min: -100, max: 100, step: 1 }, { k: "blacks", label: "Blacks", min: -100, max: 100, step: 1 }] },
  { title: "Colour", items: [
    { k: "temperature", label: "Temperature", min: -100, max: 100, step: 1 }, { k: "tint", label: "Tint", min: -100, max: 100, step: 1 },
    { k: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1 }, { k: "saturation", label: "Saturation", min: -100, max: 100, step: 1 }] },
  { title: "Effects", items: [
    { k: "texture", label: "Texture", min: -100, max: 100, step: 1 }, { k: "clarity", label: "Clarity", min: -100, max: 100, step: 1 },
    { k: "vignette", label: "Vignette", min: -100, max: 100, step: 1 }, { k: "grain", label: "Grain", min: 0, max: 100, step: 1 },
    { k: "dehaze", label: "Dehaze", min: 0, max: 100, step: 1 }, { k: "bloom", label: "Bloom", min: 0, max: 100, step: 1 }, { k: "halation", label: "Halation", min: 0, max: 100, step: 1 }] },
  { title: "Colour grading", items: [{ k: "gradeShS", label: "Shadows tint", min: 0, max: 100, step: 1 }, { k: "gradeShH", label: "Shadows hue", min: 0, max: 360, step: 1 }, { k: "gradeHiS", label: "Highlights tint", min: 0, max: 100, step: 1 }, { k: "gradeHiH", label: "Highlights hue", min: 0, max: 360, step: 1 }, { k: "gradeBal", label: "Grade balance", min: -100, max: 100, step: 1 }] },
  { title: "Detail", items: [
    { k: "sharpAmount", label: "Sharpening", min: 0, max: 150, step: 1 }, { k: "nrLuma", label: "Luminance NR", min: 0, max: 100, step: 1 }, { k: "nrColor", label: "Colour NR", min: 0, max: 100, step: 1 }] },
  { title: "Optics", items: [
    { k: "distortion", label: "Lens distortion", min: -100, max: 100, step: 1 }, { k: "ca", label: "Chromatic aberration", min: -100, max: 100, step: 1 },
    { k: "perspV", label: "Vertical perspective", min: -100, max: 100, step: 1 }, { k: "perspH", label: "Horizontal perspective", min: -100, max: 100, step: 1 }] },
];
const CURVES: Record<string, [number, number][]> = {
  Linear: [[0, 0], [1, 1]], "Soft S": [[0, 0], [0.25, 0.22], [0.75, 0.78], [1, 1]], "Medium S": [[0, 0], [0.25, 0.19], [0.75, 0.82], [1, 1]],
  "Strong S": [[0, 0], [0.25, 0.14], [0.75, 0.87], [1, 1]], "Lifted blacks": [[0, 0.06], [0.5, 0.5], [1, 1]],
};
const RATIOS: Record<string, number | null> = { Original: null, "1:1": 1, "4:5": 4 / 5, "3:2": 3 / 2, "16:9": 16 / 9 };

function Slider({ label, value, min, max, step, onChange, onCommit, aiPart }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; onCommit: () => void; aiPart?: number }) {
  const pct = (v: number) => clamp(((v - min) / (max - min)) * 100, 0, 100), pz = pct(0), pv = pct(value), lo = Math.min(pz, pv), hi = Math.max(pz, pv);
  return (<div className="mb-2.5"><div className="flex items-center justify-between text-[11px] leading-4"><span className="text-mute">{label}</span>
    <span className="flex items-center gap-1.5">{aiPart ? <span className="text-[10px] text-ai" title="Part of this value comes from the AI recipe">AI {aiPart > 0 ? "+" : ""}{Math.round(aiPart * 100) / 100}</span> : null}
      <button className="tabular-nums text-ink hover:text-acc" onDoubleClick={() => { onChange(0); onCommit(); }} title="Double-click to zero">{Math.round(value * 100) / 100}</button></span></div>
    <input type="range" min={min} max={max} step={step} value={value} style={{ ["--trk" as any]: `linear-gradient(to right,#3a3a3a ${lo}%,#5aa2ff ${lo}%,#5aa2ff ${hi}%,#3a3a3a ${hi}%)` }} onChange={(e) => onChange(parseFloat(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} /></div>);
}
function Sec({ id, title, open, toggle, children, hint }: { id: string; title: string; open: boolean; toggle: () => void; children: React.ReactNode; hint?: string }) {
  return (<section id={`sec-${id}`} className="border-b border-line"><button onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-panel2/50"><span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink">{title}{hint ? <span className="ml-2 font-normal normal-case tracking-normal text-mute">{hint}</span> : null}</span><Icon name="chev" size={12} className={`text-mute transition-transform ${open ? "rotate-90" : ""}`} /></button>{open && <div className="px-3 pb-3 pt-1">{children}</div>}</section>);
}
function AiErr({ msg }: { msg: string }) { if (!msg) return null; return <p className="mt-2 text-[11px] text-warn">{msg}{msg.startsWith("AI is not set up") && <> <Link href="/settings" className="underline">Open Settings</Link></>}</p>; }
const Cap = ({ children }: { children: React.ReactNode }) => <h4 className="cap mb-1.5 mt-4 first:mt-0">{children}</h4>;

function snapDims(c: HTMLCanvasElement): [number, number] { const s = Math.min(1, 640 / Math.max(c.width, c.height)); return [Math.round(c.width * s), Math.round(c.height * s)]; }
function snapshotCanvas(c: HTMLCanvasElement) { const [w, h] = snapDims(c); const t = document.createElement("canvas"); t.width = w; t.height = h; const x = t.getContext("2d")!; x.drawImage(c, 0, 0, w, h); return x.getImageData(0, 0, w, h).data; }
function validBox(b: any) { return b && [b.x, b.y, b.w, b.h].every((n: any) => typeof n === "number" && isFinite(n)) && b.w > 0.02 && b.h > 0.02 ? { x: clamp(b.x, 0, 1), y: clamp(b.y, 0, 1), w: clamp(b.w, 0, 1), h: clamp(b.h, 0, 1) } : undefined; }

/** Interactive mask overlay. Handles are in output space; geometry is stored in source space so it follows crop/straighten. */
function Overlay({ layer, ctx, paint, onEdit, onEnd, onStroke }: { layer: LocalLayer; ctx: MapCtx; paint: boolean; onEdit: (fn: (l: LocalLayer) => LocalLayer) => void; onEnd: (label: string) => void; onStroke: (ph: "start" | "move" | "end", pt: [number, number]) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const toSrc = (e: { clientX: number; clientY: number }) => { const r = ref.current!.getBoundingClientRect(); return outToSrc((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, ctx); };
  const drag = (label: string, apply: (sx: number, sy: number, l: LocalLayer) => LocalLayer) => (e: React.PointerEvent) => {
    e.stopPropagation(); const mv = (ev: PointerEvent) => { const [sx, sy] = toSrc(ev); onEdit((l) => apply(sx, sy, l)); }; const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); onEnd(label); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); };
  const pc = (x: number, y: number) => ({ cx: `${x * 100}%`, cy: `${y * 100}%` });
  const H = (x: number, y: number, label: string, apply: (sx: number, sy: number, l: LocalLayer) => LocalLayer) => <circle key={label} {...pc(x, y)} r={7} fill="#5aa2ff" fillOpacity={0.9} stroke="#111" strokeWidth={1.5} style={{ cursor: "grab", pointerEvents: "all" }} onPointerDown={drag(label, apply)} />;
  let body: React.ReactNode = null;
  if (layer.type === "linear") { const [a, b] = [srcToOut(layer.linear[0], layer.linear[1], ctx), srcToOut(layer.linear[2], layer.linear[3], ctx)];
    body = <><line x1={`${a[0] * 100}%`} y1={`${a[1] * 100}%`} x2={`${b[0] * 100}%`} y2={`${b[1] * 100}%`} stroke="#5aa2ff" strokeWidth={1.5} strokeDasharray="5 4" />
      {H(a[0], a[1], "Move gradient start", (sx, sy, l) => ({ ...l, linear: [sx, sy, l.linear[2], l.linear[3]] }))}{H(b[0], b[1], "Move gradient end", (sx, sy, l) => ({ ...l, linear: [l.linear[0], l.linear[1], sx, sy] }))}</>; }
  if (layer.type === "radial") { const [cx, cy, rx, ry] = layer.radial; const c = srcToOut(cx, cy, ctx), hx = srcToOut(cx + rx, cy, ctx), hy = srcToOut(cx, cy + ry, ctx);
    body = <><ellipse cx={`${c[0] * 100}%`} cy={`${c[1] * 100}%`} rx={`${Math.abs(hx[0] - c[0]) * 100}%`} ry={`${Math.abs(hy[1] - c[1]) * 100}%`} fill="none" stroke="#5aa2ff" strokeWidth={1.5} strokeDasharray="5 4" />
      {H(c[0], c[1], "Move radial", (sx, sy, l) => ({ ...l, radial: [sx, sy, l.radial[2], l.radial[3]] }))}{H(hx[0], hx[1], "Resize radial", (sx, _sy, l) => ({ ...l, radial: [l.radial[0], l.radial[1], Math.max(0.02, Math.abs(sx - l.radial[0])), l.radial[3]] }))}{H(hy[0], hy[1], "Resize radial", (_sx, sy, l) => ({ ...l, radial: [l.radial[0], l.radial[1], l.radial[2], Math.max(0.02, Math.abs(sy - l.radial[1]))] }))}</>; }
  return (<svg ref={ref} className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
    {layer.type === "brush" && paint && <rect width="100%" height="100%" fill="transparent" style={{ pointerEvents: "all", cursor: "crosshair" }}
      onPointerDown={(e) => { e.stopPropagation(); onStroke("start", toSrc(e)); const mv = (ev: PointerEvent) => onStroke("move", toSrc(ev)); const up = (ev: PointerEvent) => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); onStroke("end", toSrc(ev)); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); }} />}
    {body}</svg>);
}

function EditorInner() {
  const sp = useSearchParams(); const id = sp.get("id") ?? ""; const askQ = sp.get("ask"), autoQ = sp.get("auto");
  const [proj, setProj] = useState<Project | null>(null); const [err, setErr] = useState("");
  const [left, setLeft] = useState<"assistant" | "insight" | "report" | "history">("assistant"); const [right, setRight] = useState<"develop" | "effects" | "retouch" | "masks" | "grade" | "looks">("develop"); const [exportOpen, setExportOpen] = useState(false); const [dock, setDock] = useState(true);
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({ ai: true, light: true, colour: true, curve: true }); const secOpen = (k: string) => !!openSecs[k]; const secToggle = (k: string) => () => setOpenSecs((o) => ({ ...o, [k]: !o[k] }));
  const [hslTab, setHslTab] = useState<"hslH" | "hslS" | "hslL">("hslS"); const [strip, setStrip] = useState<Project[]>([]); const stripUrls = useThumbs(strip);
  // Older code paths call setTab with the former tab names; this maps them onto the new panels.
  const setTab = (t: string) => { if (t === "report" || t === "assistant" || t === "history") setLeft(t); else if (t === "analysis") setLeft("insight"); else if (t === "edit") setRight("develop"); else if (t === "masks") setRight("masks"); else if (t === "reference") setRight("looks"); else if (t === "export") setExportOpen(true); };
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [fx, setFxState] = useState<FxItem[]>([]); const [scope, setScope] = useState<"hist" | "wave" | "vector">("hist"); const [lut, setLutState] = useState<import("@/lib/lut").LutState | null>(null); const [ops, setOps] = useState<RetouchOp[]>([]); const [srcVer, setSrcVer] = useState(0); const baseSrc = useRef<ImageBitmap | HTMLCanvasElement | null>(null);
  const [rMode, setRMode] = useState<RMode>("spot"); const [rSize, setRSize] = useState(0.02); const [cSrc, setCSrc] = useState<[number, number] | null>(null); const [cOff, setCOff] = useState<[number, number] | null>(null); const [rMsg, setRMsg] = useState("");
  const [manual, setManual] = useState<Partial<EditParams>>({}); const [aiOpacity, setAiOpacity] = useState(1); const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [genre, setGenre] = useState<Genre>("unknown"); const [intent, setIntent] = useState<Intent>("natural");
  const [history, setHistory] = useState<HistoryEntry[]>([]); const [hIdx, setHIdx] = useState(0);
  const [split, setSplit] = useState(0); const [showBefore, setShowBefore] = useState(false); const [thirds, setThirds] = useState(false); const [clip, setClip] = useState(false);
  const [locals, setLocals] = useState<LocalLayer[]>([]); const [selId, setSelId] = useState<string | null>(null); const [showMask, setShowMask] = useState(false);
  const [brush, setBrush] = useState({ size: 0.06, feather: 0.6, flow: 0.6, erase: false, paint: true }); const brushCache = useRef(new Map<string, { sig: string; canvas: HTMLCanvasElement }>());
  const [refs, setRefs] = useState<RefPhoto[]>([]); const [refSel, setRefSel] = useState<RefPhoto | null>(null); const [refStrength, setRefStrength] = useState(0.8); const [match, setMatch] = useState<MatchResult | null>(null); const [refMsg, setRefMsg] = useState("");
  const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 });
  const [aiRes, setAiRes] = useState<any>(null); const [aiBusy, setAiBusy] = useState(false); const [aiErr, setAiErr] = useState("");
  const [chat, setChat] = useState(""); const [proposal, setProposal] = useState<any>(null);
  const [mode, setMode] = useState<"request" | "auto">("request"); const [intentRes, setIntentRes] = useState<IntentResult | null>(null);
  const evRef = useRef<EditEvent[]>([]); const [events, setEvents] = useState<EditEvent[]>([]); const [learned, setLearned] = useState<Learned | null>(null);
  const [fbLiked, setFbLiked] = useState<boolean | null>(null); const [fbComment, setFbComment] = useState(""); const [fbMsg, setFbMsg] = useState(""); const [fbParsed, setFbParsed] = useState<IntentResult | null>(null); const [fbList, setFbList] = useState<FeedbackEntry[]>([]); const [lastEdit, setLastEdit] = useState("");
  const [exp, setExp] = useState({ fmt: "image/jpeg", q: 92, edge: 0, res: "orig", range: "sdr" as "sdr" | "hdr", peak: 1000, sharpen: "off" as "off" | "screen" | "print", wmText: "", wmPos: "br" as WmPos, wmSize: 3, wmOpacity: 70 }); const [expMsg, setExpMsg] = useState("");
  const cv = useRef<HTMLCanvasElement>(null), cvBefore = useRef<HTMLCanvasElement>(null), hist = useRef<HTMLCanvasElement>(null);
  const R = useRef<Renderer | null>(null), RB = useRef<Renderer | null>(null), bmp = useRef<ImageBitmap | null>(null), raf = useRef(0), saveT = useRef<any>(null);

  useEffect(() => { listProjects().then(setStrip); }, [id]);
  // ----- load -----
  useEffect(() => { (async () => {
    try {
      const p = await getProject(id); if (!p) { setErr("Project not found in this browser."); return; }
      setProj(p); setLocals(p.locals ?? []); setManual(p.manual); setAiOpacity(p.aiOpacity); setEnabled(p.enabled); setGenre(p.genre); setIntent(p.intent); setHistory(p.history); setHIdx(p.historyIndex); setAiRes(p.ai ?? null);
      evRef.current = p.log ?? []; setEvents(evRef.current);
      const fbs = await listFeedback(); setFbList(fbs.filter((f) => f.projectId === p.id));
      if (p.learned === undefined) { p.learned = learnBias(fbs, p.genre); await putProject(p); } // frozen per project so a saved edit never changes silently
      setLearned(p.learned ?? null);
      const b = await createImageBitmap(p.original, { imageOrientation: "from-image" }); bmp.current = b;
      // preview texture is capped to the GPU limit; full-res is used on export
      R.current = new Renderer(cv.current!); RB.current = new Renderer(cvBefore.current!);
      const cap = Math.min(R.current.maxTexture, 4096); const sc = Math.min(1, cap / Math.max(b.width, b.height));
      let src: ImageBitmap | HTMLCanvasElement = b;
      if (sc < 1) { const c = document.createElement("canvas"); c.width = Math.round(b.width * sc); c.height = Math.round(b.height * sc); c.getContext("2d")!.drawImage(b, 0, 0, c.width, c.height); src = c; }
      R.current.setImage(p.retouch?.length ? retouchedCanvas(src, p.retouch) : src); RB.current.setImage(src); baseSrc.current = src; setOps(p.retouch ?? []); setFxState(p.fx ?? []); setLutState(p.lut ?? null);
      const a = document.createElement("canvas"); const s2 = Math.min(1, 640 / Math.max(b.width, b.height)); a.width = Math.round(b.width * s2); a.height = Math.round(b.height * s2);
      const ctx = a.getContext("2d")!; ctx.drawImage(b, 0, 0, a.width, a.height); const id2 = ctx.getImageData(0, 0, a.width, a.height);
      setAnalysis(analyse(id2.data, a.width, a.height));
    } catch (e: any) { setErr("Could not open this image: " + (e?.message ?? e)); }
  })(); return () => { bmp.current?.close(); }; }, [id]);

  const plan: Plan | null = useMemo(() => (analysis ? makePlan(analysis, { genre: genre === "unknown" ? undefined : genre, intent, subjectBox: validBox(aiRes?.subjectBox), learned }) : null), [analysis, genre, intent, aiRes, learned]);
  const aiLayer = useMemo(() => (plan ? recipeToParams(plan.items, enabled) : {}), [plan, enabled]);
  const params = useMemo(() => compose(aiLayer, aiOpacity, manual), [aiLayer, aiOpacity, manual]);
  const aiLocals = useMemo(() => (plan ? recipeLocals(plan.items, enabled, aiOpacity) : []), [plan, enabled, aiOpacity]);
  const allLocals = useMemo(() => [...aiLocals, ...locals].slice(0, MAX_LOCALS), [aiLocals, locals]);
  const fxr = useMemo(() => resolveFx(params, allLocals, fx, { w: proj?.width ?? 1500, h: proj?.height ?? 1000 }), [params, allLocals, fx, proj?.width, proj?.height]);
  const rParams = fxr.params, rLocals = fxr.locals;
  const report = useMemo(() => buildReport({ analysis, plan, enabled, aiOpacity, manual, params: rParams, locals: rLocals, events, usedGemini: !!aiRes }), [analysis, plan, enabled, aiOpacity, manual, rParams, rLocals, events, aiRes]);
  const selLayer = locals.find((l) => l.id === selId) ?? null;
  const showIdx = showMask && selLayer ? allLocals.findIndex((l) => l.id === selLayer.id) : -1;
  // painted masks: rasterise strokes to a canvas per layer slot (cached by signature)
  const syncBrush = useCallback((r: Renderer, layers: LocalLayer[], w: number, h: number) => {
    for (let i = 0; i < MAX_LOCALS; i++) { const l = layers[i];
      if (!l || l.type !== "brush") { r.setBrush(i, null, "empty"); continue; }
      const sig = `${l.id}:${l.strokes.length}:${l.strokes.reduce((a, st) => a + st.pts.length, 0)}`; let c = brushCache.current.get(l.id);
      if (!c || c.sig !== sig) { const cv2 = c?.canvas ?? document.createElement("canvas"); rasteriseStrokes(l.strokes, w, h, cv2); c = { sig, canvas: cv2 }; brushCache.current.set(l.id, c); }
      r.setBrush(i, c.canvas, sig); }
  }, []);

  // ----- render -----
  useEffect(() => { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => {
    if (!R.current || !analysis) return;
    const edge = 1800; const L = showBefore ? [] : rLocals; syncBrush(R.current, L, proj!.width, proj!.height); R.current.render(showBefore ? defaultParams() : rParams, edge, { lut: showBefore ? null : lut, clipWarning: clip, locals: L, showMask: showBefore ? -1 : showIdx, airlight: clamp(analysis.p99, 0.7, 1), focus: focusFrom(analysis, validBox((aiRes as any)?.subjectBox)) });
    RB.current?.render({ ...defaultParams(), crop: rParams.crop, straighten: rParams.straighten }, edge);
    const h = hist.current; if (h) { const t = document.createElement("canvas"); t.width = 256; t.height = Math.max(1, Math.round(256 * R.current.canvas.height / R.current.canvas.width)); const c = t.getContext("2d")!; c.drawImage(R.current.canvas, 0, 0, t.width, t.height);
      const d = c.getImageData(0, 0, t.width, t.height).data; const hr = new Array(256).fill(0), hg = new Array(256).fill(0), hb = new Array(256).fill(0); for (let i = 0; i < d.length; i += 4) { hr[d[i]]++; hg[d[i + 1]]++; hb[d[i + 2]]++; }
      const g = h.getContext("2d")!; const H = h.height;
      if (scope !== "hist") drawScope(g, h.width, H, scope, d, t.width, t.height);
      else { const mx = Math.max(...hr, ...hg, ...hb) || 1; g.clearRect(0, 0, 256, H); g.globalCompositeOperation = "lighter";
        [[hr, "#c0392b"], [hg, "#27ae60"], [hb, "#2980b9"]].forEach(([arr, col]) => { g.fillStyle = col as string; (arr as number[]).forEach((v, x) => { const hh = (v / mx) * (H - 2); g.fillRect(x, H - hh, 1, hh); }); }); g.globalCompositeOperation = "source-over"; } }
  }); }, [rParams, analysis, showBefore, clip, rLocals, showIdx, proj, syncBrush, srcVer, aiRes, lut, scope]);

  // ----- persistence (parameters only; original blob untouched) -----
  // Edits are saved after a short debounce, but ALWAYS flushed immediately when the editor unmounts, the tab hides or the page closes.
  // (Bug found by user: edit, leave quickly, export from Projects = original image, because the debounced save never ran.)
  const pend = useRef<Partial<Project> | null>(null), projRef = useRef<Project | null>(null); projRef.current = proj;
  const flush = useCallback(() => { clearTimeout(saveT.current); const patch = pend.current, p = projRef.current; if (!patch || !p) return Promise.resolve(); pend.current = null; projRef.current = { ...p, ...patch } as Project; return putProject(projRef.current).catch(() => {}); }, []);
  const persist = useCallback((patch: Partial<Project>) => { if (!projRef.current) return; pend.current = { ...(pend.current ?? {}), ...patch }; clearTimeout(saveT.current); saveT.current = setTimeout(() => { const m = pend.current; flush().then(() => m && setProj((p) => (p ? { ...p, ...m } : p))); }, 150); }, [flush]);
  useEffect(() => { const hide = () => { if (document.visibilityState === "hidden") flush(); }; window.addEventListener("pagehide", () => { flush(); }); document.addEventListener("visibilitychange", hide); return () => { document.removeEventListener("visibilitychange", hide); flush(); }; }, [flush]);
  const commit = useCallback((label: string, m = manual, o = aiOpacity, e = enabled, loc = locals) => {
    setHistory((h) => { const next = [...h.slice(0, hIdx + 1), { label, manual: m, aiOpacity: o, enabled: e, locals: loc, at: Date.now() }]; setHIdx(next.length - 1); persist({ history: next, historyIndex: next.length - 1, manual: m, aiOpacity: o, enabled: e, locals: loc, genre, intent, ai: aiRes ?? undefined, log: evRef.current }); return next; });
  }, [manual, aiOpacity, enabled, locals, hIdx, persist, genre, intent, aiRes]);
  const jump = (i: number) => { const h = history[i]; if (!h) return; setManual(h.manual); setAiOpacity(h.aiOpacity); setEnabled(h.enabled); setLocals(h.locals ?? []); setHIdx(i); persist({ historyIndex: i, manual: h.manual, aiOpacity: h.aiOpacity, enabled: h.enabled, locals: h.locals ?? [] }); };
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); jump(e.shiftKey ? Math.min(history.length - 1, hIdx + 1) : Math.max(0, hIdx - 1)); } }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); });

  const setNum = (k: NumKey, v: number) => setManual((m) => ({ ...m, [k]: manualDeltaFor(k, v, aiLayer, aiOpacity) }));
  const setCurve = (name: string) => { const m = { ...manual, curve: CURVES[name].map((p) => [...p] as [number, number]) }; setManual(m); commit("Curve: " + name, m); };
  const setHsl = (arr: "hslH" | "hslS" | "hslL", i: number, v: number) => setManual((m) => { const a = [...(m[arr] ?? Array(8).fill(0))]; a[i] = v - (aiLayer[arr]?.[i] ?? 0) * aiOpacity; return { ...m, [arr]: a }; });
  const setRatio = (name: string) => { const r = RATIOS[name]; const W = proj!.width, H = proj!.height; if (r == null) { const m = { ...manual, crop: { x: 0, y: 0, w: 1, h: 1 } }; setManual(m); commit("Crop: original", m); return; }
    let w = 1, h = (W / H) / r; if (h > 1) { h = 1; w = (H / W) * r; } const m = { ...manual, crop: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } }; setManual(m); commit("Crop " + name, m); };
  const toggleItem = (iid: string) => { const e = { ...enabled, [iid]: enabled[iid] === false ? true : false }; setEnabled(e); commit((e[iid] === false ? "Reject " : "Accept ") + iid, manual, aiOpacity, e); };

  // ----- snapshots -----
  const snap = () => { if (!proj) return; const name = prompt("Snapshot name", `Snapshot ${proj.snapshots.length + 1}`); if (!name) return; const s = { id: uid(), name, at: Date.now(), manual, aiOpacity, enabled, locals }; const snaps = [...proj.snapshots, s]; setProj({ ...proj, snapshots: snaps }); putProject({ ...proj, snapshots: snaps }); };
  const loadSnap = (sid: string) => { const s = proj?.snapshots.find((x) => x.id === sid); if (!s) return; setManual(s.manual); setAiOpacity(s.aiOpacity); setEnabled(s.enabled); setLocals(s.locals ?? []); commit("Snapshot: " + s.name, s.manual, s.aiOpacity, s.enabled, s.locals ?? []); };

  // ----- AI (server routes; key never reaches the browser) -----
  const previewB64 = () => { const c = document.createElement("canvas"); const b = bmp.current!; const s = Math.min(1, 768 / Math.max(b.width, b.height)); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s); c.getContext("2d")!.drawImage(b, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; };
  const metrics = () => analysis && ({ medianLuma: +analysis.p50.toFixed(2), clipHighPct: +analysis.clipHighPct.toFixed(1), clipLowPct: +analysis.clipLowPct.toFixed(1), meanSaturation: +analysis.meanSat.toFixed(2), noiseLuma: +analysis.noiseLuma.toFixed(4), sharpness: +analysis.sharpness.toFixed(3), backlit: analysis.backlit });
  const runAI = async () => { setAiBusy(true); setAiErr(""); try { const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: previewB64(), metrics: metrics() }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "AI service error"); setAiRes(j); setGenre(j.genre); setIntent(j.suggestedIntent); persist({ genre: j.genre, intent: j.suggestedIntent, ai: j }); } catch (e: any) { setAiErr(e.message); } finally { setAiBusy(false); } };
  const ask = async () => { if (!chat.trim()) return; setAiBusy(true); setAiErr(""); setProposal(null); try { const r = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction: chat, image: previewB64(), params: Object.fromEntries(GROUPS.flatMap((g) => g.items).map((i) => [i.k, params[i.k]])), metrics: metrics() }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || "AI service error"); setProposal(j); } catch (e: any) { setAiErr(e.message); } finally { setAiBusy(false); } };
  const applyProposal = () => { if (!proposal) return; const m = { ...manual } as any; for (const o of proposal.operations) m[o.key] = (m[o.key] ?? 0) + o.delta; let nl = [...locals]; const lines: string[] = [];
    for (const pm of proposal.masks ?? []) { const t = TARGETS.find((x) => x.id === pm.target); const layer = t?.build(analysis); if (!layer || allLocals.length + (nl.length - locals.length) >= MAX_LOCALS) { lines.push(`${pm.target}: could not build this mask`); continue; }
      layer.adjust = { ...zeroAdjust(), ...pm.adjust } as LocalAdjust; layer.name = `${t!.label}: ${pm.reason || "AI edit"}`.slice(0, 60); if (pm.protectHighlights && layer.type !== "luminance") layer.lum = { on: true, lo: 0, hi: 0.72, soft: 0.2 }; layer.source = "user"; nl = [...nl, layer]; lines.push(`mask ${t!.label} (${Object.entries(pm.adjust).map(([k, v]) => `${k} ${(v as number) > 0 ? "+" : ""}${v}`).join(", ")})`); }
    logEvent({ source: "request", text: chat, summary: "Gemini plan: " + [...proposal.operations.map((o: any) => `${o.key} ${o.delta > 0 ? "+" : ""}${o.delta}`), ...lines].join("; ") }); setManual(m); setLocals(nl); commit("Assistant: " + chat.slice(0, 40), m, aiOpacity, enabled, nl); setProposal(null); setLastEdit("Gemini request"); setTab("report"); };
  const logEvent = (ev: Omit<EditEvent, "at">) => { evRef.current = [...evRef.current, { ...ev, at: Date.now() }]; setEvents(evRef.current); };
  const summarise = (patch: any) => Object.entries(patch).filter(([, v]) => v).map(([k, v]) => `${KEY_INFO[k]?.label ?? k} ${typeof v === "number" ? (v > 0 ? "+" : "") + Math.round(v * 100) / 100 : "on"}`).join(", ");
  const applyPatch = (patch: Partial<EditParams>, label: string, source: EditEvent["source"], text?: string) => { const m: any = { ...manual }; for (const [k, v] of Object.entries(patch)) { if (typeof v === "number") m[k] = (m[k] ?? 0) + v; else if (k === "bw") m.bw = !!v; } logEvent({ source, text, summary: summarise(patch) || "no change" }); setManual(m); commit(label, m); setLastEdit(label); setTab("report"); };
  const autoEdit = () => { const en: Record<string, boolean> = {}; logEvent({ source: "auto", summary: `Simple AI edit: recipe at 100% with all ${plan?.items.length ?? 0} items enabled` }); setEnabled(en); setAiOpacity(1); commit("Simple AI edit", manual, 1, en); setLastEdit("Simple AI edit"); setTab("report"); };
  const applyIntent = () => { if (!intentRes || (!intentRes.ops.length && !intentRes.layers.length)) return;
    const m: any = { ...manual }; const patch = mergeOps(intentRes.ops); for (const [k, v] of Object.entries(patch)) { if (typeof v === "number") m[k] = (m[k] ?? 0) + v; else if (k === "bw") m.bw = !!v; }
    let nl = [...locals]; const notes: string[] = [];
    for (const il of intentRes.layers) { const t = TARGETS.find((x) => x.id === il.target); const layer = t?.build(analysis); if (!layer) { notes.push(`${il.label}: needs a detected subject, which this photo does not have. Use the Masks tab.`); continue; }
      if (allLocals.length + (nl.length - locals.length) >= MAX_LOCALS) { notes.push(`${il.label}: mask limit (${MAX_LOCALS}) reached.`); continue; }
      layer.adjust = { ...zeroAdjust(), ...il.adjust } as LocalAdjust; layer.name = `${il.label}: ${il.reasons.join(", ") || "edit"}`;
      if (il.limitHighlights && layer.type !== "luminance") layer.lum = { on: true, lo: 0, hi: 0.72, soft: 0.2 };
      nl = [...nl, layer]; logEvent({ source: "request", summary: `Mask "${layer.name}" (${layer.type}): ${Object.entries(il.adjust).map(([k, v]) => `${k} ${(v as number) > 0 ? "+" : ""}${Math.round((v as number) * 100) / 100}`).join(", ")}${il.limitHighlights ? "; bright areas protected by a luminance limit" : ""}. ${layer.note ?? ""}` }); }
    if (Object.keys(patch).length) logEvent({ source: "request", text: chat, summary: summarise(patch) || "no change" }); else if (nl.length > locals.length) logEvent({ source: "request", text: chat, summary: `Added ${nl.length - locals.length} mask${nl.length - locals.length > 1 ? "s" : ""}` });
    notes.forEach((n) => logEvent({ source: "request", summary: n }));
    setManual(m); setLocals(nl); commit("Request: " + chat.slice(0, 40), m, aiOpacity, enabled, nl); setLastEdit("Request: " + chat.slice(0, 30)); setIntentRes(null); setTab("report"); };
  const pickLearn = (o: any) => { const r: any = {}; for (const k of LEARN_KEYS) if (typeof o[k] === "number" && o[k]) r[k] = o[k]; return r; };
  const saveFeedback = async () => { if (!proj) return; const parsed = fbComment.trim() ? interpretRequest(fbComment) : null;
    const entry: FeedbackEntry = { id: uid(), projectId: proj.id, projectName: proj.name, at: Date.now(), genre, intent, liked: fbLiked, comment: fbComment.trim(), requests: evRef.current.filter((e) => e.source === "request" && e.text).map((e) => e.text!), recipe: pickLearn(recipeToParams(plan?.items ?? [], enabled)), manual: pickLearn(manual), correction: pickLearn(parsed ? mergeOps(parsed.ops) : {}) };
    await putFeedback(entry); logEvent({ source: "feedback", text: entry.comment || undefined, summary: `${fbLiked === true ? "Liked" : fbLiked === false ? "Did not like" : "No rating"}${parsed?.ops.length ? "; understood: " + parsed.ops.map((o) => o.label).join(", ") : ""}` });
    setFbList((l) => [entry, ...l]); setFbParsed(parsed); setFbMsg("Saved. It will shape plans for photos you open next. This photo's plan is not changed unless you press Refresh learned style."); persist({ log: evRef.current }); };
  const relearn = async () => { if (!proj) return; const L = learnBias(await listFeedback(), genre); const np = { ...proj, learned: L }; await putProject(np); setProj(np); setLearned(L); logEvent({ source: "learned", summary: L ? `Learned style refreshed from ${L.n} entries` : "No learned style yet (needs at least 2 feedback entries with changes)" }); setLastEdit("Refreshed learned style"); };

  // ----- reference matching -----
  useEffect(() => { listRefs().then(setRefs); listPresets().then(setPresets); }, []);
  const [presets, setPresets] = useState<Preset[]>([]); const [presetName, setPresetName] = useState("");
  const savePreset = async () => { const nm = presetName.trim() || "Look " + (presets.length + 1); const body = extractPreset(manual); if (!Object.keys(body).length) return; await putPreset({ id: uid(), name: nm, created: Date.now(), manual: body }); setPresets(await listPresets()); setPresetName(""); };
  const usePreset = (pr: Preset) => { const m = applyPresetTo(manual, pr.manual); logEvent({ source: "preset", summary: "Applied preset " + pr.name }); setManual(m); commit("Preset: " + pr.name, m); };
  const profileOfBlob = async (blob: Blob): Promise<StyleProfile> => { const b = await createImageBitmap(blob, { imageOrientation: "from-image" }); const s = Math.min(1, 640 / Math.max(b.width, b.height)); const c = document.createElement("canvas"); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s); const x = c.getContext("2d")!; x.drawImage(b, 0, 0, c.width, c.height); b.close(); return styleProfile(analyse(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height)); };
  const addRef = async (f: File) => { const r = await addReference(f); if (!r.ok) { setRefMsg(r.error); return; } setRefs(await listRefs()); setRefSel(r.ref); setMatch(null); setRefMsg(""); };
  const runMatch = () => { if (!refSel || !R.current) return; const cur = styleProfile(analyse(snapshotCanvas(R.current.canvas), ...snapDims(R.current.canvas))); setMatch(matchReference(cur, refSel.profile as StyleProfile, refStrength)); };
  const applyMatch = () => { if (!match || !refSel) return; const m: any = { ...manual }; const num = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks", "temperature", "tint", "vibrance", "saturation", "sharpAmount", "vignette"] as const;
    for (const it of match.items) { for (const k of num) if ((it.patch as any)[k] !== undefined) m[k] = (m[k] ?? 0) + (it.patch as any)[k]; if (it.patch.hslS) m.hslS = (m.hslS ?? Array(8).fill(0)).map((v: number, i: number) => v + it.patch.hslS![i]); }
    logEvent({ source: "reference", summary: `Matched ${refSel.name}: ${match.items.map((i) => i.label).join(", ")}` }); setManual(m); commit("Match reference: " + refSel.name, m); setMatch(null); setLastEdit("Reference match"); setTab("report"); };

  // ----- local layers -----
  const mapCtx: MapCtx = { srcW: proj?.width ?? 1, srcH: proj?.height ?? 1, crop: params.crop, straighten: params.straighten };
  const [maskMsg, setMaskMsg] = useState("");
  const addLayer = (l: LocalLayer) => { if (allLocals.length >= MAX_LOCALS) { setMaskMsg(`Limit reached: ${MAX_LOCALS} local layers including AI ones. Reject an AI local item or delete a layer.`); return; } setMaskMsg(""); const nl = [...locals, l]; setLocals(nl); setSelId(l.id); setTab("masks"); commit("Add mask: " + l.name, manual, aiOpacity, enabled, nl); };
  const updLayer = (id: string, fn: (l: LocalLayer) => LocalLayer) => setLocals((ls) => ls.map((l) => (l.id === id ? fn(l) : l)));
  const subjBox = () => validBox(aiRes?.subjectBox) ?? (analysis ? analysis.subject : { x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
  const detachAi = (it: { id: string; local?: LocalLayer }) => { if (!it.local) return; const copy = { ...it.local, id: uid(), source: "user" as const, name: it.local.name + " (edited copy)" }; const e = { ...enabled, [it.id]: false }; const nl = [...locals, copy]; setEnabled(e); setLocals(nl); setSelId(copy.id); setTab("masks"); commit("Make AI mask editable", manual, aiOpacity, e, nl); };
  const delLayer = (id: string) => { const nl = locals.filter((l) => l.id !== id); setLocals(nl); if (selId === id) setSelId(null); commit("Delete mask", manual, aiOpacity, enabled, nl); };
  const onStroke = (phase: "start" | "move" | "end", pt: [number, number]) => { if (!selLayer) return;
    if (phase === "start") updLayer(selLayer.id, (l) => ({ ...l, strokes: [...l.strokes, { pts: [pt], size: brush.size, feather: brush.feather, flow: brush.flow, erase: brush.erase }] }));
    else if (phase === "move") updLayer(selLayer.id, (l) => { const st = l.strokes[l.strokes.length - 1]; if (!st) return l; const last = st.pts[st.pts.length - 1]; if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.003) return l; return { ...l, strokes: [...l.strokes.slice(0, -1), { ...st, pts: [...st.pts, pt] }] }; });
    else commit(brush.erase ? "Erase mask" : "Paint mask"); };

  // ----- export (full-resolution re-render from the untouched original) -----
  const doExport = async () => { try { setExpMsg("Rendering…"); await flush(); const edge = edgeFor(exp.res, exp.edge);
      const res = await renderExport(bmp.current!, proj!.width, proj!.height, { params: rParams, locals: rLocals, airlight: clamp(analysis?.p99 ?? 0.9, 0.7, 1), focus: focusFrom(analysis, validBox((aiRes as any)?.subjectBox)), retouch: ops, lut: lut ?? undefined }, { fmt: exp.fmt, q: exp.q, edge, range: exp.range, peak: exp.peak, sharpen: exp.sharpen, watermark: exp.wmText.trim() ? { text: exp.wmText, pos: exp.wmPos, size: exp.wmSize, opacity: exp.wmOpacity } : undefined });
      const tag = `${exp.range === "hdr" ? "-hdr" : ""}${exp.res !== "orig" && exp.res !== "custom" ? "-" + exp.res : ""}`; download(res.blob, `${proj!.name}-edit${tag}.${res.ext}`);
      setExpMsg(`Exported ${res.w}×${res.h} ${res.range.toUpperCase()}, ${(res.blob.size / 1e6).toFixed(2)} MB.${res.resized === "up" ? " Enlarged with Lanczos (no new detail)." : res.resized === "down" ? " Reduced with Lanczos." : ""}${res.downscaled ? " Source exceeded this GPU's texture limit, so it was reduced first." : ""} ${res.range === "hdr" ? "16-bit PQ/BT.2020." : "8-bit sRGB."} No metadata embedded.${exp.wmText.trim() ? " Watermark burned in." : ""} ${statsLine(res.stats)}`); } catch (e: any) { setExpMsg("Export failed: " + e.message); } };
  // Responsive web export: several long-edge sizes of the same edit, never larger than the source (a web srcset does not need fake pixels).
  const doResponsive = async () => { try { const longSrc = Math.max(proj!.width, proj!.height); const sizes = [480, 768, 1280, 1920].filter((w) => w < longSrc); if (!sizes.length) sizes.push(longSrc); setExpMsg("Rendering responsive set…"); await flush(); const done: string[] = [];
      for (const w of sizes) { const res = await renderExport(bmp.current!, proj!.width, proj!.height, { params: rParams, locals: rLocals, airlight: clamp(analysis?.p99 ?? 0.9, 0.7, 1), focus: focusFrom(analysis, validBox((aiRes as any)?.subjectBox)), retouch: ops, lut: lut ?? undefined }, { fmt: exp.fmt === "image/tiff" ? "image/jpeg" : exp.fmt, q: exp.q, edge: w, range: "sdr", sharpen: exp.sharpen === "off" ? "screen" : exp.sharpen }); download(res.blob, `${proj!.name}-${w}w.${res.ext}`); done.push(`${res.w}x${res.h} (${(res.blob.size / 1024).toFixed(0)} KB)`); await new Promise((r) => setTimeout(r, 250)); }
      setExpMsg(`Exported ${done.length} sizes: ${done.join(", ")}. Screen sharpening was applied. Sizes larger than the source are skipped.`); } catch (e: any) { setExpMsg("Responsive export failed: " + (e?.message ?? e)); } };
  // Opened from Home with a request ("ask") or with no request ("auto" = simple AI edit): do it once the photo is analysed.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !analysis || !plan || !proj || (!askQ && !autoQ)) return; started.current = true;
    window.history.replaceState(null, "", `/editor?id=${id}`);
    if (askQ) { setChat(askQ); const r = interpretRequest(askQ); setIntentRes(r);
      if (r.unsupported.length) logEvent({ source: "request", text: askQ, summary: "Could not do: " + r.unsupported.map((u) => `${u.phrase} (${u.why})`).join("; ") });
      if (r.ops.length) applyPatch(mergeOps(r.ops), "Request: " + askQ.slice(0, 40), "request", askQ); else setLeft("assistant"); }
    else autoEdit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, plan, proj]);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [events.length, intentRes, proposal, left]);

  const setLut = (n: import("@/lib/lut").LutState | null) => { setLutState(n); persist({ lut: n ?? undefined } as any); logEvent({ source: "request", summary: n ? `Colour lookup: ${n.lut.name} ${Math.round(n.amount * 100)}%` : "Colour lookup removed" }); };
  const setFx = (n: FxItem[]) => { setFxState(n); persist({ fx: n }); logEvent({ source: "request", summary: n.length ? `Effects: ${n.map((x) => `${x.label} ${Math.round(x.strength * 100)}%${x.target ? " (mask)" : ""}`).join(", ")}` : "Effects removed" }); };
  const resetManual = () => { setManual({}); commit("Reset my edits", {}); logEvent({ source: "request", summary: "Reset all manual edits" }); };
  const zoomBy = (f: number) => setZoom((z) => clamp(z * f, 0.2, 8)); const fit = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const toolMask = (t: "linear" | "radial" | "brush" | "color" | "luminance") => addLayer(newLayer(t));
  const openGeometry = () => { setRight("develop"); setOpenSecs((o) => ({ ...o, geometry: true })); setTimeout(() => document.getElementById("sec-geometry")?.scrollIntoView({ block: "start" }), 30); };
  const G = (t: string) => GROUPS.find((g) => g.title === t)!;
  const sliders = (t: string) => G(t).items.map((it) => <Slider key={it.k} label={it.label} value={params[it.k]} min={it.min} max={it.max} step={it.step} aiPart={ai(it.k)} onChange={(v) => setNum(it.k, v)} onCommit={() => commit(it.label)} />);
  const SECS = ["ai", "light", "colour", "curve", "hsl", "grading", "effects", "detail", "optics", "geometry", "retouch"]; const allOpen = SECS.every((k) => openSecs[k]);
  const SUGGEST = ["a bit warmer", "brighter", "more contrast", "recover the highlights", "moody", "less noise"];
  const SRC: Record<string, string> = { request: "You asked", auto: "Simple AI edit", feedback: "Your feedback", reference: "Reference match", preset: "Preset", learned: "Learned style" };

  if (err) return <div className="grid h-screen place-items-center"><div className="text-center"><p className="text-bad">{err}</p><Link href="/projects" className="btn mt-4">Back to projects</Link></div></div>;
  const ai = (k: NumKey) => ((aiLayer[k] as number) ?? 0) * aiOpacity;
  const TOOLS: { icon: string; title: string; run: () => void }[] = [
    { icon: "crop", title: "Crop and straighten", run: openGeometry }, { icon: "linear", title: "Linear gradient mask", run: () => toolMask("linear") }, { icon: "radial", title: "Radial mask", run: () => toolMask("radial") },
    { icon: "brush", title: "Brush mask", run: () => toolMask("brush") }, { icon: "hue", title: "Colour range mask", run: () => toolMask("color") }, { icon: "lum", title: "Luminance range mask", run: () => toolMask("luminance") },
  ];

  const ago = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const assistantPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={logRef} data-testid="action-log" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {events.length === 0 && !intentRes && !proposal && <div className="pt-6">
          <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-[#d97757]/15 text-[#e08a6b]"><Icon name="spark" /></div>
          <p className="text-[15px] font-medium">What should we change?</p><p className="mt-1.5 max-w-[270px] text-[12.5px] leading-relaxed text-mute">Say it the way you would to a retoucher. I can target parts of the photo too: "darken the leaves, sharpen the ants, keep the sunlight". I show my plan first, then you apply it.</p>
          <div className="mt-4 flex flex-col gap-1.5">{SUGGEST.map((s) => <button key={s} onClick={() => { setChat(s); setIntentRes(null); }} className="rounded-lg border border-line px-3 py-2 text-left text-[12px] text-mute hover:border-[#444] hover:text-ink">{s}</button>)}</div></div>}
        {events.map((e, i) => <div key={i} className="space-y-2.5">
          {e.text && (e.source === "request" || e.source === "feedback") && <div className="ml-6 rounded-2xl rounded-br-md bg-panel2 px-3.5 py-2.5 text-[13px] leading-snug">{e.text}</div>}
          <div className="flex gap-2.5 text-[13px]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#d97757]/15 text-[#e08a6b]"><Icon name="spark" size={11} /></span>
            <div className="min-w-0 flex-1"><div className="leading-relaxed">{e.summary}</div><div className="mt-1 text-[10.5px] text-mute">{SRC[e.source] ?? e.source} · {ago(e.at)}</div></div></div></div>)}
        {intentRes && <div data-testid="intent-result" className="space-y-2.5">
          <div className="flex gap-2.5 text-[13px]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#d97757]/15 text-[#e08a6b]"><Icon name="spark" size={11} /></span>
            <div className="min-w-0 flex-1">
              <p className="leading-relaxed">{intentRes.ops.length + intentRes.layers.length === 0 ? "I could not turn that into an edit I can really do." : "Here is my plan. Nothing changes until you apply it."}</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-line bg-panel">
                {intentRes.layers.map((l) => <div key={l.target} data-testid="plan-mask" className="border-b border-line px-3 py-2 last:border-0"><div className="flex items-center gap-2 text-[12.5px]"><span className="rounded bg-[#5aa2ff]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#7db4ff]">mask</span><span className="text-ink">{l.label}</span></div>
                  <div className="mt-1 text-[11.5px] text-mute">{Object.entries(l.adjust).map(([k, v]) => `${k} ${(v as number) > 0 ? "+" : ""}${Math.round((v as number) * 100) / 100}`).join(", ")}{l.limitHighlights ? ", bright areas protected" : ""}</div>{l.caveat && <div className="mt-0.5 text-[11px] text-warn">{l.caveat}</div>}</div>)}
                {intentRes.ops.map((o) => <div key={o.key} className="border-b border-line px-3 py-2 last:border-0"><div className="flex items-center gap-2 text-[12.5px]"><span className="rounded bg-panel2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-mute">whole photo</span><span className="text-ink">{o.label}</span></div><div className="mt-1 text-[11.5px] text-mute">{summarise(o.patch)}. {o.reason}</div></div>)}
              </div>
              {intentRes.unsupported.map((u) => <p key={u.phrase} className="mt-2 text-[12px] text-warn">Cannot do "{u.phrase}": {u.why}</p>)}
              {intentRes.notes.map((n) => <p key={n} className="mt-2 text-[12px] text-mute">{n}</p>)}
              <div className="mt-3 flex gap-2"><button data-testid="intent-apply" onClick={applyIntent} disabled={!intentRes.ops.length && !intentRes.layers.length} className="btn btn-primary">Apply plan</button><button onClick={() => setIntentRes(null)} className="btn btn-ghost">Dismiss</button></div></div></div></div>}
        {proposal && <div className="flex gap-2.5 text-[13px]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#d97757]/15 text-[#e08a6b]"><Icon name="spark" size={11} /></span><div className="min-w-0 flex-1"><p className="leading-relaxed">{proposal.explanation}</p>{proposal.cannotDo && <p className="mt-2 text-[12px] text-warn">Limitation: {proposal.cannotDo}</p>}
          <div className="mt-2 overflow-hidden rounded-lg border border-line bg-panel">{(proposal.masks ?? []).map((m: any, i: number) => <div key={"m" + i} className="border-b border-line px-3 py-2 text-[12px]"><span className="mr-2 rounded bg-[#5aa2ff]/15 px-1.5 py-0.5 text-[10px] uppercase text-[#7db4ff]">mask</span><span className="text-ink">{m.target}</span> <span className="text-mute">{Object.entries(m.adjust).map(([k, v]) => `${k} ${(v as number) > 0 ? "+" : ""}${v}`).join(", ")}{m.protectHighlights ? ", bright areas protected" : ""}. {m.reason}</span></div>)}{proposal.operations.map((o: any) => <div key={o.key} className="border-b border-line px-3 py-2 text-[12px] last:border-0"><span className="text-ink">{o.key} {o.delta > 0 ? "+" : ""}{o.delta}</span> <span className="text-mute">{o.reason}</span></div>)}</div>
          {proposal.techniques.length > 0 && <p className="mt-2 text-[11.5px] text-mute">Techniques: {proposal.techniques.join("; ")}</p>}
          <div className="mt-3 flex gap-2"><button onClick={applyProposal} disabled={!proposal.operations.length && !(proposal.masks ?? []).length} className="btn btn-primary">Apply</button><button onClick={() => setProposal(null)} className="btn btn-ghost">Dismiss</button></div></div></div>}
        {aiBusy && <div className="flex items-center gap-2.5 text-[12.5px] text-mute"><span className="h-2 w-2 animate-pulse rounded-full bg-[#d97757]" />Gemini is looking at the photo… it retries on its own if the model is busy.</div>}
        <AiErr msg={aiErr} />
      </div>
      <div className="p-3 pt-0">
        <div className="rounded-2xl border border-line bg-panel p-2.5 focus-within:border-[#555]">
          {mode === "auto" ? <p className="px-1.5 pb-2 pt-1 text-[12.5px] leading-relaxed text-mute">Lumen decides. It measures this photo, keeps what already works and applies {plan?.items.length ?? 0} correction{plan?.items.length === 1 ? "" : "s"}{learned && Object.keys(learned.patch).length ? " including your learned style" : ""}. Nothing is generated.</p>
            : <textarea data-testid="chat" value={chat} onChange={(e) => { setChat(e.target.value); setIntentRes(null); }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && chat.trim()) { e.preventDefault(); setIntentRes(interpretRequest(chat)); } }} rows={2} placeholder="Reply to Lumen, e.g. darken the leaves and keep the sunlight" className="w-full resize-none bg-transparent px-1.5 py-1 text-[13px] outline-none placeholder:text-mute" />}
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex rounded-full border border-line p-0.5 text-[11px]"><button data-testid="mode-request" onClick={() => setMode("request")} className={`rounded-full px-2.5 py-1 ${mode === "request" ? "bg-panel2 text-ink" : "text-mute"}`}>My request</button><button data-testid="mode-auto" onClick={() => setMode("auto")} className={`rounded-full px-2.5 py-1 ${mode === "auto" ? "bg-panel2 text-ink" : "text-mute"}`}>Simple AI edit</button></div>
            <div className="flex items-center gap-1.5">
              {mode === "request" && <button onClick={ask} disabled={aiBusy || !chat.trim()} title="Free-form wording, needs a Gemini key" className="rounded-full border border-line px-3 py-1.5 text-[11.5px] text-mute hover:text-ink disabled:opacity-40">{aiBusy ? "Thinking…" : "Ask Gemini"}</button>}
              {mode === "auto" ? <button data-testid="auto-go" onClick={autoEdit} className="btn btn-primary !rounded-full px-4">Run</button>
                : <button data-testid="interpret-go" aria-label="Send" onClick={() => setIntentRes(interpretRequest(chat))} disabled={!chat.trim()} className="grid h-8 w-8 place-items-center rounded-full bg-[#d97757] text-black disabled:opacity-40"><Icon name="arrowUp" size={14} /></button>}
            </div></div></div>
        <p className="mt-2 px-1 text-[10.5px] leading-snug text-mute">Interpret works offline on a fixed vocabulary. Generative requests are refused, not faked. Removal needs a click on the photo: use the Retouch tab.</p>
      </div>
    </div>);

  const insightPanel = <div className="overflow-y-auto p-3">{analysis && plan ? <>              <div className="mb-3"><button disabled={aiBusy} onClick={runAI} className="btn btn-primary px-3 py-1.5 w-full disabled:opacity-40">{aiBusy ? "Analysing…" : aiRes ? "Re-run AI analysis (Gemini)" : "Run AI analysis (Gemini)"}</button><AiErr msg={aiErr} /></div>
              {aiRes && <div className="rounded border border-line p-2 mb-3 text-[11px] space-y-1"><div><span className="text-mute">Genre</span> {aiRes.genre}{aiRes.secondaryGenres?.length ? ` (+ ${aiRes.secondaryGenres.join(", ")})` : ""}</div><div><span className="text-mute">Subject</span> {aiRes.primarySubject}</div><div><span className="text-mute">Mood</span> {aiRes.mood}</div><div><span className="text-mute">Lighting</span> {aiRes.lighting}</div><div><span className="text-mute">Composition</span> {aiRes.composition}</div>
                {aiRes.problems?.length > 0 && <div><span className="text-mute">Problems</span> {aiRes.problems.join("; ")}</div>}{aiRes.strengths?.length > 0 && <div><span className="text-mute">Working well</span> {aiRes.strengths.join("; ")}</div>}<div className="text-mute">Model-generated description. Verify.</div></div>}
              <div className="flex gap-2 mb-3 text-[11px]"><select value={intent} onChange={(e) => setIntent(e.target.value as Intent)} className="fld">{["natural", "clean", "vibrant", "moody", "documentary", "bw"].map((x) => <option key={x}>{x}</option>)}</select>
                <select value={genre} onChange={(e) => setGenre(e.target.value as Genre)} className="fld">{["unknown", "wildlife", "bird", "pet", "landscape", "portrait", "street", "architecture", "night", "macro"].map((x) => <option key={x}>{x}</option>)}</select></div>
              <h4 className="cap mb-1.5 mt-3">Measured</h4>
              <table className="w-full text-[11px] mb-3"><tbody>{[["Median luma", analysis.p50.toFixed(2)], ["Range p1–p99", `${analysis.p1.toFixed(2)}–${analysis.p99.toFixed(2)}`], ["Clipped white / black", `${analysis.clipHighPct.toFixed(1)}% / ${analysis.clipLowPct.toFixed(1)}%`], ["Cast (R−B)", (analysis.castR - analysis.castB).toFixed(3)], ["Mean saturation", analysis.meanSat.toFixed(2)], ["Sharpness", analysis.sharpness.toFixed(3)], ["Noise luma / chroma", `${analysis.noiseLuma.toFixed(4)} / ${analysis.noiseChroma.toFixed(4)}`], ["Light L→R", analysis.lightLR.toFixed(2)], ["Backlit", String(analysis.backlit)], ["Horizon tilt", `${analysis.horizonTiltDeg}° (conf ${analysis.horizonConfidence.toFixed(2)})`], ["Subject (heuristic)", `${analysis.subject.cx.toFixed(2)}, ${analysis.subject.cy.toFixed(2)}`]].map(([k, v]) => <tr key={k} className="border-t border-line"><td className="py-1 text-mute">{k}</td><td className="py-1 text-right tabular-nums">{v}</td></tr>)}</tbody></table>
              {proj?.exif && <p className="text-[11px] text-mute mb-3">{[proj.exif.Model, proj.exif.LensModel, proj.exif.FocalLength && `${proj.exif.FocalLength}mm`, proj.exif.FNumber && `f/${proj.exif.FNumber}`, proj.exif.ExposureTime && `1/${Math.round(1 / (proj.exif.ExposureTime as number))}s`, proj.exif.ISO && `ISO ${proj.exif.ISO}`].filter(Boolean).join(" · ")}</p>}
              <h4 className="cap mb-1.5 mt-3">Proposed recipe ({plan.items.length})</h4>
              {plan.items.length === 0 && <p className="text-[11px] text-mute mb-2">Nothing crossed a threshold. The photograph is left as shot.</p>}
              {plan.items.map((it) => { const on = enabled[it.id] !== false; return (<div key={it.id} className={`rounded border p-2 mb-2 text-[11px] ${on ? "border-line" : "border-line opacity-50"}`}>
                <div className="flex justify-between"><span className="text-ink">{it.operation} <span className="text-mute">· {it.kind}</span></span><button className={on ? "text-acc" : "text-mute"} onClick={() => toggleItem(it.id)}>{on ? "On" : "Off"}</button></div>
                <div className="text-mute mt-1">{it.reason}</div><div className="mt-1">→ {it.expected}</div><div className="text-mute mt-1">{Object.entries(it.patch).map(([k, v]) => `${k} ${typeof v === "number" ? (v > 0 ? "+" : "") + v : String(v)}`).join(", ")} · region: {it.region}</div><div className="text-mute">Techniques: {it.techniques.join("; ")}</div></div>); })}
              <h4 className="cap mb-1.5 mt-3">Left alone</h4>
              <ul className="text-[11px] text-mute list-disc pl-4 mb-2">{plan.preserved.map((p) => <li key={p}>{p}</li>)}</ul>
              {plan.notes.map((n) => <p key={n} className="text-[11px] text-mute">{n}</p>)}</> : <p className="text-mute">Analysing…</p>}</div>;
  const reportPanel = <div className="overflow-y-auto p-3">            <div data-testid="report">
              {lastEdit && <p data-testid="report-latest" className="text-acc text-[11px] mb-2">Latest edit: {lastEdit}</p>}
              <p data-testid="report-headline" className="text-ink text-[12px] mb-3">{report.headline}</p>
              <h4 className="cap mb-1.5 mt-3">How it was done</h4><ul className="text-[11px] text-mute list-disc pl-4 mb-3 space-y-1">{report.method.map((m) => <li key={m}>{m}</li>)}</ul>
              {report.measured.length > 0 && <><h4 className="cap mb-1.5 mt-3">What was measured</h4><div className="grid grid-cols-2 gap-x-3 text-[11px] mb-3">{report.measured.map((m) => <div key={m.label} className="flex justify-between border-b border-line py-0.5"><span className="text-mute">{m.label}</span><span>{m.value}</span></div>)}</div></>}
              <h4 className="cap mb-1.5 mt-3">What was edited</h4>
              {report.rows.length === 0 ? <p className="text-[11px] text-mute mb-3">Nothing yet.</p> : report.rows.map((r, i) => <div key={i} data-testid="report-row" className="rounded border border-line p-2 mb-2 text-[11px]"><div className="flex justify-between"><span className="text-ink">{r.what}</span><span className="text-mute">{r.source} · {r.kind}</span></div><div>{r.how}</div><div className="text-mute">{r.why}</div>
                <div className="mt-1 text-mute">Terms: {r.terms.length ? r.terms.map((t) => `${t.name} (${t.status})`).join(", ") : "none"}</div><div className="text-mute">Tool: {r.tools.join("; ")}</div></div>)}
              {report.masks.length > 0 && <><h4 className="cap mb-1.5 mt-3">Local masks</h4>{report.masks.map((m, i) => <div key={i} className="rounded border border-line p-2 mb-2 text-[11px]"><div className="text-ink">{m.name} <span className="text-mute">[{m.type}]</span></div><div>{m.adjust}</div><div className="text-mute">{m.note}</div></div>)}</>}
              {report.events.length > 0 && <><h4 className="cap mb-1.5 mt-3">Requests and history</h4><ul className="text-[11px] mb-3 space-y-1">{report.events.map((e, i) => <li key={i} data-testid="report-event"><span className="text-mute">{e.source}:</span> {e.text ? <span className="text-ink">"{e.text}" </span> : null}{e.summary}</li>)}</ul></>}
              <h4 className="cap mb-1.5 mt-3">Terms used</h4><div data-testid="report-terms" className="flex flex-wrap gap-1 mb-3">{report.terms.length ? report.terms.map((t) => <span key={t.name} className="btn px-1.5 py-0.5 text-[10px]">{t.name} <span className="text-mute">{t.status}</span></span>) : <span className="text-[11px] text-mute">none</span>}</div>
              <h4 className="cap mb-1.5 mt-3">Tools used</h4><ul data-testid="report-tools" className="text-[11px] list-disc pl-4 mb-3">{report.tools.map((t) => <li key={t}>{t}</li>)}</ul>
              <h4 className="cap mb-1.5 mt-3">Limits</h4><ul className="text-[11px] text-mute list-disc pl-4 mb-3">{report.limits.map((t) => <li key={t}>{t}</li>)}</ul>
              <div className="flex gap-2 mb-4"><button data-testid="report-copy" onClick={() => navigator.clipboard?.writeText(reportToMarkdown(report, proj?.name ?? "photo"))} className="btn px-2 py-1 text-[11px] hover:border-acc">Copy as Markdown</button><button data-testid="report-download" onClick={() => download(new Blob([reportToMarkdown(report, proj?.name ?? "photo")], { type: "text/markdown" }), `${proj?.name ?? "photo"}-edit-report.md`)} className="btn px-2 py-1 text-[11px] hover:border-acc">Download .md</button></div>
              <section data-testid="feedback" className="border-t border-line pt-3"><h4 className="cap mb-1.5 mt-3">Teach Lumen about this edit</h4>
                <div className="flex gap-2 mb-2"><button data-testid="fb-like" onClick={() => setFbLiked(true)} className={`flex-1 border px-2 py-1 text-[11px] ${fbLiked === true ? "border-acc text-acc" : "border-line"}`}>👍 I like it</button><button data-testid="fb-dislike" onClick={() => setFbLiked(false)} className={`flex-1 border px-2 py-1 text-[11px] ${fbLiked === false ? "border-acc text-acc" : "border-line"}`}>👎 Not quite</button></div>
                <textarea data-testid="fb-comment" value={fbComment} onChange={(e) => setFbComment(e.target.value)} rows={2} placeholder="What would you change? e.g. too dark, a bit warmer" className="fld" />
                {fbComment.trim() && <p className="text-[11px] text-mute mt-1">I understand: {interpretRequest(fbComment).ops.map((o) => o.label).join(", ") || "nothing yet (fixed vocabulary)"}</p>}
                <button data-testid="fb-save" onClick={saveFeedback} disabled={fbLiked === null && !fbComment.trim()} className="btn btn-primary px-3 py-1 mt-2 w-full disabled:opacity-30">Save feedback</button>
                {fbMsg && <p data-testid="fb-msg" className="text-[11px] text-mute mt-2">{fbMsg}</p>}
                {fbParsed && fbParsed.ops.length > 0 && <button data-testid="fb-apply" onClick={() => { applyPatch(mergeOps(fbParsed.ops), "Feedback: " + fbComment.slice(0, 40), "feedback", fbComment); setFbParsed(null); }} className="btn px-3 py-1 mt-2 w-full text-[11px] hover:border-acc">Apply those changes to this photo now</button>}
                <p className="text-[11px] text-mute mt-3">{fbList.length} feedback entr{fbList.length === 1 ? "y" : "ies"} for this photo.</p>
                <div data-testid="learned-status" className="text-[11px] text-mute mt-2 space-y-0.5">{describeLearned(learned).map((l, i) => <p key={i}>{l}</p>)}</div>
                <div className="flex gap-3 mt-2 text-[11px]"><button data-testid="relearn" onClick={relearn} className="text-acc hover:underline">Refresh learned style</button><Link href="/library" className="text-mute hover:text-ink">Style library</Link></div></section>
            </div></div>;
  const historyPanel = <div className="overflow-y-auto p-3"><div className="mb-2 flex items-center justify-between"><span className="cap">History</span><button className="btn !px-2 !py-0.5 text-[11px]" onClick={snap}>+ Snapshot</button></div>
    <ol data-testid="history">{history.map((h, i) => <li key={i}><button onClick={() => jump(i)} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] ${i === hIdx ? "bg-panel2 text-ink" : i > hIdx ? "text-mute/50" : "text-mute hover:bg-panel2/50 hover:text-ink"}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i === hIdx ? "bg-acc" : "bg-line"}`} /><span className="truncate">{h.label}</span></button></li>)}</ol>
    {proj && proj.snapshots.length > 0 && <><div className="cap mb-1.5 mt-5">Snapshots</div>{proj.snapshots.map((s) => <button key={s.id} onClick={() => loadSnap(s.id)} className="block w-full truncate rounded px-2 py-1 text-left text-[12px] text-mute hover:bg-panel2/50 hover:text-ink">{s.name}</button>)}</>}</div>;

  const developPanel = (<div data-testid="develop">
    <div className="flex items-center justify-between border-b border-line px-3 py-2 text-[11px]"><button data-testid="sections-expand" className="text-mute hover:text-ink" onClick={() => setOpenSecs(allOpen ? {} : Object.fromEntries(SECS.map((k) => [k, true])))}>{allOpen ? "Collapse all" : "Expand all"}</button><button data-testid="reset-manual" className="text-mute hover:text-bad" onClick={resetManual}>Reset my edits</button></div>
    <Sec id="ai" title="AI recipe" hint={`${plan ? plan.items.filter((i) => enabled[i.id] !== false).length : 0} ops`} open={secOpen("ai")} toggle={secToggle("ai")}>
      <Slider label="Strength" value={Math.round(aiOpacity * 100)} min={0} max={100} step={1} onChange={(v) => setAiOpacity(v / 100)} onCommit={() => commit("AI opacity")} />
      <p className="text-[11px] text-mute">Your manual layer: {Object.keys(manual).length} control{Object.keys(manual).length === 1 ? "" : "s"}. <button className="text-acc hover:underline" onClick={() => setLeft("insight")}>Review the recipe</button></p></Sec>
    <Sec id="light" title="Light" open={secOpen("light")} toggle={secToggle("light")}>{sliders("Light")}</Sec>
    <Sec id="colour" title="Colour" open={secOpen("colour")} toggle={secToggle("colour")}>{sliders("Colour")}
      <label className="mt-1 block text-[11px] text-mute"><input type="checkbox" checked={params.bw} onChange={(e) => { const m = { ...manual, bw: e.target.checked }; setManual(m); commit(e.target.checked ? "Black & white" : "Colour", m); }} /> Black and white</label></Sec>
    <Sec id="curve" title="Tone curve" open={secOpen("curve")} toggle={secToggle("curve")}><div className="mb-2 flex flex-wrap gap-1">{Object.keys(CURVES).map((c) => <button key={c} onClick={() => setCurve(c)} className="btn !px-2 !py-0.5 text-[11px]">{c}</button>)}</div>
      <CurveEditor points={params.curve} onLive={(c) => setManual((m) => ({ ...m, curve: c }))} onCommit={(c, label) => { const m = { ...manual, curve: c }; setManual(m); commit(label, m); }} /></Sec>
    <Sec id="hsl" title="Colour mix" open={secOpen("hsl")} toggle={secToggle("hsl")}>
      <div className="mb-2 grid grid-cols-3 rounded border border-line p-0.5 text-[11px]">{([["hslH", "Hue"], ["hslS", "Saturation"], ["hslL", "Luminance"]] as const).map(([k, l]) => <button key={k} onClick={() => setHslTab(k)} className={`rounded py-1 ${hslTab === k ? "bg-panel2 text-ink" : "text-mute"}`}>{l}</button>)}</div>
      {HSL_BANDS.map((b, i) => <Slider key={b} label={b[0].toUpperCase() + b.slice(1)} value={params[hslTab][i]} min={-100} max={100} step={1} onChange={(v) => setHsl(hslTab, i, v)} onCommit={() => commit(`HSL ${b} ${hslTab === "hslH" ? "hue" : hslTab === "hslS" ? "saturation" : "luminance"}`)} />)}</Sec>
    <Sec id="grading" title="Colour grading" open={secOpen("grading")} toggle={secToggle("grading")}>{sliders("Colour grading")}</Sec>
    <Sec id="effects" title="Effects" open={secOpen("effects")} toggle={secToggle("effects")}>{sliders("Effects")}</Sec>
    <Sec id="detail" title="Detail" open={secOpen("detail")} toggle={secToggle("detail")}>{sliders("Detail")}</Sec>
    <Sec id="optics" title="Optics" open={secOpen("optics")} toggle={secToggle("optics")}>{sliders("Optics")}</Sec>
    <Sec id="geometry" title="Geometry" open={secOpen("geometry")} toggle={secToggle("geometry")}>
      <Slider label="Straighten °" value={params.straighten} min={-15} max={15} step={0.1} aiPart={ai("straighten")} onChange={(v) => setNum("straighten", v)} onCommit={() => commit("Straighten")} />
      <div className="cap mb-1.5 mt-3">Crop ratio</div><div className="flex flex-wrap gap-1">{Object.keys(RATIOS).map((r) => <button key={r} onClick={() => setRatio(r)} className="btn !px-2 !py-0.5 text-[11px]">{r}</button>)}</div></Sec>
    <Sec id="retouch" title="Retouching" hint="Retouch tab" open={secOpen("retouch")} toggle={secToggle("retouch")}>
      <p className="text-[11px] leading-relaxed text-mute">Spot removal, heal, clone and object removal work on real pixels. Upscaling is a Lanczos resample at export. Generative fill is not available.</p>
      <button data-testid="open-retouch" onClick={() => setRight("retouch")} className="btn mt-2 !px-2 !py-1 text-[11px]">Open Retouch tab</button></Sec>
  </div>);

  const masksPanel = (<div className="p-3">
    <Cap>Masks ({allLocals.length}/{MAX_LOCALS})</Cap>
          <div className="mb-2">
            {plan?.items.filter((i) => i.local && enabled[i.id] !== false).map((i) => <div key={i.id} className="rounded border border-line p-1.5 mb-1 text-[11px]"><div className="flex justify-between"><span className="text-acc">AI · {i.local!.name}</span><button className="text-mute hover:text-ink" onClick={() => detachAi(i)}>edit copy</button></div></div>)}
            {locals.map((l) => <div key={l.id} onClick={() => { setSelId(l.id); setTab("masks"); }} className={`rounded border p-1.5 mb-1 text-[11px] cursor-pointer ${selId === l.id ? "border-acc" : "border-line"}`}><div className="flex justify-between items-center"><span className="truncate">{l.name}</span>
              <span className="flex gap-2 text-mute"><button title="Visibility" onClick={(e) => { e.stopPropagation(); const nl = locals.map((x) => (x.id === l.id ? { ...x, visible: !x.visible } : x)); setLocals(nl); commit(l.visible ? "Hide mask" : "Show mask", manual, aiOpacity, enabled, nl); }}>{l.visible ? "●" : "○"}</button><button title="Delete" onClick={(e) => { e.stopPropagation(); delLayer(l.id); }}>×</button></span></div></div>)}
            <div className="flex flex-wrap gap-1 mt-1.5">{([["Linear", () => newLayer("linear")], ["Radial", () => newLayer("radial")], ["Luminance", () => newLayer("luminance")], ["Colour", () => newLayer("color")], ["Brush", () => newLayer("brush")], ["Subject≈", () => subjectEllipse(subjBox(), false)], ["Background≈", () => subjectEllipse(subjBox(), true)], ["Sky≈", () => skyLayer()]] as [string, () => LocalLayer][]).map(([n, f]) => <button key={n} onClick={() => addLayer(f())} className="btn px-1.5 py-0.5 text-[10px] text-mute hover:text-ink hover:border-acc">+ {n}</button>)}</div>
            {maskMsg && <p className="text-warn text-[10px] mt-1">{maskMsg}</p>}<p className="text-mute text-[10px] mt-1">≈ = approximate (ellipse or heuristic), not a true segmentation.</p></div>
    <div className="mt-4 border-t border-line pt-3">              {!selLayer && <p className="text-[11px] text-mute">Add or select a mask on the left. Each mask limits a set of adjustments to part of the photograph. AI-proposed masks appear in the Analysis tab and on the left, and can be turned into editable copies.</p>}
              {selLayer && (() => { const l = selLayer; const set = (fn: (x: LocalLayer) => LocalLayer) => updLayer(l.id, fn); const end = (lbl: string) => () => commit(lbl);
                return <>
                <input value={l.name} onChange={(e) => set((x) => ({ ...x, name: e.target.value }))} onBlur={() => commit("Rename mask")} className="fld" />
                {l.note && <p className="text-warn text-[11px] mb-2">{l.note}</p>}
                <div className="flex flex-wrap gap-3 text-[11px] text-mute mb-2"><label><input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} /> Show mask (red)</label><label><input type="checkbox" checked={l.invert} onChange={(e) => { set((x) => ({ ...x, invert: e.target.checked })); setTimeout(() => commit("Invert mask"), 0); }} /> Invert</label></div>
                <Slider label="Density" value={Math.round(l.opacity * 100)} min={0} max={100} step={1} onChange={(v) => set((x) => ({ ...x, opacity: v / 100 }))} onCommit={end("Mask density")} />
                {(l.type === "linear" || l.type === "radial") && <Slider label="Feather" value={Math.round(l.feather * 100)} min={1} max={100} step={1} onChange={(v) => set((x) => ({ ...x, feather: v / 100 }))} onCommit={end("Mask feather")} />}
                {l.type === "linear" && <p className="text-[11px] text-mute mb-2">Drag the two blue handles on the photo. Full effect starts at the first handle.</p>}
                {l.type === "radial" && <p className="text-[11px] text-mute mb-2">Drag the centre handle to move, the side handles to resize. Tick Invert to affect the outside.</p>}
                {l.type === "brush" && <div className="mb-3"><h4 className="cap mb-1.5 mt-3">Brush</h4>
                  <label className="text-[11px] text-mute block mb-2"><input type="checkbox" checked={brush.paint} onChange={(e) => setBrush({ ...brush, paint: e.target.checked })} /> Painting enabled (disable to pan)</label>
                  <Slider label="Size" value={Math.round(brush.size * 100)} min={1} max={30} step={1} onChange={(v) => setBrush({ ...brush, size: v / 100 })} onCommit={() => {}} />
                  <Slider label="Feather" value={Math.round(brush.feather * 100)} min={0} max={100} step={1} onChange={(v) => setBrush({ ...brush, feather: v / 100 })} onCommit={() => {}} />
                  <Slider label="Flow" value={Math.round(brush.flow * 100)} min={5} max={100} step={1} onChange={(v) => setBrush({ ...brush, flow: v / 100 })} onCommit={() => {}} />
                  <div className="flex gap-2"><button onClick={() => setBrush({ ...brush, erase: false })} className={`btn ${!brush.erase ? "!border-acc !text-acc" : ""}`}>Paint</button><button onClick={() => setBrush({ ...brush, erase: true })} className={`btn ${brush.erase ? "!border-acc !text-acc" : ""}`}>Erase</button><button onClick={() => { set((x) => ({ ...x, strokes: [] })); setTimeout(() => commit("Clear mask"), 0); }} className="btn px-2 py-1 text-[11px] text-mute">Clear</button></div></div>}
                {(l.type === "luminance" || l.lum.on || l.type !== "color") && <div className="mb-3"><label className="text-[11px] text-mute block mb-1">{l.type === "luminance" ? <span className="uppercase tracking-widest text-[10px]">Luminance range</span> : <><input type="checkbox" checked={l.lum.on} onChange={(e) => { set((x) => ({ ...x, lum: { ...x.lum, on: e.target.checked } })); setTimeout(() => commit("Luminance limiter"), 0); }} /> Limit to luminance range</>}</label>
                  {(l.lum.on || l.type === "luminance") && <><Slider label="From" value={Math.round(l.lum.lo * 100)} min={0} max={100} step={1} onChange={(v) => set((x) => ({ ...x, lum: { ...x.lum, lo: Math.min(v / 100, x.lum.hi) } }))} onCommit={end("Luminance range")} /><Slider label="To" value={Math.round(l.lum.hi * 100)} min={0} max={100} step={1} onChange={(v) => set((x) => ({ ...x, lum: { ...x.lum, hi: Math.max(v / 100, x.lum.lo) } }))} onCommit={end("Luminance range")} /><Slider label="Softness" value={Math.round(l.lum.soft * 100)} min={1} max={50} step={1} onChange={(v) => set((x) => ({ ...x, lum: { ...x.lum, soft: v / 100 } }))} onCommit={end("Luminance range")} /></>}</div>}
                {(l.type === "color" || l.color.on || l.type !== "luminance") && <div className="mb-3"><label className="text-[11px] text-mute block mb-1">{l.type === "color" ? <span className="uppercase tracking-widest text-[10px]">Colour range</span> : <><input type="checkbox" checked={l.color.on} onChange={(e) => { set((x) => ({ ...x, color: { ...x.color, on: e.target.checked } })); setTimeout(() => commit("Colour limiter"), 0); }} /> Limit to colour range</>}</label>
                  {(l.color.on || l.type === "color") && <><Slider label="Hue °" value={Math.round(l.color.hue)} min={0} max={360} step={1} onChange={(v) => set((x) => ({ ...x, color: { ...x.color, hue: v } }))} onCommit={end("Colour range")} /><Slider label="Range °" value={Math.round(l.color.range)} min={5} max={180} step={1} onChange={(v) => set((x) => ({ ...x, color: { ...x.color, range: v } }))} onCommit={end("Colour range")} /><Slider label="Min saturation" value={Math.round(l.color.satMin * 100)} min={0} max={80} step={1} onChange={(v) => set((x) => ({ ...x, color: { ...x.color, satMin: v / 100 } }))} onCommit={end("Colour range")} /></>}</div>}
                <h4 className="cap mb-1.5 mt-3">Adjustments inside the mask</h4>
                {([["exposure", "Exposure", -3, 3, 0.01], ["contrast", "Contrast", -100, 100, 1], ["highlights", "Highlights", -100, 100, 1], ["shadows", "Shadows", -100, 100, 1], ["temperature", "Temperature", -100, 100, 1], ["saturation", "Saturation", -100, 100, 1], ["clarity", "Clarity", -100, 100, 1], ["texture", "Texture", -100, 100, 1], ["sharpen", "Sharpen", 0, 100, 1], ["blur", "Gaussian blur", 0, 100, 1], ["motion", "Motion blur", 0, 100, 1], ["mosaic", "Mosaic", 0, 100, 1], ["soft", "Soft focus", 0, 100, 1], ["fade", "Fade (matte)", 0, 100, 1], ["grain", "Grain", 0, 100, 1]] as [keyof LocalAdjust, string, number, number, number][]).map(([k, lbl, mn, mx, st]) =>
                  <Slider key={k} label={lbl} value={l.adjust[k] ?? 0} min={mn} max={mx} step={st} onChange={(v) => set((x) => ({ ...x, adjust: { ...x.adjust, [k]: v } }))} onCommit={end(`${l.name}: ${lbl}`)} />)}
                <p className="text-[11px] text-mute mt-2">Local masks use global-edit-then-local order: they act on the already-graded image.</p></>; })()}
              {maskMsg && <p className="text-warn text-[11px] mt-2">{maskMsg}</p>}</div></div>);

  const setOpsAndRebuild = (n: RetouchOp[]) => { setOps(n); persist({ retouch: n }); if (R.current && baseSrc.current) { R.current.setImage(n.length ? retouchedCanvas(baseSrc.current, n) : baseSrc.current); setSrcVer((v) => v + 1); } };
  const addOp = (op: RetouchOp, note: string) => { setRMsg("Working…"); setTimeout(() => { const t0 = performance.now(); setOpsAndRebuild([...ops, op]); logEvent({ source: "manual", summary: `Retouch: ${RETOUCH_LABEL[op.type]} (${note})` }); setRMsg(`${RETOUCH_LABEL[op.type]} applied in ${Math.round(performance.now() - t0)} ms. Real pixels were changed; the original file is untouched.`); }, 20); };
  const onRPoint = (p: [number, number]) => {
    const uid2 = () => Math.random().toString(36).slice(2, 9);
    if (rMode === "spot") { addOp({ id: uid2(), type: "spot", x: p[0], y: p[1], r: rSize }, "automatic source"); return; }
    if (!cSrc) { setCSrc(p); setCOff(null); setRMsg("Source set (blue ring). Now click or tap where you want it applied."); return; }
    const off = cOff ?? [cSrc[0] - p[0], cSrc[1] - p[1]] as [number, number]; if (!cOff) setCOff(off);
    addOp({ id: uid2(), type: rMode as "clone" | "heal", sx: clamp(p[0] + off[0], 0, 1), sy: clamp(p[1] + off[1], 0, 1), dx: p[0], dy: p[1], r: rSize }, "manual source");
  };
  const onRStroke = (pts: [number, number][]) => { if (pts.length) addOp({ id: Math.random().toString(36).slice(2, 9), type: "remove", pts, r: rSize }, `${pts.length} brush points, inpainted from the rest of the photo`); };
  const retouchPanel = (<div data-testid="retouch-panel" className="p-3 text-[12px]">
    <p className="mb-2 text-[11px] leading-relaxed text-mute">Edits real pixels, saved as steps you can remove. They are replayed on the untouched original, also at export.</p>
    <div className="grid grid-cols-2 gap-1.5">{([["spot", "Spot removal", "Click a blemish. Lumen finds a clean source itself."], ["heal", "Heal", "Set a source, then click targets. Colour and light are matched."], ["clone", "Clone", "Set a source, then click targets. Exact copy, soft edge."], ["remove", "Object removal", "Paint over the object. It is filled from the rest of the photo."]] as [RMode, string, string][]).map(([k, l, d]) =>
      <button key={k} data-testid={`rt-${k}`} title={d} onClick={() => { setRMode(k); setCSrc(null); setCOff(null); setRMsg(d); }} className={`rounded border px-2 py-2 text-left ${rMode === k ? "border-acc text-ink" : "border-line text-mute hover:text-ink"}`}>{l}</button>)}</div>
    <label className="mt-3 block text-[11px] text-mute">Brush size {Math.round(rSize * 1000) / 10}%<input data-testid="rt-size" type="range" min={0.005} max={0.08} step={0.0025} value={rSize} onChange={(e) => setRSize(+e.target.value)} className="mt-1 w-full" /></label>
    <p data-testid="rt-msg" className="mt-2 min-h-[2.5em] text-[11px] text-mute">{rMsg || "Pick a tool, then click the photo."}</p>
    <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-mute">{ops.length} step{ops.length === 1 ? "" : "s"}</span>
      <span className="flex gap-3"><button data-testid="rt-undo" disabled={!ops.length} onClick={() => setOpsAndRebuild(ops.slice(0, -1))} className="text-acc hover:underline disabled:opacity-40">Undo last</button><button data-testid="rt-clear" disabled={!ops.length} onClick={() => setOpsAndRebuild([])} className="text-mute hover:text-ink disabled:opacity-40">Clear</button></span></div>
    <ul className="mt-2 space-y-1">{ops.map((o, i) => <li key={o.id} className="flex items-center justify-between rounded border border-line px-2 py-1"><span>{i + 1}. {RETOUCH_LABEL[o.type]}</span><button aria-label="Remove step" onClick={() => setOpsAndRebuild(ops.filter((x) => x.id !== o.id))} className="text-mute hover:text-ink">×</button></li>)}</ul>
    <div className="mt-4 rounded border border-line p-2 text-[11px] leading-relaxed text-mute"><b className="text-ink">Upscaling</b>: choose 1080p, 4K or 8K when you export. It is a Lanczos resample, so it is sharp but adds no new detail (not AI super-resolution).<br /><b className="text-ink">Generative fill</b>: not available. Object removal here copies real patches from your own photo and cannot invent new content.</div>
  <AiEditPanel getSource={() => bmp.current as any} onAccept={async (f) => { const r = await importMany([f]); if (r.projects[0]) window.location.href = `/editor?id=${r.projects[0].id}`; }} />
  </div>);
  const effectsPanel = (<EffectsPanel fx={fx} setFx={setFx} onReset={() => { resetManual(); setFx([]); }} layers={locals.map((l) => ({ id: l.id, name: l.name }))} />);
  const looksPanel = (<div className="p-3">
                  <section className="mb-4" data-testid="presets"><h4 className="cap mb-1.5 mt-3">Presets</h4>
                <div className="flex gap-1"><input data-testid="preset-name" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Name this look" className="fld" /><button data-testid="preset-save" onClick={savePreset} className="btn px-2 hover:border-acc">Save</button></div>
                <p className="text-mute text-[11px] mt-1">Saves your manual edits only (not the AI recipe, crop, straighten or lens optics). Applies on top of each photo's own AI recipe.</p>
                {presets.map((pr) => <div key={pr.id} data-testid="preset-row" className="flex items-center justify-between mt-1 text-[12px]"><span className="truncate">{pr.name}</span><span className="flex gap-2 shrink-0"><button data-testid="preset-apply" onClick={() => usePreset(pr)} className="text-acc hover:underline">Apply</button><button onClick={async () => { await deletePreset(pr.id); setPresets(await listPresets()); }} className="text-mute hover:text-bad">Delete</button></span></div>)}</section>
    <div className="mt-5 border-t border-line pt-3" data-testid="reference-panel"><Cap>Reference look</Cap>              <p className="text-[11px] text-mute mb-2">Pick a photograph whose look you like. Lumen measures its tone, colour balance and saturation, compares them with your current render, and proposes global adjustments with reasons. Your subject is never changed, and local lighting cannot be transferred.</p>
              <label className="block border border-dashed border-line p-3 text-center text-[11px] text-mute cursor-pointer hover:border-acc">Add a reference photo (max 12 MB)<input data-testid="ref-input" type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && addRef(e.target.files[0])} /></label>
              {refMsg && <p data-testid="ref-error" className="text-bad text-[11px] mt-1">{refMsg}</p>}
              <div className="flex gap-2 mt-2 text-[11px]">{refs.length > 0 && <button data-testid="ref-learned" onClick={() => { const lp = learnedProfile(refs); if (lp) { setRefSel({ id: "learned", name: `Learned style (mean of ${refs.length} references)`, created: 0, thumb: new Blob(), profile: lp }); setMatch(null); } }} className="btn px-2 py-1 hover:border-acc">Use learned style</button>}<Link href="/library" className="text-mute hover:text-ink py-1">Open style library</Link></div>
              <div className="grid grid-cols-3 gap-1.5 mt-3">{refs.map((r) => <button key={r.id} onClick={() => { setRefSel(r); setMatch(null); }} className={`border ${refSel?.id === r.id ? "border-acc" : "border-line"}`} title={r.name}><img alt={r.name} src={URL.createObjectURL(r.thumb)} className="w-full aspect-square object-cover" /></button>)}</div>
              {refSel && <div className="mt-3"><h4 className="cap mb-1.5 mt-3">Reference: {refSel.name}</h4><ul className="text-[11px] list-disc pl-4 mb-3">{describeStyle(refSel.profile as StyleProfile).map((d) => <li key={d}>{d}</li>)}</ul>
                <Slider label="Match strength" value={Math.round(refStrength * 100)} min={10} max={100} step={5} onChange={(v) => setRefStrength(v / 100)} onCommit={() => {}} />
                <button onClick={runMatch} className="btn btn-primary px-3 py-1.5 w-full">Compare with my photo</button></div>}
              {match && <div className="mt-3">{match.items.length === 0 ? <p className="text-[11px] text-mute">Your current edit is already close to this reference on every measure. Nothing to change.</p> : <>
                {match.items.map((it) => <div key={it.key} className="rounded border border-line p-2 mb-2 text-[11px]"><div className="text-ink">{it.label}</div><div className="text-mute">{it.reason}</div><div className="text-mute">{it.measured}</div><div className="mt-1">{Object.entries(it.patch).map(([k, v]) => `${k} ${Array.isArray(v) ? "(bands)" : (v as number) > 0 ? "+" + v : v}`).join(", ")}</div></div>)}
                <button onClick={applyMatch} className="btn btn-primary px-3 py-1 mr-2">Apply to manual layer</button><button onClick={() => setMatch(null)} className="text-mute">Dismiss</button></>}
                {match.notes.map((n) => <p key={n} className="text-[11px] text-mute mt-2">{n}</p>)}</div>}</div></div>);

  const exportPanel = (<div>              <label className="block text-[11px] text-mute mb-2">Format<select data-testid="exp-fmt" value={exp.fmt} onChange={(e) => setExp({ ...exp, fmt: e.target.value })} className="fld">{FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
              <label className="block text-[11px] text-mute mb-2">Dynamic range<select data-testid="exp-range" value={exp.range} onChange={(e) => setExp({ ...exp, range: e.target.value as "sdr" | "hdr" })} className="fld"><option value="sdr">SDR (standard, sRGB)</option><option value="hdr">HDR (PQ, BT.2020, 16-bit PNG)</option></select></label>
              {exp.range === "hdr" && <><label className="block text-[11px] text-mute mb-2">Peak brightness<select data-testid="exp-peak" value={exp.peak} onChange={(e) => setExp({ ...exp, peak: +e.target.value })} className="fld"><option value={600}>600 nits</option><option value={1000}>1000 nits</option><option value={4000}>4000 nits</option></select></label>
                <p className="mb-2 text-[11px] leading-relaxed text-mute">Your SDR edit is expanded into HDR: highlights are lifted toward the peak, colours move to BT.2020, the file is tagged PQ. It will look different only in an HDR-aware viewer. Real HDR detail that an 8-bit photo never captured cannot be recovered. Capped at 4K (3840 px) to stay within browser memory.</p></>}
              {exp.range === "sdr" && FORMATS.find((f) => f.value === exp.fmt)?.lossy && <Slider label="Quality" value={exp.q} min={50} max={100} step={1} onChange={(v) => setExp({ ...exp, q: v })} onCommit={() => {}} />}
              <label className="block text-[11px] text-mute mb-2">Resolution<select data-testid="exp-res" value={exp.res} onChange={(e) => setExp({ ...exp, res: e.target.value })} className="fld">{RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
              {exp.res === "custom" && <label className="block text-[11px] text-mute mb-2">Long edge (px)<input data-testid="exp-edge" type="number" min={16} value={exp.edge} onChange={(e) => setExp({ ...exp, edge: Math.max(0, +e.target.value) })} className="fld" /></label>}
              {proj && edgeFor(exp.res, exp.edge) > Math.max(proj.width, proj.height) && <p className="mb-2 text-[11px] text-warn">Larger than the source ({Math.max(proj.width, proj.height)} px). Lumen enlarges with Lanczos resampling: sharper than a plain stretch, but it cannot invent detail. It is not AI super-resolution.</p>}
              <label className="block text-[11px] text-mute mb-2">Output sharpening<select data-testid="exp-sharpen" value={exp.sharpen} onChange={(e) => setExp({ ...exp, sharpen: e.target.value as any })} className="fld"><option value="off">None</option><option value="screen">Sharpen for screen</option><option value="print">Sharpen for print</option></select></label>
              <h4 className="text-mute text-[10px] uppercase tracking-widest mt-3 mb-2">Watermark (text)</h4>
              <input data-testid="exp-wm" placeholder="e.g. © Your name" value={exp.wmText} onChange={(e) => setExp({ ...exp, wmText: e.target.value })} className="fld" />
              {exp.wmText.trim() && <>
                <label className="block text-[11px] text-mute mb-2">Position<select value={exp.wmPos} onChange={(e) => setExp({ ...exp, wmPos: e.target.value as WmPos })} className="fld"><option value="br">Bottom right</option><option value="bl">Bottom left</option><option value="tr">Top right</option><option value="tl">Top left</option><option value="c">Centre</option></select></label>
                <Slider label="Size (% of long edge)" value={exp.wmSize} min={1} max={10} step={0.5} onChange={(v) => setExp({ ...exp, wmSize: v })} onCommit={() => {}} />
                <Slider label="Opacity" value={exp.wmOpacity} min={10} max={100} step={5} onChange={(v) => setExp({ ...exp, wmOpacity: v })} onCommit={() => {}} /></>}
              <button data-testid="exp-go" onClick={doExport} className="btn btn-primary px-3 py-1.5 w-full mt-2">Export</button><button data-testid="exp-responsive" onClick={doResponsive} className="btn px-3 py-1.5 w-full mt-2" title="Downloads several widths for a website (srcset)">Responsive set for web (480 / 768 / 1280 / 1920 px)</button>{expMsg && <p data-testid="exp-msg" className="text-[11px] text-mute mt-2">{expMsg}</p>}
              <p className="text-[11px] text-mute mt-3">Exports re-render from the untouched original. 8-bit sRGB only. TIFF is baseline uncompressed RGB (no ICC profile, no layers). ICC embedding and metadata preservation are not built yet; metadata is always stripped. Watermark is plain text only (no logos).</p></div>);

  return (
    <div className="flex h-screen flex-col bg-bg">
      {/* top bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-panel px-3">
        <div className="flex min-w-0 items-center gap-3"><Link href="/projects" className="flex items-center gap-2" title="Back to projects"><span className="grid h-6 w-6 place-items-center rounded bg-acc text-[13px] font-bold text-[#06121f]">L</span></Link>
          <Link href="/projects" className="text-[12px] text-mute hover:text-ink">Projects</Link><span className="text-line">/</span><span data-testid="project-name" className="max-w-[260px] truncate text-[13px]">{proj?.name}</span></div>
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={hIdx === 0} onClick={() => jump(hIdx - 1)}><Icon name="undo" />Undo</button>
          <button className="btn btn-ghost" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={hIdx >= history.length - 1} onClick={() => jump(hIdx + 1)}><Icon name="redo" />Redo</button>
          <span className="mx-1 h-5 w-px bg-line" />
          <button data-testid="before-hold" className="btn btn-ghost select-none" title="Hold to see the original" onPointerDown={() => setShowBefore(true)} onPointerUp={() => setShowBefore(false)} onPointerLeave={() => setShowBefore(false)}><Icon name="eye" />Hold: before</button>
        </div>
        <div className="flex items-center gap-2"><AiStatus compact /><button data-testid="open-export" className="btn btn-primary" onClick={() => setExportOpen(true)}><Icon name="export" size={14} />Export</button></div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* tool rail */}
        <nav aria-label="Tools" className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
          <button title={dock ? "Hide assistant panel" : "Show assistant panel"} aria-label="Toggle assistant panel" onClick={() => setDock((d) => !d)} className={`grid h-8 w-8 place-items-center rounded ${dock ? "bg-panel2 text-ink" : "text-mute hover:text-ink"}`}><Icon name="dock" /></button>
          <span className="my-1 h-px w-6 bg-line" />
          {TOOLS.map((t) => <button key={t.title} title={t.title} aria-label={t.title} onClick={t.run} className="grid h-8 w-8 place-items-center rounded text-mute hover:bg-panel2 hover:text-ink"><Icon name={t.icon} /></button>)}
        </nav>

        {/* left dock */}
        {dock && <aside data-testid="left-dock" className="flex w-[340px] shrink-0 flex-col border-r border-line bg-panel">
          <div role="tablist" className="flex shrink-0 border-b border-line text-[12px]">{([["assistant", "Assistant", "chat"], ["insight", "Insight", "hist"], ["report", "Report", "report"], ["history", "History", "list"]] as const).map(([k, l, ic]) =>
            <button key={k} role="tab" aria-selected={left === k} data-testid={`left-${k}`} onClick={() => setLeft(k)} className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 ${left === k ? "border-acc text-ink" : "border-transparent text-mute hover:text-ink"}`}><Icon name={ic} size={13} />{l}</button>)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">{left === "assistant" ? assistantPanel : left === "insight" ? insightPanel : left === "report" ? reportPanel : historyPanel}</div>
        </aside>}

        {/* canvas + filmstrip */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 select-none overflow-hidden bg-[#0d0d0d]" onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.1 : 0.9)}
            onPointerDown={(e) => { const sx = e.clientX - pan.x, sy = e.clientY - pan.y; const mv = (ev: PointerEvent) => setPan({ x: ev.clientX - sx, y: ev.clientY - sy }); const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); }}>
            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
              <div className="relative" style={{ maxWidth: "94%", maxHeight: "94%" }}>
                <canvas ref={cvBefore} className="block max-h-[calc(100vh-11.5rem)] max-w-full" style={{ width: "auto", height: "auto" }} />
                <canvas ref={cv} className="absolute inset-0 h-full w-full" style={{ clipPath: `inset(0 0 0 ${split}%)` }} />
                {thirds && <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "linear-gradient(to right,transparent 33.2%,rgba(255,255,255,.35) 33.3%,transparent 33.5%,transparent 66.5%,rgba(255,255,255,.35) 66.6%,transparent 66.8%),linear-gradient(to bottom,transparent 33.2%,rgba(255,255,255,.35) 33.3%,transparent 33.5%,transparent 66.5%,rgba(255,255,255,.35) 66.6%,transparent 66.8%)" }} />}
                {right === "retouch" && analysis && <RetouchOverlay ctx={mapCtx} mode={rMode} mark={cSrc} onPoint={onRPoint} onStroke={onRStroke} />}
                {selLayer && selLayer.visible && <Overlay layer={selLayer} ctx={mapCtx} paint={brush.paint} onEdit={(fn) => updLayer(selLayer.id, fn)} onEnd={(lbl) => commit(lbl)} onStroke={onStroke} />}
                {split > 0 && <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-acc" style={{ left: `${split}%` }} />}
              </div></div>
            {!analysis && <div className="absolute inset-0 grid place-items-center text-mute">Opening photo…</div>}
            {showBefore && <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-[11px]">Original</div>}
          </div>
          <div className="flex h-9 shrink-0 items-center justify-between border-t border-line bg-panel px-3 text-[11px] text-mute">
            <div className="flex items-center gap-4"><label className="flex items-center gap-1.5"><input type="checkbox" checked={thirds} onChange={(e) => setThirds(e.target.checked)} />Thirds</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={clip} onChange={(e) => setClip(e.target.checked)} />Clipping</label>
              <label className="flex items-center gap-2">Compare<input data-testid="split" type="range" className="!w-24" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} /></label>{split > 0 && <span>left original, right edited</span>}</div>
            <div className="flex items-center gap-1"><button className="btn btn-ghost !px-2 !py-0.5" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>−</button><span className="w-10 text-center tabular-nums text-ink">{Math.round(zoom * 100)}%</span><button className="btn btn-ghost !px-2 !py-0.5" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button><button className="btn btn-ghost !px-2 !py-0.5" onClick={fit}>Fit</button></div>
          </div>
          <div data-testid="filmstrip" className="flex h-[72px] shrink-0 items-center gap-2 overflow-x-auto border-t border-line bg-panel px-3">
            {strip.map((p) => <Link key={p.id} href={`/editor?id=${p.id}`} title={p.name} className={`h-[52px] w-[70px] shrink-0 overflow-hidden rounded border ${p.id === id ? "border-acc" : "border-line opacity-70 hover:opacity-100"}`}>{stripUrls[p.id] && <img alt={p.name} src={stripUrls[p.id]} className="h-full w-full object-cover" />}</Link>)}
            <Link href="/" title="Add or start another photo" className="grid h-[52px] w-[70px] shrink-0 place-items-center rounded border border-dashed border-line text-mute hover:text-ink"><Icon name="plus" /></Link>
          </div>
        </section>

        {/* right panel */}
        <aside className="flex w-[310px] shrink-0 flex-col border-l border-line bg-panel">
          <div className="shrink-0 border-b border-line p-3"><div className="mb-1.5 flex gap-1 text-[10px]" role="tablist" aria-label="Scope">{([["hist", "Histogram"], ["wave", "Waveform"], ["vector", "Vectorscope"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={scope === k} data-testid={`scope-${k}`} onClick={() => setScope(k)} className={`rounded px-2 py-0.5 ${scope === k ? "bg-panel2 text-ink" : "text-mute hover:text-ink"}`}>{l}</button>)}</div><canvas ref={hist} width={256} height={scope === "vector" ? 160 : 100} data-testid="histogram" style={{ aspectRatio: scope === "vector" ? "256 / 160" : "256 / 100" }} className="w-full rounded-sm bg-[#101010]" />
            {proj?.exif && <p className="mt-2 truncate text-[10px] text-mute">{[proj.exif.Model, proj.exif.FocalLength && `${proj.exif.FocalLength}mm`, proj.exif.FNumber && `f/${proj.exif.FNumber}`, proj.exif.ExposureTime && `1/${Math.round(1 / (proj.exif.ExposureTime as number))}s`, proj.exif.ISO && `ISO ${proj.exif.ISO}`].filter(Boolean).join("  ")}</p>}</div>
          <div role="tablist" className="flex shrink-0 border-b border-line text-[12px]">{([["develop", "Develop"], ["effects", "Effects"], ["retouch", "Retouch"], ["masks", "Masks"], ["grade", "Grade"], ["looks", "Looks"]] as const).map(([k, l]) =>
            <button key={k} role="tab" aria-selected={right === k} data-testid={`right-${k}`} onClick={() => setRight(k)} className={`flex-1 border-b-2 py-2.5 ${right === k ? "border-acc text-ink" : "border-transparent text-mute hover:text-ink"}`}>{l}{k === "masks" && allLocals.length ? ` (${allLocals.length})` : ""}</button>)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto">{right === "develop" ? developPanel : right === "effects" ? effectsPanel : right === "retouch" ? retouchPanel : right === "masks" ? masksPanel : right === "grade" ? <GradePanel refs={refs} getSource={() => baseSrc.current as any} base={rParams} onApply={(patch, label) => applyPatch(patch, label, "reference", label)} lut={lut} setLut={setLut} /> : looksPanel}</div>
        </aside>
      </div>

      {exportOpen && <div role="dialog" aria-label="Export" className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={() => setExportOpen(false)}>
        <div data-testid="export-dialog" className="w-[400px] max-w-[92vw] rounded-lg border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Export photo</h2><button aria-label="Close" className="btn btn-ghost !p-1" onClick={() => setExportOpen(false)}><Icon name="close" size={14} /></button></div>
          {exportPanel}</div></div>}
    </div>
  );
}
export default function Page() { return <Suspense fallback={<div className="p-8 text-mute">Loading…</div>}><EditorInner /></Suspense>; }
