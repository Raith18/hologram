# Product requirements

**Product:** HoloHand Gesture Agent 3D  
**Purpose:** A local, camera-aware teaching and meeting studio for gesture-controlled 3D model explanation, 2D sketching, and introductory sketch-to-solid demonstrations.  
**Status:** Requirements describe the current target. Status against implementation is summarized in the agent report.  
**Audit date:** 2026-10-11

## 1. Users and outcomes

| User | Need | Desired outcome |
|---|---|---|
| Educator | Explain a concept visually while speaking | Reveal parts, compare shapes, annotate a model, and keep the explanation readable |
| Meeting host or presenter | Present a supplied 3D asset in a video meeting | Inspect named pieces, isolate one, add speaker notes, and share a clear view |
| Learner or facilitator | Demonstrate basic spatial geometry | Sketch a 2D profile, extrude it, orbit the solid, and discuss dimensions intuitively |
| Camera-constrained user | Use the app without hand tracking | Complete core studio interactions with mouse or touch |

## 2. Product principles

1. **The presenter controls the explanation.** The application may report geometry, file-provided labels, and measured bounds. It must not invent a real-world part function.
2. **Tasks survive brief tracking loss.** Once a hand starts a stroke or drag, the task remains locked to that hand until release, explicit finish, or a safe timeout/recovery policy.
3. **Geometry has no required backing surface.** The 3D studio scene has no floor, grid, fog, or backdrop plane. With camera access, the live video is visible through transparent canvas pixels.
4. **Keep the experience local and lightweight.** Camera frames and selected files stay in the browser; load heavyweight tracking and format decoders only when needed.
5. **Gesture is optional.** Mouse/touch is a first-class fallback, not a dead-end error state.
6. **Educational measurements are honest.** Sketch dimensions are illustrative. Imported source units are unknown unless the file provides unit metadata and the app implements it.

## 3. Functional requirements

| ID | Requirement | Acceptance condition | Current status |
|---|---|---|---|
| FR-01 | Explore teaching point-cloud models | Built-in model can be selected, rotated, zoomed, exploded/assembled, and its labelled part inspected | Implemented; see root README and `src/scene.js` |
| FR-02 | Draw on a transparent 2D whiteboard | Mouse/touch draws; an open hand moves with pen-up and a closed fist draws smooth coloured chalk strokes; erase/undo/clear are available | Implemented in current workspace; see `src/main.js` and `src/styles.css` |
| FR-03 | Draw and form basic 3D solids | Free sketch, rectangle, circle, box, sphere, cylinder, and cone can be created; profiles extrude through depth | Implemented; concept-level units only |
| FR-04 | Keep one hand locked to an active task | Brief missing frames do not switch hands or commit/release the active gesture | Implemented in current hand-task lock flow; device validation remains open |
| FR-05 | Use a transparent studio scene | No grid, floor, fog, or backing mesh; the render canvas clears with alpha zero | Implemented in `src/studio.js`; webcam visibility requires successful camera startup |
| FR-06 | Import a presenter’s model | Accept GLB/GLTF, OBJ, STL, FBX, or PLY; fit model; list named mesh parts; report original bounds | Implemented with format limitations; see architecture |
| FR-07 | Explain uploaded model parts accurately | Selecting a part shows its file-provided name and model source; the presenter can save notes locally | Implemented; no automatic function inference |
| FR-08 | Isolate an uploaded mesh | Presenter can hide sibling meshes and return to the full model | Implemented |
| FR-09 | Present to a meeting | Present mode hides the drawing palette while retaining selected-object explanation; presenter shares the app using meeting software | Implemented locally; meeting-service integration is out of scope |
| FR-10 | Undo/clear and recover | Undo removes recent shape/depth/upload/clear actions where supported; explicit finish controls are available | Implemented; review undo edge cases when editing history behavior |

## 4. Quality requirements

| ID | Requirement | Target / current evidence |
|---|---|---|
| QR-01 | Responsive interaction | Existing main loop is capped at 50 FPS, whiteboard 30 FPS; studio renderer caps pixel ratio at 1.25 and disables antialiasing |
| QR-02 | Low startup work | Three.js studio and model decoders are loaded on demand; MediaPipe initializes after a camera start request |
| QR-03 | Privacy | Camera stream uses browser `getUserMedia`, no audio, and no backend upload; model import is local |
| QR-04 | Robust camera fallback | If camera or model initialization fails, user receives a status message and can use mouse/touch |
| QR-05 | Model safety | Companion resources are resolved from explicitly selected local files; missing dependencies are reported |
| QR-06 | Accessibility | Controls use semantic buttons/labels and visible status feedback; keyboard undo exists. Reduced-motion coverage and gesture alternatives need further audit |
| QR-07 | Transparent composition | Renderer alpha is zero; scene has no background/fog/helper plane; webcam is a separate video layer below the studio canvas |
| QR-08 | Buildability | `pnpm build` is the production compilation check; audit on 2026-10-11 passed, with a Vite warning for a 618 KB minified main chunk |
| QR-09 | Smooth and low-cost ink | Filter minor tracking jitter; render curves incrementally; avoid per-point textures and expensive blur effects | Implemented; needs hands-on device tuning |

## 5. Out of scope for current release

- Precision CAD constraints, dependable real-world units, dimensionally certified exports, and parametric history.
- Direct Zoom/Meet/Teams integration, cloud storage, multi-user synchronization, or remote model upload.
- Automatic semantic interpretation of arbitrary uploaded CAD assemblies.
- Every interchange format and every optional decoder extension. Some compressed GLTF/DRACO or unsupported extension assets need conversion.
- Automatic persistence/export of a complete lesson scene. Current presenter notes are local per model part; drawn scene save/export is not yet available.

## 6. Success measures to establish

The project has performance caps but no classroom-device benchmark suite or measured user success baseline yet. Before promising “smooth on any device,” record target hardware and collect: camera-to-cursor latency, tracking continuity during drawing, render frame pacing with representative models, import time and memory for large files, and task completion/error rate for first-time presenters.
