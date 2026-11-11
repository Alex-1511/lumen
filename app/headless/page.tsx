"use client";
// Automation entry point for the MCP server. Not a user-facing page.
import { useEffect, useState } from "react";
import { lumenAnalyse, lumenGradeFit, lumenRun } from "@/lib/headless";
import { EFFECTS } from "@/lib/effects";

export default function Headless() {
  const [ready, setReady] = useState(false);
  useEffect(() => { (window as any).lumenRun = lumenRun; (window as any).lumenAnalyse = lumenAnalyse; (window as any).lumenGradeFit = lumenGradeFit; (window as any).lumenEffects = EFFECTS.map(({ id, name, category, desc, note }) => ({ id, name, category, desc, note })); setReady(true); }, []);
  return <main className="p-6 text-[13px] text-mute"><h1 className="text-ink text-[16px] font-semibold">Lumen headless runner</h1><p data-testid="headless-ready" className="mt-2">{ready ? "ready" : "starting"}: used by the MCP server. Not a user-facing page.</p></main>;
}
