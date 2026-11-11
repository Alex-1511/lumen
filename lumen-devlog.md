# Dev log

Newest first. Each entry says what changed, what was verified, and what is still open.

## Session 3
- **Edit requests**: `lib/intent.ts` phrase table with strength words, matched-phrase consumption (so "shadows too dark" does not also raise exposure), explicit refusals for generative/retouch requests. Assistant tab now has *My request* and *Simple AI edit* modes.
- **Edit report**: `lib/report.ts` builds the report from the real state (plan items, manual layer, masks, event log) and resolves glossary terms/tools through the registry, so it cannot name something that does not exist.
- **Style library + learning**: feedback store (DB v4), `lib/learn.ts` (weighted mean of corrections, shrunk by N/(N+4), clamped, min 2 entries), planner hook with guards (skip exposure on already-bright photos, skip colour balance when a cast is being corrected), learned bias frozen per project. 12 MB reference limit shared by the library page and the editor.
- **Bug found while testing**: `recipeToParams` silently dropped `dehaze`, bloom, halation, grading and optics values, so the planner's dehaze proposal never reached the render. Fixed with a regression test.
- **Determinism**: two exports of the same edit are byte-identical (test).
- Colour grading (split toning) added; presets store; batch ZIP.

## Session 3: UI/UX rebuild (user feedback)
Feedback: single photo exported as a ZIP; landing page confusing; UI not Lightroom/Photoshop-grade; "GEMINI_API_KEY is not set".
- **Export**: batch of one now downloads the image itself; ZIP only for 2+. Per-photo Export button on Projects. Test proves both.
- **AI key**: the key is intentionally not shipped in the zip. Added Settings page + `/api/settings` (localhost-only write, never returns the key, real test call) + `lib/secrets.ts`. Sidebar and editor show an honest AI status pill; errors say "open Settings" instead of naming an env var.
- **Design system**: neutral dark, flat panels, one blue accent, violet only for AI-originated values, Lightroom-style sliders (centre-zero fill, AI contribution shown). No gradients except the slider fill.
- **Home**: prompt-first (`/?`), sidebar nav, starter requests (all phrased in words the offline interpreter really understands), recents. Empty prompt = simple AI edit. `?ask=` / `?auto=1` are consumed once and removed from the URL.
- **Editor**: tool rail, left dock (Assistant action log like a chat, Insight, Report, History), canvas with filmstrip, right panel (histogram, Develop accordion, Masks, Looks), export dialog. Retouching section is present and says "not built".
- **Bug found by test**: Home read the FileList lazily after the input was cleared, so the attached photo vanished. Snapshot first.
- **Tests**: all browser suites ported through `tests/_ui.ts` (stable data-testids); new `browser-home.ts`. Everything green.
- Not addressed this session: see `docs/GAPS.md`.

## Session 2 (continued)
- **Optics**: bloom reach widened (3 rings, 24 taps). The old test measured 20px beyond the disc edge where the 17px kernel could not reach; the shader was fine for the old test but too weak to be useful, so both were changed. Perspective test now uses a fixture with bars away from the edges, because the extra zoom that hides empty corners crops edge bars out of frame.
- **Curve editor**: draggable SVG editor (add, drag, double-click delete, reset). Bug found by test: `setPointerCapture` retargets click events to the SVG, so a double-click handler on the circle never fired; delete is now handled at the SVG level with nearest-point lookup.
- **Export**: shared `lib/pipeline.ts`; baseline TIFF encoder (verified by an independent reader, PIL); long-edge resize; text watermark (test proves only the bottom-right changes).
- **Presets and batch**: presets store (DB v3), ZIP writer (CRC checked by Python `zipfile`), dashboard selection, batch apply and batch export through the same pipeline as the editor.
- **Test infra**: the masks suite "hung" because each grab serialised ~6.8M numbers out of the page and the page eventually failed while the open browser kept node alive. Grabs there are now a 480px downsample. tsconfig excludes `tests/browser*.ts` by glob.
- **Registry**: TIFF, watermarking, preset, batch processing moved off "planned".

## Session 1
- Core: IndexedDB projects, WebGL2 parametric renderer, CPU analysis, planner, history/snapshots/virtual copies, export, persistence.
- Masks: linear, radial, luminance, colour range, brush, with limiters; stored in source-normalised coordinates so they follow crop and straighten.
- Reference matcher: global deltas only, strength-scaled.
- Gemini boundary: server routes with a whitelist/clamp on anything the model returns that touches parameters.
- Registry: generated from the glossary; default `unsupported`.
- Bugs worth remembering: upside-down render (y-down mapping), horizon detector angle fold and 1px-edge staircase bias, low-key vs underexposed ambiguity (`lowKey` needs p99 ≥ 0.6), a stale server on the test port causing mismatched builds, and a failing `&&` chain that skipped a rebuild.

## Open
- Live Gemini call untested (sandbox network).
- No real reference photos were supplied (the PDF was blank).
- Not built: auth, RAW/TIFF import, ICC, EXIF preservation, real segmentation, healing/clone, generative tools, upscaling, 16-bit.


## Session 4 (2026-11-09)
Triggered by user feedback: exported file equalled the original, Gemini timeouts, retouching missing, no effects library, no MCP, no HDR or resolution options.

- **Export-original bug**: reproduced (exposure saved 0.25 but export luma 66.1 vs original 69.7). Cause: debounced save was dropped when leaving the editor quickly. Fix: pending patch merged and flushed on unmount, pagehide and visibilitychange. Regression `tests/browser-persist.ts` passes. (I first set its threshold to +8 luma, which 0.25 EV cannot produce; fixed the test, not the code.)
- **Export**: SDR/HDR, 360p to 8K via Lanczos-3, pixel-difference evidence line. HDR is inverse-tone-mapped SDR in a 16-bit PNG with a cICP chunk, capped to 3840 px.
- **Effects**: 33 effects in a new Effects tab (search, A-Z, favourites, chips, strength). Shader passes for blur family, tilt-shift, bokeh, soft focus, fade. Browser pixel tests (24) check direction of change (edge energy drops for blurs, rises for sharpen, saturation collapses for B&W, 2.39 crop for anamorphic). Initial test failures were weak fixtures (flat sky) and a focus ellipse that covered the whole frame; I used a detailed fixture and capped the ellipse.
- **Retouch**: `lib/retouch.ts`. Heal error vs ground truth 165 -> 2.6 (plain clone 48); spot 90 -> 3; stripe inpainting 80 -> 14. Browser test removes a disc from the canvas and from the exported file. I removed an `|| true` that made one of my own assertions meaningless.
- **Gemini**: retry, fallback models, 40 s per attempt; `tests/unit-gemini.ts` mocks the network (8 checks).
- **MCP**: `mcp/server.mts` + `/headless`; `tests/mcp-client.mts` 12 checks with the official client.
- **Registry**: 17 rules upgraded with specific notes. 872 "all implemented" declined with reasons in GAPS.

## Session 5 (2026-11-09 to 11-10)
Triggered by feedback: AI did not use masks, effects had no kinds or amounts, AI UI felt gimmicky, grading was weak, MCP setup should live in the app, landing page was boring, 31 planned items.

- **Masks by AI**: the Gemini plan now returns `masks` (target + whitelisted, clamped adjustments + "protect highlights"). The offline interpreter is target aware (`lib/targets.ts`: leaves, sky, water, skin, shadows, highlights, foreground, background, subject) and builds real mask layers. The earlier answer "no masks" was wrong: masks existed, the assistant did not use them. Targets are approximate (colour/luminance ranges, gradients, subject ellipse), and the UI says so.
- **Effects on masks**: local adjust gained sharpen, gaussian and motion blur, mosaic, soft focus, fade, grain (shader `uAC/uAD`). Effects can target a mask layer; browser pixel test checks the change stays inside the region.
- **Effects v2**: families with variants (`lib/looks.ts`: Cinematic, Nature > Wildlife/Space/Sky/Flora, Portrait, Street, Landscape), typed variant matching ("old cinematic warmer"), per-effect strength, stacked `fx` items resolved by `lib/fx.ts` for preview, export and MCP alike.
- **Grade fitting** (`lib/gradefit.ts`): measures luma percentiles, per-zone tint and saturation, then coordinate-descent over slider values using the real renderer at 224 px. Recovers known grades (distance -70% to -95%). Grade tab: uploads, direct image links, library photos, or a named show/photographer (Gemini estimate, labelled "not measured"). Day and night frames are separated by median luma. Instagram pages are refused (login + scraping forbidden); `/api/fetch-image` is SSRF guarded (unit tested).
- **3D LUT + gradient map**: `.cube` (1D/3D) parser, GPU 3D texture, amount slider, included in exports and MCP. Browser test on the real renderer: identity unchanged, invert inverts, 50% blends halfway.
- **Scopes**: waveform and vectorscope of the live preview; test shows the vectorscope collapsing to centre after Black & White.
- **Export**: output sharpening (screen/print) and a responsive web set (480/768/1280/1920, never above source).
- **Effects added**: Bleach Bypass, Cross Processing, Filmic Tone Map (approximations, noted).
- **AI edit (experimental)**: Gemini image model via `/api/generative-edit` for people removal, clothing, pose, relight, outpaint. Returned as a separate project, never replaces the original. Tested with a mocked model only; live output cannot be asserted from the sandbox.
- **MCP in the app**: Connect-agent dialog (any agent, Claude Code, Codex CLI, Antigravity, Claude Desktop), copyable prompt with the exact command and absolute path, and a status dot driven by real heartbeats from the MCP server (never shows connected falsely).
- **Home page**: edge-lit hero, blue-black / warm-black theme switch, prompt box with category chips and agent pill.
- **Registry**: planned items 31 -> 0. 7 implemented, 4 partial, 2 experimental, the rest honestly `unsupported` with reasons (RAW, focus stacking, progressive JPEG, depth, neural upscaling...).
- **Regressions caught by the suite and fixed**: "shadows too dark" became a mask instead of the Shadows slider; "remove the person and make it warmer" applied warmth to the person only. Both fixed in `lib/intent.ts`.
