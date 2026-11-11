// Reference library helpers (browser only). A reference is measured once; only its numeric style profile and a small thumbnail are stored.
import { gradeStatsOf } from "./gradefit";
import { analyse } from "./analysis";
import { styleProfile } from "./reference";
import { RefPhoto, putRef, uid } from "./store";

export const MAX_REF_BYTES = 12 * 1024 * 1024;
export type AddRefResult = { ok: true; ref: RefPhoto } | { ok: false; error: string };

export async function addReference(file: File, note = ""): Promise<AddRefResult> {
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return { ok: false, error: `${file.name}: not an image file.` };
  if (file.size > MAX_REF_BYTES) return { ok: false, error: `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is 12 MB per reference.` };
  try {
    const b = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, 640 / Math.max(b.width, b.height)), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(b.width * s)); c.height = Math.max(1, Math.round(b.height * s));
    const g = c.getContext("2d")!; g.drawImage(b, 0, 0, c.width, c.height); const px = g.getImageData(0, 0, c.width, c.height), profile = styleProfile(analyse(px.data, c.width, c.height)), grade = gradeStatsOf(px.data);
    const sc = Math.min(1, 240 / Math.max(b.width, b.height)), t = document.createElement("canvas"); t.width = Math.max(1, Math.round(b.width * sc)); t.height = Math.max(1, Math.round(b.height * sc)); t.getContext("2d")!.drawImage(b, 0, 0, t.width, t.height); b.close();
    const thumb = await new Promise<Blob>((r) => t.toBlob((x) => r(x!), "image/jpeg", 0.8));
    const ref: RefPhoto = { id: uid(), name: file.name.replace(/\.[^.]+$/, ""), created: Date.now(), thumb, profile, bytes: file.size, note, grade }; await putRef(ref); return { ok: true, ref };
  } catch { return { ok: false, error: `${file.name}: this browser could not decode that file.` }; }
}
