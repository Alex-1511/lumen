# Gap audit against the Builder Prompt

Written honestly. "Built" means it runs and a test proves it. Status as of Session 4 (effects, retouching, export ladder, MCP).

## Flow: UPLOAD, ANALYSE, UNDERSTAND, CATEGORISE, PLAN, EDIT, REFINE, EXPORT
| Stage | Status |
|---|---|
| Upload | Built for JPEG/PNG/WebP (HEIC only if the browser decodes it). **Missing:** RAW, TIFF, DNG, HEIC decoding. |
| Analyse | Built (histogram, clipping, cast, sharpness, noise, horizon, light direction). |
| Understand | Partial: heuristics offline; Gemini adds subject, mood, lighting, composition (needs your key, never live-tested by me). |
| Categorise | Partial: one primary genre (+ secondaries from Gemini). **Missing:** a trained multi-label classifier. |
| Plan | Built, threshold-based, preserves what works, explains each item. |
| Edit | Built for global tone/colour/detail/optics, curves, HSL, grading, 4 local masks. |
| Refine | Built: assistant, offline interpreter, feedback, history, snapshots. |
| Export | Built: JPEG/PNG/WebP/TIFF 8-bit, SDR or HDR (16-bit PNG, BT.2020 + PQ, expanded from SDR, capped 3840 px), 360p to 8K ladder with Lanczos-3. **Missing:** ICC profile, EXIF preservation, output sharpening, true HDR from RAW or multi-exposure. |

## Editing capabilities not built
- Real segmentation (subject, sky, animal, face, eye, hair), depth masks, add/subtract mask boolean ops. Present masks are geometric or heuristic and labelled "approximate".
- Generative fill, neural upscaling, relighting, background replace, outpainting. The app refuses these requests instead of faking them. (Spot removal, heal, clone and object removal ARE built now; object removal is exemplar inpainting from the same photo, so large or unique areas can look repetitive. Upscaling is Lanczos, no new detail.)
- Lens-profile auto correction (manual distortion/CA/keystone only).
- Masking by AI prompt.

## Product features not built
- Accounts, cloud sync, collections, sharing. Everything is stored in this browser.
- Editing-history across devices; saved recipes beyond local presets.
- Technique knowledge base with the full schema (definition, purpose, genres, dependencies, artefacts, limitations). Today: the 872-term registry with status and implementation links.
- Per-genre strategies beyond the planner's basic genre adjustments.
- An evaluation framework with visual-regression on genre photo sets (needs real reference photos; the supplied PDF was blank).
- Instagram reference analysis (needs access I do not have).

## "Learning"
Statistics over your reference photos and feedback (weighted means, shrunk, clamped, visible and removable). It is not neural training and does not make the model "grow".

## Delivery
- Web app only. A Play Store version needs a wrapper (for example a PWA or Capacitor) plus native file access and a hosted backend for the AI key. Not started.
- Gemini routes untested live from my sandbox (outbound calls blocked). Use Settings, Test connection.

## Session 4 additions (all tested)
- Effects library (33): Box, Gaussian, Mosaic, Motion blur, Sharpen, Tilt-Shift, Bokeh, Soft Focus, Cinematic, Vibrant, Teal & Orange, Matte, Vintage and more. Each is a bundle of real parameters on the manual layer. Bokeh and tilt-shift use a subject ellipse, not a depth map.
- Retouch tab: spot, heal, clone, object removal. Steps are stored on the project and replayed on the original (also in batch export).
- MCP server (`docs/MCP.md`): verified with the official MCP client SDK. Not verified inside Antigravity, Codex or Cowork themselves.
- Gemini: retries, fallback models, longer timeouts, mocked-network tests. The live "timeout" cannot be reproduced from my sandbox.
- Bug fixed: a quick edit then leaving the editor could export the original (debounced save). Regression test added.

## "All 872 implemented"
Not truthfully achievable, and the registry will not pretend. Many terms are hardware (pixel binning, dual-pixel), RAW decoder internals (demosaicing), print/lab processes, video, or section headings that are not operations. Current counts are in `docs/CAPABILITIES.md`.

## Session 5 additions (tested unless noted)
- AI uses masks (Gemini plan + offline interpreter) and effects can be applied to a mask. Masks are approximate, not segmentation.
- Grade tab (stills, links, library, named look) with closed-loop fitting and measured before/after distance. A named show or photographer is the AI's knowledge, not measured. Instagram is refused on purpose.
- 3D LUT, gradient map, waveform, vectorscope, output sharpening, responsive export.
- In-app agent connection dialog. The per-agent steps follow each tool's documented config but I could only run the MCP server itself, with the official SDK client.
- AI edit (experimental): people removal/moves, clothing, pose, relight, outpaint through Gemini's image model. **Live output untested** (sandbox cannot reach Gemini). Output is smaller than the original and may alter faces, so it only ever creates a separate project.

## Still not built
- Real skin retouch (frequency separation) and real segmentation. "Smooth skin" goes through the experimental AI edit.
- RAW, focus stacking, bracketing/HDR merge, de-ghosting, progressive JPEG, depth estimation, neural upscaling, diffusion denoising, blending modes, Play Store wrapper.
- Instagram analysis by link (blocked by Instagram, not by Lumen). Upload their photos instead.
- Registry status: 0 planned, 744+ unsupported. "All 872 implemented" remains not truthful for hardware, RAW internals, print and video terms.
