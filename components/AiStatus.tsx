"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export type AiState = { configured: boolean; source: string; model: string; canWrite: boolean } | null;
export function useAiStatus(): AiState { const [s, setS] = useState<AiState>(null); useEffect(() => { fetch("/api/settings").then((r) => r.json()).then(setS).catch(() => setS(null)); }, []); return s; }
/** Compact status pill: tells the truth about whether Gemini is available. */
export default function AiStatus({ compact = false }: { compact?: boolean }) {
  const s = useAiStatus();
  const on = !!s?.configured;
  return (
    <Link href="/settings" data-testid="ai-status" title={on ? `Gemini connected (${s?.model})` : "Gemini key not set. Click to set it up."} className={`inline-flex items-center gap-2 rounded border px-2 py-1 text-[11px] ${on ? "border-line text-mute hover:text-ink" : "border-warn/50 text-warn hover:bg-warn/10"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-ok" : "bg-warn"}`} />{compact ? (on ? "AI on" : "Set up AI") : on ? "Gemini connected" : "AI not set up"}
    </Link>
  );
}
