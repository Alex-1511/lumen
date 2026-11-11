# Lumen

Photographic post-production in the browser. Upload, analyse, understand, plan, edit, refine, export.

Everything the editor does to pixels is real code running on your machine (a WebGL2 fragment shader plus a few CPU analysis passes). Nothing is faked, and anything not built is labelled as such in the app (`/capabilities`) and in [`docs/CAPABILITIES.md`](docs/CAPABILITIES.md).

## Run it

```bash
npm install
npm run build && npm start   # http://localhost:3000
```

**Gemini (optional).** Open **Settings** in the app and paste your key, then press *Test connection*. The key is saved server-side in `.lumen/gemini.json` (git-ignored, file mode 600). You can instead set `GEMINI_API_KEY` in `.env.local` or the host environment; that takes priority. Without a key everything works except "Run AI analysis" and "Ask Gemini", which tell you to open Settings. On a hosted deployment (any non-localhost host) the Settings page cannot write a key; use an environment variable.

**Gemini key safety.** The key lives only on the server (env var or `.lumen/gemini.json`) and is read only by the server routes (`app/api/analyze`, `app/api/assist`, `app/api/settings` for the connection test). `/api/settings` only ever reports whether a key exists, never the key. It is never sent to the browser. If you ever pasted a key into a chat or a screenshot, rotate it in Google AI Studio and put the new one in `.env.local`.

## The app

- **Home** (`/`): a prompt-first start. Add a photo, type what you want (or leave it empty and Lumen decides), press Edit. You land in the editor with the edit already applied and the Report open.
- **Projects**, **Style library**, **Presets**, **Capabilities**, **Settings**: left sidebar.
- **Editor**: top bar (undo/redo, hold-for-before, Export), tool rail (crop, linear/radial/brush/colour/luminance masks), left dock (Assistant action log, Insight, Report, History), large canvas with compare, thirds, clipping, zoom and a filmstrip of your other photos, right panel (live histogram, Develop sections, Masks, Looks = presets and reference matching).
- **Export**: one photo downloads as a plain image file. Only two or more photos from Projects are bundled into a ZIP.

## What it does

- **Import**: JPEG, PNG, WebP (HEIC only where your browser decodes it). EXIF is read for display. The original blob is stored once and never rewritten.
- **Analyse** (CPU, no network): histogram, clipping, white-balance cast, sharpness, noise, exposure state, subject box, sky heuristic, light direction, horizon tilt, style descriptors.
- **Plan**: a threshold-based recipe that preserves what is already good. Every item shows its reason, expected effect, strength, and whether it is a correction, an enhancement, or generative (nothing generative exists yet).
- **Edit** (non-destructive, parametric): exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance, saturation, 8-band HSL, draggable tone curve + presets, sharpen, texture, clarity, noise reduction, dehaze, bloom, halation, vignette, grain, B&W, straighten, crop, lens distortion, chromatic aberration, keystone.
- **Local adjustments** (up to 4 layers): linear, radial, luminance range, colour range, brush, each with invert, feather, density, and luminance/colour limiters. Subject, background and sky presets are approximations and are labelled so.
- **Ask for an edit**: in the Assistant tab choose *My request* (type what you want; an offline phrase interpreter shows exactly what it understood, and Gemini is optional for free-form wording) or *Simple AI edit* (the system decides from measurements). Removal, retouching and generative requests are refused, not faked.
- **Edit report**: after any edit a Report tab shows what was edited, how (parameter, before/after), why, the glossary terms used (with implemented/partial status), the tools used (shader stage, kernels, Gemini only if it was used), your request text, and the limits. Copy or download as Markdown.
- **Style library and learning** (`/library`): upload edited reference photos (up to 12 MB each). Lumen keeps their measured style numbers and a thumbnail. Your feedback on edits (like / not quite / a comment, plus the changes you made yourself) is stored too. Together they drive a visible "Personal style (learned)" plan item and a "Learned style" reference. **This is statistics, not neural-network training**: a confidence-weighted average of your corrections, clamped to safe limits, needing at least 2 entries, frozen per project so a saved edit never changes silently. Nothing leaves your browser.
- **Reference matching**: pick a reference photo and Lumen moves global tone/colour toward it, scaled by a strength slider.
- **History, snapshots, virtual copies, before/after, clipping warning.**
- **Presets and batch**: save your manual edits as a named look; on Projects select photos, apply a preset, export (one photo = plain file, several = ZIP).
- **Effects** (Effects tab, 33): Box/Gaussian/Mosaic/Motion Blur, Sharpen, Tilt-Shift, Bokeh, Soft Focus, Cinematic, Vibrant, Teal & Orange, Matte, Vintage, Film Noir and more. Search, A-Z, favourites, strength. Each applies real parameters you can still adjust.
- **Retouch** (Retouch tab): spot removal, heal, clone, object removal on real pixels, stored as undoable steps and replayed at export. Object removal copies patches from the same photo (no generative model).
- **Export**: JPEG, PNG, WebP, baseline TIFF; SDR or HDR (16-bit PNG, BT.2020 + PQ, expanded from SDR, capped 3840 px); original, 360p, 480p, 720p, 1080p, 4K, 8K by long edge (Lanczos-3, no new detail when enlarging); text watermark. Re-rendered from the original.
- **MCP server** (`npm run mcp`, see `docs/MCP.md`): lets Antigravity, Codex or Cowork edit photos through Lumen.

## New in Session 5
Grade tab (match a still, a named look or a library photo), 3D LUT and gradient maps, waveform/vectorscope, effects with kinds and masks, AI that builds masks, in-app agent connection, experimental AI edit, output sharpening and responsive export. See docs/DEVLOG.md.

## Honest limits

See `docs/GAPS.md` for the full, section-by-section list of what the original brief asked for and is not built yet.

- 8-bit in, 8-bit out, sRGB assumed. No ICC embedding, no EXIF preservation (metadata is stripped on export), no RAW, no 16-bit.
- Subject/sky masks are heuristics, not segmentation. There is no healing, clone, object removal, generative fill, upscaling, or depth.
- Data lives in this browser's IndexedDB only. No accounts, no cloud sync. Clearing site data deletes projects.
- The Gemini routes were written to spec and tested for input handling, but could not be called live from the build sandbox (outbound requests were blocked). First real call will tell you if the model name or response shape needs a tweak.
- Free-form requests offline are limited to the interpreter's fixed vocabulary. Anything else is reported as "not understood".
- "Learning" is not model training (see above).
- Browser tests run on a software GL renderer, so they prove correctness, not speed.

## Tests

```bash
npm test                        # 78 unit tests: analysis, planner, masks, reference, presets, zip, TIFF, intent, report, learning, registry integrity
npx next build && npx next start -p 3100 &   # then, with Playwright installed globally:
NODE_PATH=$(npm root -g) npx tsx tests/browser.ts          # import, edit, history, export, persistence
NODE_PATH=$(npm root -g) npx tsx tests/browser-masks.ts    # local masks, overlay, brush
NODE_PATH=$(npm root -g) npx tsx tests/browser-ref.ts      # reference matching
NODE_PATH=$(npm root -g) npx tsx tests/browser-optics.ts   # dehaze, bloom, halation, CA, distortion, keystone
NODE_PATH=$(npm root -g) npx tsx tests/browser-curve.ts    # curve editor
NODE_PATH=$(npm root -g) npx tsx tests/browser-export.ts   # TIFF/PNG, resize, watermark
NODE_PATH=$(npm root -g) npx tsx tests/browser-batch.ts    # presets + batch ZIP
NODE_PATH=$(npm root -g) npx tsx tests/browser-grade.ts    # split toning
NODE_PATH=$(npm root -g) npx tsx tests/browser-assist.ts   # requests, simple AI edit, report, feedback, learned item
NODE_PATH=$(npm root -g) npx tsx tests/browser-library.ts  # reference library, 12 MB limit
NODE_PATH=$(npm root -g) npx tsx tests/browser-home.ts     # Home prompt flow, single-file export, Settings API, editor shell
```

Headless Chromium needs `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist` (already set in the tests). Kill the old server on the port before restarting after a rebuild.

## Layout

```
app/            Next.js routes: home, projects, presets, settings, library, capabilities, editor, api/analyze, api/assist, api/settings
components/     Shell (sidebar), Icon, AiStatus, CurveEditor, useThumbs
                app/library: style library page
lib/            secrets (server-only key store), import (photo import), params (edit model), renderer (WebGL), analysis, planner, masks, reference, intent (request parser),
                report, learn (style memory), library (reference upload),
                pipeline (shared export path), export (TIFF/watermark), zip, store (IndexedDB), gemini
data/           glossary.txt (872 terms) and registry.json (generated)
scripts/        build-registry.ts, gen-checklist.ts
docs/           CAPABILITIES.md (generated), DEVLOG.md
tests/          unit + Playwright suites and fixtures
```

## Capability registry

Every glossary term defaults to `unsupported`. `scripts/build-registry.ts` upgrades a term only when a rule names real code (a parameter, a function, a mask type), and the unit tests verify those links. After changing a rule run `npx tsx scripts/build-registry.ts && npx tsx scripts/gen-checklist.ts`.
