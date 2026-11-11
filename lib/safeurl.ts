// SSRF guard for the image-link importer. Pure functions so they can be unit tested without a network.
import { isIP } from "node:net";
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  if (isIP(ip) === 6) { const l = ip.toLowerCase(); if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7)); return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb"); }
  return true;
}
export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };
export function checkImageUrl(raw: string): UrlCheck {
  let u: URL; try { u = new URL(raw.trim()); } catch { return { ok: false, error: "That is not a valid link." }; }
  if (u.protocol !== "https:") return { ok: false, error: "Only https links are accepted." };
  if (u.username || u.password) return { ok: false, error: "Links with credentials are not accepted." };
  const h = u.hostname.toLowerCase();
  if (/(^|\.)instagram\.com$/.test(h) || /(^|\.)cdninstagram\.com$/.test(h) && !/\.(jpe?g|png|webp)(\?|$)/i.test(u.pathname + u.search)) return { ok: false, error: "Instagram pages cannot be fetched: Instagram requires a login and forbids automated scraping. Save 3 to 10 of the photographer's images (screenshots are fine) and upload them here instead." };
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || (isIP(h.replace(/^\[|\]$/g, "")) && isPrivateIp(h.replace(/^\[|\]$/g, "")))) return { ok: false, error: "Private or local addresses are not allowed." };
  if (u.port && u.port !== "443") return { ok: false, error: "Only the standard https port is allowed." };
  return { ok: true, url: u };
}
