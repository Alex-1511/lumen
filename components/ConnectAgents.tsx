"use client";
// ChatCut-style "Connect an agent" dialog: pick an agent, copy ONE prompt that registers Lumen as a stdio MCP server with the exact command and path,
// then watch a real status dot that turns green only when the agent has actually called a Lumen tool.
import { useCallback, useEffect, useState } from "react";
import Icon from "./Icon";

interface Info { root: string; server: string; url: string; command: string; args: string[]; lastSeen: number; lastTool: string; calls: number; now: number }
const AGENTS = [
  { id: "any", label: "Connect any agent", hint: "Works with any MCP client that can run a stdio server." },
  { id: "claude-code", label: "Claude Code", hint: "Runs the `claude mcp add` command for you." },
  { id: "codex", label: "Codex CLI", hint: "Edits ~/.codex/config.toml." },
  { id: "antigravity", label: "Antigravity", hint: "Adds the server to its MCP raw config." },
  { id: "cowork", label: "Claude Desktop / Cowork", hint: "Edits claude_desktop_config.json." },
] as const;
type AgentId = (typeof AGENTS)[number]["id"];
const q = (s: string) => (/[\s"']/.test(s) ? JSON.stringify(s) : s);

export function agentPrompt(id: AgentId, i: Info): string {
  const cmd = `${i.command} ${i.args.map(q).join(" ")}`, env = `LUMEN_URL=${i.url}`;
  const test = `After registering it, restart yourself if required, then call the tool lumen_status and tell me what it returns. Then call lumen_analyze_image on any image I give you.`;
  const common = `Lumen is a photo editor running at ${i.url}. Its MCP server is a stdio server (not HTTP). It needs Node 20+, and once per machine: \`cd ${q(i.root)} && npm i && npx playwright install chromium\`.`;
  const how: Record<AgentId, string> = {
    any: `Register an MCP server named "lumen" with transport stdio, command \`${i.command}\`, args ${JSON.stringify(i.args)}, working directory ${i.root}, and environment variable ${env}.`,
    "claude-code": `Run exactly: \`claude mcp add lumen --env ${env} -- ${cmd}\``,
    codex: `Append this to ~/.codex/config.toml (keep existing content):\n\n[mcp_servers.lumen]\ncommand = "${i.command}"\nargs = ${JSON.stringify(i.args)}\ncwd = ${JSON.stringify(i.root)}\nenv = { LUMEN_URL = "${i.url}" }`,
    antigravity: `Open the Agent panel, Manage MCP Servers, View raw config, and add under "mcpServers":\n\n"lumen": ${JSON.stringify({ command: i.command, args: i.args, env: { LUMEN_URL: i.url } })}`,
    cowork: `Add to the "mcpServers" object in claude_desktop_config.json (keep other servers):\n\n"lumen": ${JSON.stringify({ command: i.command, args: i.args, env: { LUMEN_URL: i.url } })}`,
  };
  return `${common}\n\n${how[id]}\n\n${test}`;
}

export default function ConnectAgents({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null); const [err, setErr] = useState(""); const [agent, setAgent] = useState<AgentId>("any"); const [copied, setCopied] = useState(false); const [tick, setTick] = useState(0);
  const load = useCallback(async () => { try { const r = await fetch("/api/mcp-info", { cache: "no-store" }); const j = await r.json(); if (!r.ok) { setErr(j.error ?? "Unavailable."); setInfo(null); } else { setInfo(j); setErr(""); } } catch { setErr("Could not reach Lumen."); } }, []);
  useEffect(() => { if (!open) return; load(); const t = setInterval(() => { load(); setTick((x) => x + 1); }, 2500); return () => clearInterval(t); }, [open, load]);
  if (!open) return null;
  const prompt = info ? agentPrompt(agent, info) : ""; const age = info?.lastSeen ? Math.max(0, Math.round((info.now - info.lastSeen) / 1000)) : null; const live = age !== null && age < 120;
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setErr("Copy was blocked by the browser. Select the text and copy it manually."); } };
  return <div role="dialog" aria-label="Connect an agent" data-testid="connect-dialog" className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
    <div className="w-[560px] max-w-full rounded-xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-1 flex items-center justify-between"><h2 className="text-[16px] font-semibold">Connect an agent to Lumen</h2><button aria-label="Close" className="btn btn-ghost !p-1" onClick={onClose}><Icon name="close" size={14} /></button></div>
      <p className="mb-3 text-[12px] text-mute">Let Claude Code, Codex, Antigravity or any MCP agent edit photos with Lumen's real renderer. Pick your agent, copy the prompt, paste it into that agent.</p>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">{AGENTS.map((a) => <button key={a.id} role="tab" aria-selected={agent === a.id} data-testid={`agent-${a.id}`} onClick={() => setAgent(a.id)} className={`btn px-2.5 py-1 text-[12px] ${agent === a.id ? "border-acc text-ink" : ""}`}>{a.label}</button>)}</div>
      <p className="mb-2 text-[11px] text-mute">{AGENTS.find((a) => a.id === agent)!.hint}</p>
      {err ? <p data-testid="connect-error" className="rounded border border-line p-3 text-[12px] text-bad">{err}</p> :
        <pre data-testid="connect-prompt" className="mb-3 max-h-[240px] overflow-auto whitespace-pre-wrap rounded border border-line bg-[#0c0c0c] p-3 text-[11px] leading-relaxed text-ink">{prompt || "Loading…"}</pre>}
      <div className="mb-4 flex items-center gap-3"><button data-testid="connect-copy" disabled={!info} onClick={copy} className="btn btn-primary px-3 py-1.5">{copied ? "Copied" : "Copy prompt"}</button>
        <span data-testid="connect-status" data-live={live} className="flex items-center gap-2 text-[12px]"><span className={`h-2 w-2 rounded-full ${live ? "bg-[#3ddc84]" : "bg-[#666]"}`} />{live ? `Agent connected: last call ${info!.lastTool} ${age}s ago` : info?.calls ? `Last agent call ${age}s ago` : "Waiting for an agent to call a Lumen tool…"}</span></div>
      <details className="text-[11px] text-mute"><summary className="cursor-pointer">What this does and does not do</summary><ul className="mt-1 list-disc space-y-1 pl-4"><li>The agent runs a local stdio server on your machine. Nothing is uploaded by Lumen.</li><li>No Gemini key is needed or exposed through MCP.</li><li>The green dot turns on only after the agent really calls a Lumen tool, so it can never show "connected" falsely.</li><li>I tested the server with the official MCP client SDK. The per-agent steps follow each tool's documented config shape but I could not run those apps myself, so tell me if one differs.</li></ul></details>
    </div></div>;
}
