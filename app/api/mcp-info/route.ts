import { NextResponse } from "next/server";
import path from "node:path";
export const runtime = "nodejs";
// Local-only. GET gives the exact command + path an agent needs. POST is a heartbeat sent by the MCP server on every tool call,
// so the app can show a REAL "agent connected" state (nothing is pretended: no heartbeat, no green dot).
const g = globalThis as any; g.__lumenMcp ??= { lastSeen: 0, tool: "", calls: 0 };
function isLocal(req: Request) { const h = (req.headers.get("host") ?? "").split(":")[0].replace(/^\[|\]$/g, ""); return h === "localhost" || h === "127.0.0.1" || h === "::1"; }
export async function GET(req: Request) {
  if (!isLocal(req)) return NextResponse.json({ error: "Agent setup is only available on the machine running Lumen." }, { status: 403 });
  const origin = new URL(req.url).origin, root = process.cwd(), server = path.join(root, "mcp", "server.mts");
  const st = g.__lumenMcp; return NextResponse.json({ root, server, url: origin, command: "npx", args: ["tsx", server], lastSeen: st.lastSeen, lastTool: st.tool, calls: st.calls, now: Date.now() });
}
export async function POST(req: Request) {
  if (!isLocal(req)) return NextResponse.json({ error: "Not allowed from here." }, { status: 403 });
  const b = await req.json().catch(() => ({})); const st = g.__lumenMcp; st.lastSeen = Date.now(); st.tool = String(b.tool ?? "").slice(0, 60); st.calls++; return NextResponse.json({ ok: true });
}
