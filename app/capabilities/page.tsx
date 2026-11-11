"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import registry from "@/data/registry.json";
type R = { id: number; name: string; full: string; status: string; impl: string | null; note: string };
const ORDER = ["implemented", "partial", "ai-assisted", "experimental", "planned", "unsupported"];
const COLOR: Record<string, string> = { implemented: "text-emerald-400", partial: "text-amber-300", "ai-assisted": "text-sky-300", experimental: "text-fuchsia-300", planned: "text-mute", unsupported: "text-red-400/70" };
export default function Capabilities() {
  const [f, setF] = useState("implemented"); const [q, setQ] = useState("");
  const rows = registry as R[]; const counts = useMemo(() => rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {}), [rows]);
  const shown = rows.filter((r) => (f === "all" || r.status === f) && (!q || r.full.toLowerCase().includes(q.toLowerCase())));
  return (<Shell><div className="max-w-5xl mx-auto px-8 py-6">
    <h1 className="text-[20px] font-semibold">Capability registry</h1>
    <p className="text-mute text-xs mt-1 max-w-2xl">Built from your term list ({rows.length} entries). Default status is Unsupported; a term is upgraded only when it maps to code that exists, and the test suite checks those links. Definitions are not authored yet, only status and implementation notes.</p>
    <div className="flex flex-wrap gap-2 mt-4 items-center">{["all", ...ORDER].map((s) => <button key={s} onClick={() => setF(s)} className={`border px-2 py-1 text-xs ${f === s ? "border-acc text-ink" : "border-line text-mute"}`}>{s} {s === "all" ? rows.length : counts[s] ?? 0}</button>)}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms" className="bg-panel border border-line px-2 py-1 text-xs ml-auto" /></div>
    <table className="w-full mt-4 text-xs"><tbody>{shown.slice(0, 400).map((r) => <tr key={r.id} className="border-t border-line align-top"><td className="py-1.5 pr-3">{r.full}</td><td className={`py-1.5 pr-3 whitespace-nowrap ${COLOR[r.status]}`}>{r.status}</td><td className="py-1.5 text-mute">{r.note}{r.impl ? ` [${r.impl}]` : ""}</td></tr>)}</tbody></table>
    {shown.length > 400 && <p className="text-mute text-xs mt-2">Showing first 400 of {shown.length}. Use search.</p>}
  </div></Shell>);
}
