"use client";
import { useEffect, useState } from "react";
/** Object URLs for blobs, revoked on cleanup (avoids leaking a URL on every render). */
export function useThumbs<T extends { id: string; thumb?: Blob }>(items: T[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { const m: Record<string, string> = {}; for (const i of items) if (i.thumb && i.thumb.size) m[i.id] = URL.createObjectURL(i.thumb); setUrls(m); return () => Object.values(m).forEach((u) => URL.revokeObjectURL(u)); }, [items]);
  return urls;
}
