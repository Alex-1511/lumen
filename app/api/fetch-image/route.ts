import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { checkImageUrl, isPrivateIp } from "@/lib/safeurl";
export const runtime = "nodejs";
const MAX = 8 * 1024 * 1024;
// Fetches ONE direct image link (not a web page) so the browser can measure its colour grade. SSRF-guarded: https only, public IPs only, image content type, size cap, no credentials.
export async function POST(req: Request) {
  const { url } = await req.json().catch(() => ({}));
  if (typeof url !== "string") return NextResponse.json({ error: "Missing link." }, { status: 400 });
  let cur = url;
  for (let hop = 0; hop < 3; hop++) {
    const c = checkImageUrl(cur); if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    try { const addrs = await lookup(c.url.hostname, { all: true }); if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return NextResponse.json({ error: "That host resolves to a private address." }, { status: 400 }); }
    catch { return NextResponse.json({ error: "Could not resolve that host." }, { status: 502 }); }
    let res: Response; try { res = await fetch(c.url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Lumen-grade-reader/1.0", Accept: "image/*" } }); } catch { return NextResponse.json({ error: "The link could not be reached." }, { status: 502 }); }
    if (res.status >= 300 && res.status < 400) { const loc = res.headers.get("location"); if (!loc) return NextResponse.json({ error: "Bad redirect." }, { status: 502 }); cur = new URL(loc, c.url).toString(); continue; }
    if (!res.ok) return NextResponse.json({ error: `The server answered ${res.status}.` }, { status: 502 });
    const type = res.headers.get("content-type") ?? ""; if (!/^image\/(jpeg|png|webp)/i.test(type)) return NextResponse.json({ error: "That link is not a direct JPEG, PNG or WebP image (it looks like a web page). Open the image itself and copy its address, or upload the file." }, { status: 415 });
    const len = Number(res.headers.get("content-length") ?? 0); if (len > MAX) return NextResponse.json({ error: "Image is larger than 8 MB." }, { status: 413 });
    const reader = res.body?.getReader(); if (!reader) return NextResponse.json({ error: "Empty response." }, { status: 502 });
    const chunks: Uint8Array[] = []; let total = 0; for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX) { await reader.cancel(); return NextResponse.json({ error: "Image is larger than 8 MB." }, { status: 413 }); } chunks.push(value); }
    return new NextResponse(Buffer.concat(chunks), { headers: { "Content-Type": type.split(";")[0], "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Too many redirects." }, { status: 502 });
}
