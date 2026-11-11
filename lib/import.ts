// Browser-side photo import shared by Home and Projects. The original file is stored untouched; everything else is derived.
import { Project, putProject, uid } from "./store";
export const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function importFile(file: File): Promise<Project> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); // throws if the browser cannot decode (e.g. RAW, TIFF)
  const sc = Math.min(1, 480 / Math.max(bmp.width, bmp.height)); const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const thumb = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.8));
  let exif: Record<string, unknown> | undefined;
  try { const { parse } = await import("exifr"); const e = await parse(file, { pick: ["Make", "Model", "LensModel", "ISO", "FNumber", "ExposureTime", "FocalLength", "DateTimeOriginal"] }); if (e) exif = e; } catch { /* no EXIF is fine */ }
  const w = bmp.width, h = bmp.height; bmp.close();
  return { id: uid(), name: file.name.replace(/\.[^.]+$/, ""), created: Date.now(), updated: Date.now(), original: file, mime: file.type, width: w, height: h, exif, thumb, manual: {}, aiOpacity: 1, enabled: {}, genre: "unknown", intent: "natural", history: [{ label: "Original", manual: {}, aiOpacity: 1, enabled: {}, at: Date.now() }], historyIndex: 0, snapshots: [] };
}

export async function importMany(files: FileList | File[]): Promise<{ projects: Project[]; errors: string[] }> {
  const projects: Project[] = [], errors: string[] = [];
  for (const f of Array.from(files)) {
    try { const p = await importFile(f); await putProject(p); projects.push(p); }
    catch { errors.push(`${f.name}: this browser cannot decode ${f.type || "this format"}. ${/\.(dng|cr3|nef|arw|raf|tiff?)$/i.test(f.name) ? "RAW and TIFF decoding is not built yet. Export a JPEG or PNG for now." : "Try JPEG, PNG or WebP."}`); }
  }
  return { projects, errors };
}
