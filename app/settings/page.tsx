"use client";
import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import type { AiState } from "@/components/AiStatus";

export default function Settings() {
  const [s, setS] = useState<AiState>(null); const [key, setKey] = useState(""); const [model, setModel] = useState(""); const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const j = await fetch("/api/settings").then((r) => r.json()); setS(j); setModel((m) => m || j.model); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { setBusy(true); setMsg(null); const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, model: model || undefined }) }); const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg({ ok: false, t: j.error }); return; } setKey(""); setS(j); setMsg({ ok: true, t: "Saved on the server. Press Test connection to check that it works." }); };
  const test = async () => { setBusy(true); setMsg({ ok: true, t: "Calling Gemini…" }); const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) }); const j = await r.json(); setBusy(false); setMsg(j.ok ? { ok: true, t: `Connected. ${j.model} answered in ${(j.ms / 1000).toFixed(1)}s${j.attempts?.length ? " after " + j.attempts.length + " failed attempt(s): " + j.attempts.join("; ") : ""}.` } : { ok: false, t: j.error }); };
  const remove = async () => { await fetch("/api/settings", { method: "DELETE" }); setMsg({ ok: true, t: "Key removed." }); load(); };
  return (
    <Shell>
      <div className="mx-auto max-w-[680px] px-8 py-6">
        <h1 className="text-[20px] font-semibold">Settings</h1>
        <section className="mt-6 rounded-lg border border-line bg-panel p-5">
          <div className="flex items-center justify-between"><h2 className="text-[14px] font-medium">Gemini (AI analysis and free-form requests)</h2>
            <span data-testid="settings-state" className={`text-[11px] ${s?.configured ? "text-ok" : "text-warn"}`}>{s == null ? "…" : s.configured ? `Configured (${s.source === "env" ? "environment variable" : "saved on this machine"})` : "Not configured"}</span></div>
          <p className="mt-2 text-[12px] leading-relaxed text-mute">Optional. Without it, everything still works: analysis, the planner, manual editing, the offline request interpreter, presets, the style library and export. Gemini adds genre and subject detection and understanding of free-form wording.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mute">The key is stored on the server side only (a file in <code className="font-mono">.lumen/</code>, or the <code className="font-mono">GEMINI_API_KEY</code> environment variable). It is never sent to the browser, and this page never shows it back.</p>
          {s && !s.canWrite && <p className="mt-3 rounded border border-warn/40 p-2 text-[12px] text-warn">This server is not on localhost, so the key cannot be changed from here. Set <code className="font-mono">GEMINI_API_KEY</code> as an environment variable on the host.</p>}
          {s?.canWrite && s.source !== "env" && <div className="mt-4 space-y-3">
            <label className="block text-[12px] text-mute">API key<input data-testid="settings-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={s.configured ? "Paste a new key to replace the saved one" : "Paste your Gemini API key"} className="fld mt-1" /></label>
            <label className="block text-[12px] text-mute">Model<input value={model} onChange={(e) => setModel(e.target.value)} className="fld mt-1" /></label>
            <div className="flex gap-2"><button data-testid="settings-save" className="btn btn-primary" disabled={!key.trim() || busy} onClick={save}>Save key</button>{s.configured && <button className="btn btn-ghost hover:!text-bad" onClick={remove}>Remove key</button>}</div></div>}
          {s?.configured && <div className="mt-3"><button data-testid="settings-test" className="btn" disabled={busy} onClick={test}>Test connection</button></div>}
          {msg && <p data-testid="settings-msg" className={`mt-3 text-[12px] ${msg.ok ? "text-mute" : "text-bad"}`}>{msg.t}</p>}
          <p className="mt-4 text-[11px] leading-relaxed text-mute">Get a key at Google AI Studio (aistudio.google.com). If you pasted a key into a chat or a public place, delete it there and create a new one.</p>
        </section>
      </div>
    </Shell>
  );
}
