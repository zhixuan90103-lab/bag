---
title: Research Notes
date: 2026-07-16 11:00
query: "three.js hinged lid door animation rotation pivot hinge geometry translate"
type: tech
sources: 6
model: grok-4-1-fast
generated_by: grok-search
---
# Three.js Pivot Points, Hinges, and Door Rotations: Techniques and Implementations

## Table of Contents
- [Source 1: Rotating PlaneGeometry at Edge Like a Door (three.js Discourse)](https://discourse.threejs.org/t/rotating-planegeometry-at-edge-like-a-door-using-dat-gui/19589)
- [Source 2: Three JS Pivot Point (Stack Overflow)](https://stackoverflow.com/questions/42812861/three-js-pivot-point)
- [Source 3: Opening The Door Into The Above With Code Orange (Medium)](https://leemartin.dev/opening-the-door-into-the-above-with-code-orange-d04bc939d438)
- [Source 4: learning-threejs/chapter-12/hinge.html (GitHub)](https://github.com/josdirksen/learning-threejs/blob/master/chapter-12/hinge.html)
- [Source 5: Hinge Made with Three.js (three.js Discourse)](https://discourse.threejs.org/t/hinge-made-with-three-js/66899)
- [Source 6: Feature Request: Transform Origin (or "Pivot Point") (three.js GitHub)](https://github.com/mrdoob/three.js/issues/15965)
- [Summary](#summary)
- [Cited URLs](#cited-urls)

## Source 1: Rotating PlaneGeometry at Edge Like a Door (three.js Discourse)
**URL:** https://discourse.threejs.org/t/rotating-planegeometry-at-edge-like-a-door-using-dat-gui/19589

**1. Main topic and thesis**  
User seeks to rotate a `THREE.Plane` (for clipping) around a specific edge/hinge point (e.g., 0,0,0) like a door using dat.GUI, without gimbal lock, limited to 0-180 degrees. Thesis: Proper parenting or matrix transformations are needed to offset rotation origin for math.Plane objects.

**2. Key points and arguments**  
- `THREE.Plane` is distinct from `PlaneGeometry`; no need for Plane if only rotating meshes.  
- Challenges with parenting math.Plane into Group/Object3D for offset rotation.  
- Attempts using Matrix4 translations and Vector3 offsets.  
- Solutions involve positioning meshes with PlaneGeometry, computing bounding boxes, and using `setFromCoplanarPoints` for dynamic planes.  
- Community provides CodePen examples for Y-axis rotation.

**3. Important data, statistics, quotes**  
- "it is a great step towards understanding, when you admit to yourself that it’s not three.js API that’s to blame, but your own lack of patience."  
- Range: `minZ = THREE.Math.degToRad(-180); maxZ = THREE.Math.degToRad(0)`.  
- Later solution: Use `target.updateMatrixWorld(true)`, bounding box corners, and `cuttingPlane.setFromCoplanarPoints()`.

**4. Conclusions**  
Effective door-like rotation for clipping planes requires mesh-based visualization or coplanar point methods rather than direct Plane manipulation. Multiple iterations and community examples resolve the offset pivot issue.

## Source 2: Three JS Pivot Point (Stack Overflow)
**URL:** https://stackoverflow.com/questions/42812861/three-js-pivot-point

**1. Main topic and thesis**  
Question on persisting rotations around a custom pivot point by updating geometry vertices (not just matrices) so subsequent rotations start from the new origin. Thesis: Translate geometry to align pivot with origin, rotate, then reverse-translate.

**2. Key points and arguments**  
- Issues with `geometry.translate` causing pivot to shift.  
- Group-based approaches: Nest mesh in Group, offset positions, rotate Group.  
- Recommended `rotateAboutPoint` function using `position.sub/add` and `applyAxisAngle` + `rotateOnAxis`.  
- Warning against vertex updates due to normal recalculation complexity.  
- Supports world vs. local coordinate compensation.

**3. Important data, statistics, quotes**  
- Function signature: `rotateAboutPoint(obj, point, axis, theta, pointIsWorld = false)`.  
- "I wouldn't recommend updating the vertices, because you'll run into trouble with the normals."  
- Group example: `cube.position.set(0.5,0.5,0); group.position.set(-0.5, -0.5, 0); group.rotation.z = Math.PI / 4`.

**4. Conclusions**  
Matrix/Group methods are preferred over geometry mutation. The `rotateAboutPoint` helper provides a reusable solution for persistent custom pivots.

## Source 3: Opening The Door Into The Above With Code Orange (Medium)
**URL:** https://leemartin.dev/opening-the-door-into-the-above-with-code-orange-d04bc939d438

**1. Main topic and thesis**  
Tutorial on building an interactive 3D door in Three.js (with GSAP animation) using nested Groups for handle turn and door swing, integrated with PixiJS collage. Thesis: Nesting meshes in positioned Groups simplifies cantilever/edge rotations.

**2. Key points and arguments**  
- Door: BoxGeometry in "swing" Group positioned at hinge edge.  
- Handle: Nested "turn" Group for separate Z-axis rotation.  
- Animations: GSAP timeline for sequential handle turn then door swing (Y-axis 90°).  
- Responsive PixiJS collage with quadrant-based random placement and video textures.

**3. Important data, statistics, quotes**  
- Door geometry: `new THREE.BoxGeometry(36, 80, 1.5)`.  
- Positions: `swing.position.set(18, 0, 0); door.position.set(-18, 0, -0.75)`.  
- GSAP: `tl.to(swing.rotation, { duration: 5, y: THREE.MathUtils.degToRad(90) })`.

**4. Conclusions**  
Group nesting enables intuitive door mechanics; extends to full interactive web experiences combining Three.js and PixiJS.

## Source 4: learning-threejs/chapter-12/hinge.html (GitHub)
**URL:** https://github.com/josdirksen/learning-threejs/blob/master/chapter-12/hinge.html

**1. Main topic and thesis**  
Example file from "Learning Three.js" demonstrating hinge implementation (limited content retrieved; focuses on chapter 12 3D transformations).

**2. Key points and arguments**  
- Illustrates hinge mechanics likely via object grouping or matrix transformations in Three.js context.

**3. Important data, statistics, quotes**  
- No detailed code or stats extracted due to page rendering limitations.

**4. Conclusions**  
Serves as reference implementation for hinge concepts in educational Three.js materials.

## Source 5: Hinge Made with Three.js (three.js Discourse)
**URL:** https://discourse.threejs.org/t/hinge-made-with-three-js/66899

**1. Main topic and thesis**  
Showcase of a Three.js hinge model with historical context on hinge invention. Thesis: Simple yet powerful hinge simulations are achievable in Three.js.

**2. Key points and arguments**  
- Links to demo; community discussion on code visibility.  
- Reference to Suica library hinge example.

**3. Important data, statistics, quotes**  
- "the earliest pivot hinge discovered dates as far back as 1600 B.C."  
- "importance to everyday life is right up there with the wheel".

**4. Conclusions**  
Three.js excels at realistic mechanical simulations like hinges; encourages sharing and viewing source for learning.

## Source 6: Feature Request: Transform Origin (or "Pivot Point") (three.js GitHub)
**URL:** https://github.com/mrdoob/three.js/issues/15965

**1. Main topic and thesis**  
Enhancement request for native support of transform origin/pivot point in Three.js (milestone r183).

**2. Key points and arguments**  
- Addresses common pain point of custom pivots without manual Groups or helper functions.

**3. Important data, statistics, quotes**  
- Labeled as "Enhancement".

**4. Conclusions**  
Highlights ongoing community desire for built-in pivot tools, influencing future Three.js development.

## Summary
Common theme across sources: Three.js lacks native pivot/transform-origin support, leading to workarounds using Groups (offset child positions), geometry translations, or custom functions like `rotateAboutPoint`. These enable door/hinge rotations around edges. Practical implementations combine dat.GUI/GSAP controls, PlaneHelpers for visualization, and nested hierarchies. Solutions emphasize avoiding direct vertex mutation and leveraging scene graph for persistent transformations. Educational and showcase examples reinforce these patterns for interactive 3D mechanics.

## Cited URLs
- https://discourse.threejs.org/t/rotating-planegeometry-at-edge-like-a-door-using-dat-gui/19589
- https://stackoverflow.com/questions/42812861/three-js-pivot-point
- https://leemartin.dev/opening-the-door-into-the-above-with-code-orange-d04bc939d438
- https://github.com/josdirksen/learning-threejs/blob/master/chapter-12/hinge.html
- https://discourse.threejs.org/t/hinge-made-with-three-js/66899
- https://github.com/mrdoob/three.js/issues/15965