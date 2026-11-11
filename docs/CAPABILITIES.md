# Capability checklist

Generated from `data/registry.json` by `scripts/gen-checklist.ts` (872 glossary terms). Do not edit by hand; edit the rules in `scripts/build-registry.ts`.

| Status | Count |
|---|---|
| implemented | 53 |
| partial | 66 |
| ai-assisted | 2 |
| experimental | 4 |
| planned | 0 |
| unsupported | 747 |

## implemented (53)

Works, tested, and does what the name says.

- [x] **Exposure** (`param:exposure`): Linear-light EV gain. 8-bit source, so recovery is limited to existing data.
- [x] **Histogram** (`fn:analyse`): 256-bin luma and RGB.
- [x] **Clipping** (`fn:analyse`): Measured %, plus on-canvas warning overlay.
- [x] **Contrast** (`param:contrast`): Power curve about 0.18 linear grey.
- [x] **Whites** (`param:whites`)
- [x] **Blacks** (`param:blacks`)
- [x] **Tone Curve** (`param:curve`): Monotone cubic master curve with a draggable point editor and presets.
- [x] **Color Temperature** (`param:temperature`): Per-channel gain approximation, not a true Kelvin model.
- [x] **Tint** (`param:temperature`): Per-channel gain approximation, not a true Kelvin model.
- [x] **White Balance** (`param:temperature`): Auto estimate from neutral midtones plus manual sliders.
- [x] **Saturation** (`param:saturation`)
- [x] **Vibrance** (`param:vibrance`)
- [x] **HSL / HSV** (`param:hslH`): 8-band hue/sat/luminance.
- [x] **Color Cast** (`fn:analyse`): Detected from neutral-region bias.
- [x] **3D LUT** (`fn:parseCube`): Grade tab imports .cube files (1D or 3D, DOMAIN supported) and applies them in the shader with trilinear interpolation; included in exports.
- [x] **Sharpness / Acutance** (`param:sharpAmount`): Neighbourhood unsharp in shader.
- [x] **Unsharp Mask** (`param:sharpAmount`): Neighbourhood unsharp in shader.
- [x] **Radius** (`param:sharpRadius`)
- [x] **Rule of Thirds Overlay** (`ui:thirds`): Overlay in editor.
- [x] **Straighten / Leveling** (`param:straighten`): Auto-inscribed zoom hides rotated edges.
- [x] **Spot Healing** (`retouch:spot`): Click a blemish: Lumen searches nearby for the best-matching clean source ring, then blends it in with harmonic colour matching. Tested against ground truth. No texture synthesis for large areas.
- [x] **Clone Stamp** (`retouch:clone`): Set a source, then stamp with a soft edge and fixed offset. Exact copy. Single source (no source palette, no pressure, no rotate/scale).
- [x] **Inverted Mask** (`mask:invert`)
- [x] **Luminosity Masks** (`mask:luminance`): Luminance range with soft edges, usable alone or intersected with another mask. No zone presets.
- [x] **Color Range Mask** (`mask:color`): Hue range + minimum saturation. Usable alone or intersected.
- [x] **Radial Filter / Radial Gradient Mask** (`mask:radial`): Elliptical mask with feather, invert, density. Draggable handles.
- [x] **Linear Gradient Mask** (`mask:linear`): Two-point gradient mask with feather, invert, density.
- [x] **Feathering** (`mask:feather`): Feather control per mask. No post-hoc blur of arbitrary selections.
- [x] **JPEG / JPG** (`arch:export`): Import and export through browser codecs.
- [x] **PNG** (`arch:export`): Import and export through browser codecs.
- [x] **WebP** (`arch:export`): Import and export through browser codecs.
- [x] **Non-Destructive Editing** (`arch:params`): Original blob stored untouched; edits are parameters.
- [x] **Virtual Copies / Snapshots** (`ui:snapshots`): Snapshots implemented. Virtual copies via duplicate project.
- [x] **History State / Undo Buffer** (`ui:history`)
- [x] **Sharpen for Screen vs. Sharpen for Print** (`fn:outputSharpen`): Export option: luminance unsharp mask after resizing, tuned for screen or print.
- [x] **Midtone Contrast** (`param:contrast`): Power curve about 0.18 linear grey.
- [x] **Black Point / White Point Setting** (`param:blacks`): Via blacks/whites sliders and recipe.
- [x] **Exposure Compensation** (`param:exposure`): Linear-light EV gain. 8-bit source, so recovery is limited to existing data.
- [x] **Highlight Roll-off** (`param:highlights`): Luma-weighted gain; cannot restore fully clipped pixels.
- [x] **Shadow Recovery** (`param:shadows`): Luma-weighted gain.
- [x] **Color Cast Neutralization** (`fn:analyse`): Detected from neutral-region bias.
- [x] **Color Range Selection** (`mask:color`): Hue range + minimum saturation. Usable alone or intersected.
- [x] **Edge Feather / Blur** (`mask:feather`): Feather control per mask. No post-hoc blur of arbitrary selections.
- [x] **Healing Brush vs Spot Healing** (`retouch:heal`): Both exist: Heal (manual source, colour and light matched) and Spot removal (automatic source).
- [x] **Gradient Map** (`fn:gradientMapLut`): Grade tab: gradient map presets applied through the GPU 3D LUT path, with an amount slider.
- [x] **Output Sharpening** (`fn:outputSharpen`): Export option: luminance unsharp mask after resizing, tuned for screen or print.
- [x] **Responsive Web Export** (`arch:export-responsive`): Export panel: renders 480/768/1280/1920 px versions (never above the source size) with screen sharpening.
- [x] **Vectorscope** (`fn:vectorBuffer`): Editor scope tab: Cb/Cr vectorscope of the live preview with a skin-tone line.
- [x] **Waveform Monitor** (`fn:waveformBuffer`): Editor scope tab: waveform of the live preview (RGB overlaid).
- [x] **1D LUT vs 3D LUT** (`fn:parseCube`): Grade tab imports .cube files (1D or 3D, DOMAIN supported) and applies them in the shader with trilinear interpolation; included in exports.
- [x] **EXIF Stripping** (`arch:export`): Canvas export carries no EXIF.
- [x] **Tilt-Shift Miniature Faking** (`param:tiltShift`): Sharp horizontal band, graduated blur above and below, small saturation lift.
- [x] **3D LUT Hardware Upload** (`arch:renderer-lut3d`): The LUT is uploaded once as a WebGL2 3D texture (texImage3D) and sampled by the GPU.

## partial (66)

Works, but narrower than the full technique. The note says exactly what is missing.

- [ ] **Dynamic Range** (`fn:analyse`): Estimated from 8-bit percentiles, not sensor dynamic range.
- [ ] **Midtones** (`param:contrast`): No dedicated midtone slider; handled via contrast and curve.
- [ ] **Zebra Patterns** (`ui:clip`): Solid clip warning, not animated zebra.
- [ ] **Color Grading** (`param:gradeShS`): Split toning plus HSL, curve and temperature. No lift/gamma/gain wheels, no LUT import.
- [ ] **Split Toning** (`param:gradeShS`): Shadow and highlight tint (hue + amount) with a balance control. Chroma offsets with no net luminance change; no midtone wheel.
- [ ] **Chromatic Aberration** (`param:ca`): Manual lateral CA correction only (radial R/B scaling). No auto-detection, no purple fringe or axial CA.
- [ ] **Defringe** (`param:ca`): Lateral chromatic aberration slider only. No purple or green fringe colour removal along edges.
- [ ] **Clarity** (`param:clarity`): Large-radius local contrast approximation, midtone weighted.
- [ ] **Texture** (`param:texture`): Small-radius detail approximation.
- [ ] **Dehaze** (`param:dehaze`): Small-window dark-channel estimate, no guided-filter refinement. Can amplify noise and create halos at strong edges.
- [ ] **Microcontrast** (`param:texture`)
- [ ] **Luminance Noise** (`param:nrLuma`): Light 8-tap edge-aware luma and chroma smoothing. Not a denoising model.
- [ ] **Chrominance Noise** (`param:nrLuma`): Light 8-tap edge-aware luma and chroma smoothing. Not a denoising model.
- [ ] **Noise Reduction** (`param:nrLuma`): Light 8-tap edge-aware luma and chroma smoothing. Not a denoising model.
- [ ] **High-ISO Grain vs. Artificial Grain** (`param:grain`): Artificial grain only.
- [ ] **Lens Distortion** (`param:distortion`): Single-coefficient radial model, manual. No lens profiles.
- [ ] **Lens Profile Corrections** (`param:distortion`): Manual distortion, vignette and chromatic aberration sliders. No lens database or automatic profiles.
- [ ] **Vignetting** (`param:vignette`): Creative vignette only. No lens-profile correction.
- [ ] **Aspect Ratio** (`param:crop`): Crop rectangle; presets in UI.
- [ ] **Keystone Correction** (`param:perspV`): Manual vertical/horizontal keystone sliders. No auto-upright and no four-point homography.
- [ ] **Perspective Correction** (`param:perspV`): Manual vertical/horizontal keystone sliders. No auto-upright and no four-point homography.
- [ ] **Upright / Transform Tools** (`param:perspV`): Manual vertical and horizontal perspective sliders and straighten. No automatic Upright (line detection).
- [ ] **Canvas Size vs. Image Size** (`param:crop`): Crop rectangle; presets in UI.
- [ ] **Resolution** (`arch:export`): Export ladder: original, 360p to 8K by long edge, or custom. Enlarging adds no new detail.
- [ ] **Resampling / Interpolation** (`fn:lanczosResize`): Lanczos-3 for export resizing (up and down). No bicubic/bilinear choice.
- [ ] **Content-Aware Fill / Move / Patch** (`retouch:remove`): Fill only: exemplar-based inpainting from the same photo. No Move or Patch tools.
- [ ] **Inpainting / Generative Fill** (`retouch:remove`): Classical exemplar inpainting only. No generative model, so it cannot invent new content.
- [ ] **Dodge and Burn** (`mask:brush`): Achievable manually: brush mask + local exposure. No dedicated tool or automatic frequency separation.
- [ ] **Blemish Removal** (`retouch:spot`): Spot removal handles small blemishes. No skin-aware or frequency-separation retouching.
- [ ] **Object Removal** (`retouch:remove`): Paint over the object; it is filled with patches copied from the rest of the photo. Large masks are solved at reduced resolution and may look repetitive or soft.
- [ ] **Adjustment Layers** (`arch:layers`): Two parametric layers (AI recipe and manual). Not arbitrary user layers.
- [ ] **Layer Masks** (`mask:layers`): Every local layer has its own mask; no pixel layers.
- [ ] **Brush Tool** (`mask:brush`): Size, feather, flow, erase. No stroke smoothing, pressure or edge-aware snapping.
- [ ] **Edge Refinement / Refine Edge / Select and Mask** (`fn:maskFeather`): Masks have feather, invert and range limits. No AI edge detection or hair refinement.
- [ ] **Global Adjustments vs. Local Adjustments** (`arch:params`): Global only until masking phase.
- [ ] **TIFF** (`arch:export`): Baseline TIFF: 8-bit RGB, uncompressed, single strip, 300 dpi tag. No 16-bit, no compression, no ICC profile.
- [ ] **HEIF / HEIC**: Import only where the browser decodes it (Safari).
- [ ] **Bit Depth**: Pipeline is float in shader but 8-bit in and out.
- [ ] **Metadata** (`fn:exif`): EXIF read for display. Not preserved on export.
- [ ] **Catalog / Session Management** (`arch:idb`): Local browser storage; no cloud sync.
- [ ] **Batch Processing** (`arch:batch`): Select photos on the dashboard: apply a preset, export all as one ZIP (format, long edge, text watermark). Sequential, in-browser; no per-photo sync of edits, no watch folders.
- [ ] **Preset** (`arch:presets`): Save/apply your manual layer as a named look (editor and batch). Geometry and lens optics are excluded. No preset sharing or import of other apps' presets.
- [ ] **Watermarking** (`arch:export`): Text watermark burned in at export (position, size, opacity). No logo/image watermarks, no invisible watermarking.
- [ ] **Luminance Curve** (`param:curve`): Master curve applied to RGB, not Lab L.
- [ ] **RGB Curves** (`param:curve`): Master curve only; per-channel curves not implemented.
- [ ] **Color Separation** (`param:hslH`): Via HSL bands only.
- [ ] **Color Grading Wheels** (`param:gradeShS`): Two wheels only (shadows, highlights) with balance. No midtone wheel and no lift/gamma/gain maths.
- [ ] **Intersecting Masks** (`mask:limiters`): Luminance and colour limiters intersect the base mask. No arbitrary add/subtract between separate layers.
- [ ] **Synthetic Bokeh** (`param:bokeh`): 19-tap disc blur with highlight weighting outside an estimated subject ellipse. No depth map or true segmentation, so edges are approximate.
- [ ] **Gaussian Blur** (`param:gaussBlur`): Gaussian-weighted taps over a mip pyramid. Approximates a true Gaussian; not exact at large radii.
- [ ] **Box Blur** (`param:boxBlur`): 3x3 box of mip-pyramid samples. Approximates a square kernel.
- [ ] **Chromatic Aberration** (`param:ca`): Manual lateral CA correction only (radial R/B scaling). No auto-detection, no purple fringe or axial CA.
- [ ] **Selective Color Adjustment** (`param:hslH`): Via HSL bands only.
- [ ] **Color Space Stripping vs Color Space Embedding**: Assumes sRGB; no ICC embedding.
- [ ] **Tone Mapping** (`effect:filmic-tone-map`): Filmic highlight shoulder and lifted toe for 8-bit photos. Not scene-referred HDR tone mapping.
- [ ] **Halation Emulation** (`param:halation`): Thresholded highlight glow tinted red-orange. Not a film-stock model.
- [ ] **Bloom / Diffusion Glow** (`param:bloom`): 24-tap thresholded highlight glow (3 rings, reach about 2.8% of the long edge).
- [ ] **Bleach Bypass** (`effect:bleach-bypass`): Effects tab preset: low saturation, hard S-curve contrast, clarity. An approximation, not the film chemistry.
- [ ] **Cross Processing** (`effect:cross-processing`): Effects tab preset: teal shadows, yellow-green highlights, S curve. Lumen has one luminance curve, not per-channel curves.
- [ ] **Prompt-based Color Grading** (`fn:interpretRequest`): Offline keyword/phrase table maps wording (warmer, moody, teal and orange...) to tone and grade parameters, with strength words. No CLIP, no free-form understanding offline; Gemini is optional for free-form wording.
- [ ] **Keystone Perspective Rectification** (`param:perspV`): Manual vertical and horizontal perspective sliders and straighten. No automatic Upright (line detection).
- [ ] **Sepia Toning** (`effect:sepia`): Effect preset: desaturate plus brown split tone. Not a chemical sepia model.
- [ ] **Motion Blur Synthesis** (`param:motionBlur`): Horizontal only, uniform length. No angle, no per-subject or depth-aware blur.
- [ ] **Sobel Filter** (`fn:analyse`): Laplacian used internally for sharpness and noise.
- [ ] **Laplacian Filter / Laplacian of Gaussian** (`fn:analyse`): Laplacian used internally for sharpness and noise.
- [ ] **Sobel Operator** (`fn:analyse`): Laplacian used internally for sharpness and noise.

## ai-assisted (2)

Needs the server-side Gemini call. Results depend on the model.

- [ ] **Subject Detection / AI Subject Mask** (`api:analyze`): Requires Gemini. Bounding box and labels only; pixel masks not built yet.
- [ ] **Semantic Segmentation Masking** (`api:analyze`): Requires Gemini. Bounding box and labels only; pixel masks not built yet.

## experimental (4)

Heuristic. Can be wrong; labelled as such in the UI.

- [ ] **Sky Detection / AI Sky Mask** (`mask:linear`): Top gradient limited to blue hues. Unreliable on grey, sunset and overcast skies.
- [ ] **Background Mask / Invert Subject** (`mask:radial`): Inverted ellipse around a detected box. Not a segmentation.
- [ ] **Outpainting** (`route:generative-edit`): Retouch tab, AI edit (experimental): an AI image model extends the scene and returns a separate, smaller copy. Result quality is not guaranteed.
- [ ] **Relighting** (`route:generative-edit`): Retouch tab, AI edit (experimental): an AI image model relights the scene and returns a separate copy. Not physically based.

## planned (0)

Feasible, not built.


## unsupported (747)

Not built and not scheduled. Listed in the glossary only.

747 terms from the glossary have no implementation. They are intentionally not listed one by one here; see `/capabilities` in the app for the searchable list.

