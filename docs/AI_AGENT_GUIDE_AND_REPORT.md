# AI agent instructions and implementation report

**Project audit:** 2026-10-11  
**Workspace:** `C:\Users\Atilla\Documents\ChatGPT\hologram`

## Part A — Instructions for future agents

### Before editing

1. Read this report, then [architecture and data](ARCHITECTURE_AND_DATA.md), [requirements](PRODUCT_REQUIREMENTS.md), and [process/file map](PROCESS_FLOWS_AND_FILE_MAP.md).
2. Inspect the current implementation and Git status. This checkout may contain user changes and downloaded archive artifacts; never clean them up without an explicit request.
3. Treat `README.md` as user-facing run/use guidance, `docs/` as maintained project understanding, and `IMPLEMENTATION_PLAN.md` as roadmap. A roadmap bullet is not proof that a feature is implemented.
4. Keep camera access behind a clear direct user action. Do not bypass permission or imply the browser can access an unavailable camera.

### Product and implementation rules

- Preserve mouse/touch fallbacks for any gesture feature.
- Lock an active draw/drag to the initiating hand. Brief tracking loss must not move work to a different hand or silently commit the action.
- Do not fabricate semantic explanations for uploaded meshes. Report file-provided names/bounds and let the presenter write source-grounded notes.
- Keep model files and camera processing local. Model file resource URLs should resolve only to explicitly selected local companion files unless a deliberate, reviewed feature changes that boundary.
- For the 3D studio, preserve transparent WebGL composition: alpha clear, `scene.background = null`, `scene.fog = null`, and no floor, grid, mat, or backdrop mesh. Geometry may still use a colored material.
- Protect low-end devices: lazy-load studio/format parsers, preserve current render caps, and profile before adding per-frame work or expensive shading.
- Do not claim precise CAD units, automatic model understanding, guaranteed hand detection, or meeting-provider integration.
- When behavior changes, update affected requirements/status, architecture, process diagrams, design system, README, and plan together where appropriate.
- Do not add or run a test suite unless the user requests tests. A production build is still an appropriate compilation check for code changes.

### Completion checklist

- Confirm the requested user path is implemented and the fallback path is still clear.
- Run the production build after code changes; report warnings as well as success.
- If browser/device-specific behavior cannot be verified, say which environment limitation blocked it.
- Update the report with implemented vs pending state and evidence. Never convert an attempted or planned task into “done.”

## Part B — Implementation report

### Product delivered in current workspace

| Area | Current implementation | Evidence/location |
|---|---|---|
| Built-in model viewer | Seven educational point-cloud models, labelled selectable parts, explode/assemble, rotation/zoom, camera/hand overlay | `src/scene.js`, `src/models/`, `src/main.js` |
| Whiteboard | Transparent overlay; open palm moves with pen up; closed fist writes through the palm centre; filtered quadratic strokes with a lightweight chalk core; multiple/custom colours, brush and eraser controls, undo/clear recovery | `src/main.js`, `src/gestureEngine.js`, `index.html`, `src/styles.css` |
| 3D teaching studio | Freehand, rectangle, circle, box, sphere, cylinder, cone; extrusion/depth changes; colour, selection, orbit/zoom, undo/clear/reset | `src/studio.js`, `src/main.js`, `index.html` |
| Gesture continuity | Task hand locking, brief-loss recovery, finish-task control, explicit status messaging | `src/main.js`, `src/gestureEngine.js`, `IMPLEMENTATION_PLAN.md` |
| Model presentation | GLB/GLTF, OBJ, STL, FBX, PLY import; mesh navigation/isolation; source bounds; local presenter notes; present layout | `src/studio.js`, `src/main.js`, `index.html` |
| Transparent studio canvas | WebGL alpha clear; no grid/floor plane; scene background and fog explicitly null; camera video is a lower compositing layer when available | `src/studio.js`, `src/styles.css`, `index.html` |
| Documentation created in this pass | Requirements, architecture/data, process/file map and Mermaid flows, design system, agent guide/report, handbook index and README links | `docs/` |

### Current verification and evidence

- **Build:** Vite production build passed on 2026-10-11 after the transparent chalk-board update. It generated lazy loader chunks and reported a 619.28 KB minified main chunk (165.84 KB gzip), exceeding Vite’s 500 KB advisory threshold.
- **Studio launch:** the studio opened in the local browser at `http://localhost:5173/`.
- **Camera attempt:** camera startup returned “No camera found” in that browser environment. The studio remained usable for mouse/touch, but live face passthrough and hand tracking were not confirmed. This is a device/environment observation, not proof that all target devices lack a camera.
- **Transparency change:** code explicitly sets `scene.background` and `scene.fog` to null in the studio, and the successful build above includes that change.
- **Whiteboard interaction update:** added transparent camera/background composition, closed-fist pen-down/open-palm pen-up behavior, low-pass point filtering, incremental quadratic strokes, and lightweight chalk styling. Production build passed on 2026-10-11; the main chunk warning remains as above. Live hand quality still needs manual tuning on a camera-equipped device.
- **Model runtime import:** no user model file was supplied, so an actual representative asset was not imported/validated in-browser.
- **Classroom performance:** no device matrix or measured camera-to-cursor/frame-pacing benchmark is checked into this repository.

### Known gaps and risks

1. **Camera/hand availability varies.** Need verify with the intended webcam/browser and diagnose camera permissions/device exposure separately from MediaPipe asset loading.
2. **Performance evidence is incomplete.** The main JS chunk remains above Vite’s advisory threshold; profile interaction latency and memory on target devices. Current frame caps are design limits, not benchmarks.
3. **Lesson persistence/export is incomplete.** Presenter notes persist in `localStorage`; complete 3D scenes and whiteboard lesson files do not have a portable save/export workflow.
4. **Model format edge cases.** Validate real educator/CAD assets, especially external textures, compressed GLTF extensions, large meshes, animation, and unit metadata.
5. **Units and CAD expectations.** Sketch coordinates are illustrative; dimensional constraints, robust axes/planes, and precision export are not implemented.
6. **Accessibility audit incomplete.** Verify keyboard operation, screen-reader feedback, contrast, touch target sizes, and reduced motion.
7. **Source tree contains uncertain/overlapping modules.** `src/agent.js` and `src/objects/*` should be reference-audited before extension or cleanup.

### Recommended next work, in order

1. Rebuild and visually inspect the updated transparent studio on a machine with an available camera; verify video sits behind geometry and is visible where no geometry exists.
2. Add a guided educator workflow: load model → choose part → author notes → present, with recoverable examples and no unsupported claims.
3. Profile the main bundle, render time, inference cadence, and model memory on the slowest target classroom hardware; optimize from measurements.
4. Add a versioned local lesson package (scene geometry, model reference/optional embedded model, authored notes, palette, and units metadata) with explicit import/export.
5. Add optional axis/plane controls and visible dimension annotations for conceptual 3D drawing.
6. Run a manual camera/tracking validation matrix and accessibility review; capture findings in this report.
