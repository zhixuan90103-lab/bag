---
title: Research Notes
date: 2026-07-16 11:00
query: "three.js transparent material opacity fade depthWrite depthTest sorting mesh"
type: tech
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
**three.js Transparency, Depth Testing, Z-Fighting, and Layering Techniques**

## Table of Contents
- [Source 1: Stack Overflow - PolygonOffset vs. Transparency for Z-Fighting](#source-1-stack-overflow---polygonoffset-vs-transparency-for-z-fighting)
- [Source 2: GitHub Issue #4724 - Transparency Sorting](#source-2-github-issue-4724---transparency-sorting)
- [Source 3: three.js Docs - Material.depthTest](#source-3-threejs-docs---materialdepthtest)
- [Source 4: Stack Overflow - Transparent Textures and Depth](#source-4-stack-overflow---transparent-textures-and-depth)
- [Source 5: 3D-Tiles-RendererJS-3DGS-Plugin (Gaussian Splats)](#source-5-3d-tiles-rendererjs-3dgs-plugin-gaussian-splats)
- [Source 6: Dustin Pfister Blog - Transparent Materials](#source-6-dustin-pfister-blog---transparent-materials)
- [Summary](#summary)
- [References](#references)

## Source 1: Stack Overflow - PolygonOffset vs. Transparency for Z-Fighting
**URL:** https://stackoverflow.com/questions/49096626/three-js-what-is-more-efficient-to-layer-and-resolve-z-fighting-using-polygono

**Main topic and thesis:** Compares `polygonOffset` (with `polygonOffsetFactor`) versus `transparent: true` + `depthWrite: false` + `renderOrder` for resolving z-fighting on coplanar rectangles in diagramming software, questioning which is more performant (especially on mobile).

**Key points and arguments:**
- Z-fighting occurs on same-plane objects; two working solutions presented.
- PolygonOffset approach: `polygonOffset: true, polygonOffsetUnits: 1, polygonOffsetFactor: -rectCount` (negative factor layers later objects on top).
- Transparency approach: `transparent: true, depthWrite: false, renderOrder = rectCount`; requires setting `transparent: true, opacity: 1` on other objects to maintain correct layering.
- OpenGL note: PolygonOffset may involve two passes.
- Transparency (even at opacity=1) feared to impact rendering efficiency due to separate sorting of opaque/transparent objects.

**Important data, statistics, quotes:**
- "Depth write false is more reliable for all distances."
- Decal example uses combination: `transparent: true, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4`.
- User concern: "enabling transparency (even with opacity set to 1) for many objects... will have adverse effects on the rendering efficiency."

**Conclusions:** `depthWrite: false` is generally more reliable than polygonOffset alone. Logarithmic depth buffer (`logarithmicDepthBuffer: true`) suggested for precision issues. Combination of techniques (as in decals) can be effective.

## Source 2: GitHub Issue #4724 - Transparency Sorting
**URL:** https://github.com/mrdoob/three.js/issues/4724

**Main topic and thesis:** Suggestion for improved face sorting and handling transparency sorting in three.js (core limitation in object-level sorting for transparent geometry).

**Key points and arguments:** Addresses known challenge of correct rendering order for transparent objects/faces, where three.js primarily sorts at the object level rather than per-face or per-pixel.

**Important data, statistics, quotes:** Labeled as a "Suggestion"; focuses on need for better transparency sorting capabilities.

**Conclusions:** Highlights ongoing need for enhanced sorting mechanisms beyond default behavior (object-level sorting for transparents).

## Source 3: three.js Docs - Material.depthTest
**URL:** https://threejs.org/docs/#api/en/materials/Material.depthTest

**Main topic and thesis:** Official documentation for the `depthTest` property on `Material` base class (controls whether the material is tested against the depth buffer).

**Key points and arguments:** `depthTest` (boolean, default `true`) determines if depth testing occurs. Related properties like `depthWrite` control writing to the depth buffer. Critical for transparent materials to avoid incorrect occlusion.

**Important data, statistics, quotes:** Default `true`; disabling affects how objects interact with depth buffer during rendering.

**Conclusions:** Essential setting for managing layering and transparency; often paired with `depthWrite: false` for overlays or decals.

## Source 4: Stack Overflow - Transparent Textures and Depth
**URL:** https://stackoverflow.com/questions/59938997/how-to-deal-with-transparent-textures-and-depth-in-three-js

**Main topic and thesis:** Handling depth issues with PNG transparent textures on planes—initial depthTest/disable causes ordering problems; seeks solutions for correct back-to-front rendering.

**Key points and arguments:**
- Transparent pixels hide objects behind; disabling depthTest/depthWrite fixes occlusion but causes incorrect ordering at angles/distances.
- References prior discussions on depthWrite vs. depthTest.
- Suggestion: For fully transparent (no semi-transparency), use `transparent: false` + `alphaTest > 0` (e.g., 0.5) with discard in shader if needed; avoids blending order issues.
- Manual distance sorting or back-to-front rendering of transparent objects recommended when blending is required.

**Important data, statistics, quotes:**
- "If you need blending, then drawing *just the transparent objects* back-to-front may be the only visibly correct solution."
- "because this texture has no semitransparency, you'll want to use .transparent=false and .alphaTest=0.5 (roughly)."

**Conclusions:** Use `alphaTest` for mask-like transparency to keep depthWrite enabled. For true blending, manual or render-order sorting of transparent objects is often necessary.

## Source 5: 3D-Tiles-RendererJS-3DGS-Plugin (Gaussian Splats)
**URL:** https://github.com/WilliamLiu-1997/3D-Tiles-RendererJS-3DGS-Plugin

**Main topic and thesis:** Plugin adding Gaussian splat (3DGS) streaming support to 3D Tiles in three.js via Spark renderer; emphasizes handling of transparent splat rendering alongside other scene content.

**Key points and arguments:**
- Splats render as transparent, depth-tested geometry.
- Supports options like `depthTest`, `depthWrite`, `minAlpha`.
- Rendering note: Keep opaque globe/imagery in opaque pass; avoid mixing with transparent splats in same sort queue to prevent occlusion artifacts (e.g., at horizons).
- Separate render passes or forcing `transparent: false` + `depthWrite: true` on non-splat content recommended.
- Supports fade plugins and opacity preservation.

**Important data, statistics, quotes:**
- "Spark splats render as transparent, depth-tested geometry."
- "At grazing / horizon views this can make the globe appear to occlude an entire splat set at once."
- Options forwarded: `depthTest`, `depthWrite`, etc.

**Conclusions:** Proper separation of opaque vs. transparent render paths and careful use of depth settings are required when compositing splats with other 3D content.

## Source 6: Dustin Pfister Blog - Transparent Materials
**URL:** https://dustinpfister.github.io/2021/04/21/threejs-materials-transparent/

**Main topic and thesis:** Practical guide to using `transparent` and `opacity` properties across materials (Basic, Standard, etc.), plus textures, alpha maps, and lighting considerations.

**Key points and arguments:**
- Set `transparent: true` + `opacity` (0–1) on any material for basic transparency.
- Works with maps (e.g., CanvasTexture with RGBA for per-pixel alpha).
- Side: `THREE.DoubleSide` often useful.
- With lights: Use responsive materials (Standard/Phong) + lights.
- Alpha maps and UVs add complexity; `visible` property or layers as alternatives for hiding objects.

**Important data, statistics, quotes:** Examples show `transparent: true, opacity: 0.4` for glass-like effects; canvas textures for dynamic alpha.

**Conclusions:** Transparency is straightforward via base Material properties but requires attention to depth, blending, and ordering for complex scenes. Version awareness (e.g., r127–r146) important due to API changes.

## Summary
three.js handles z-fighting and transparency primarily through material properties (`transparent`, `opacity`, `depthTest`, `depthWrite`, `polygonOffset`, `alphaTest`, `renderOrder`) and scene-level sorting (opaque vs. transparent queues). `depthWrite: false` + `renderOrder` or `alphaTest` often provides reliable layering without full transparency overhead. PolygonOffset is an alternative but less consistent. Transparency sorting remains a limitation (object-level only), addressed via manual ordering or separate passes. Advanced use cases (decals, 3DGS splats, textured planes) combine multiple techniques. Performance concerns favor avoiding unnecessary transparency where possible.

## References
- All URLs listed in the query and used as section headings.