# HoloHand upgrade plan

## 1. Add more detailed models

- Add Solar System, DNA Double Helix, and Human Heart models with labelled, separable point-cloud parts.
- Use evenly spaced sphere samples where they improve surface continuity.
- Keep each active model within an 18,000-point render budget while preserving a minimum point allocation for each part.

## 2. Integrated transparent air-chalk whiteboard (implemented)

- Add a full-screen transparent drawing mode that can open from the start screen or model toolbar, revealing camera video or the app background beneath the ink.
- Support mouse, touch, and hand tracking with a visible cursor. Open palm moves with pen up; closed fist writes and opening the hand lifts the chalk.
- Smooth noisy input with adaptive filtering and quadratic curve strokes, with a lightweight chalk-like core and explicit lock/recovery feedback.
- Use a peace sign to cycle chalk colours; expose controls for preset/custom colour, brush size, eraser, undo, finish, and clear.
- Keep the tracked cursor visibly eased, respect reduced-motion preferences, and animate model resets instead of snapping.

## 3. Reduce rendering and tracking cost

- Cap WebGL and overlay canvases at 1.4× device pixel ratio and render at up to 50 FPS (30 FPS in whiteboard mode).
- Remove per-point position shimmer, reduce point twinkle, and default auto-spin to off.
- Request 640×480 camera video at up to 30 FPS and load MediaPipe only when camera tracking starts.

## 4. Verify the integrated app

- Production build succeeds with Vite.
- Browser checks confirm the new models load, the whiteboard tools work, and local camera/hand-tracker setup reaches its ready state.

## 5. 3D teaching studio (implemented first release)

- Load a separate low-power Three.js scene only when the studio opens, so the existing model viewer and 2D whiteboard keep their own clear modes.
- Let a presenter choose free sketch, rectangle, circle, box, sphere, cylinder, or cone. Freehand and planar profiles become extruded solids; the primitive tools make common classroom shapes directly.
- Map a single tracked index finger to an air cursor. Pinch and move to sketch/place, then release to finish. Open palm movement orbits the view; peace cycles material colours; fist undoes. Keep mouse and touch drawing as a no-camera alternative.
- Add adjustable push/pull depth, preset/custom colours, shape selection, a short teaching explanation per shape, undo, clear, reset view, zoom, and a presenter layout.
- Keep rendering on the app's 50 FPS cap with antialiasing off and a 1.25 DPR ceiling; leave hand inference on the existing camera path and only render the studio while it is active.
- Treat this as an educational concept sketcher, not a dimensionally precise CAD system. A later iteration can add measurements, saved lesson scenes, annotation arrows, multi-user sharing, and robust plane/axis controls after educator feedback.

## 6. Reliable hand tracking during active gestures (implemented)

- Keep the same hand identity and last valid pose through up to 18 missing camera frames (about 600 ms at 30 FPS), instead of dropping gesture state after a few frames.
- Lock a whiteboard stroke, studio sketch/push-pull, or model part drag to the hand that started it. During tracking loss, hold the cursor and preserve the task until that hand returns or the presenter explicitly finishes/releases it; never switch the active task to another hand. A model part drag displays **Release part drag** while locked.
- If MediaPipe briefly changes its left/right label, rebind only when one good hand is visible near the last locked pose. Expose a visible Finish stroke / Finish task / Release part drag control as a manual recovery path.
- Add pinch hysteresis with four consecutive release frames. A single poor landmark frame cannot lift the pen, while a deliberate release still finishes the task promptly.
- Ease MediaPipe presence/tracking thresholds slightly for continuity and rely on gesture stabilization plus task locks to reject noisy frames.
- Give visible status feedback for lock, temporary loss, recovery, and safe finish. Follow-up work can add camera-specific threshold calibration and move synchronous inference off the UI thread if profiling shows it is needed.

## 7. Uploaded-model presentation mode (implemented)

- Import local GLB/GLTF, OBJ, STL, FBX, and PLY geometry. Allow companion resources to be selected alongside a model, resolve only those local files, and reject missing external resources rather than fetching arbitrary URLs from a model file.
- Fit the full model into the viewing area, preserve its source-coordinate bounds, and expose mesh names in a part navigator. Provide isolate-part viewing and selection from the model itself or the navigator.
- Keep model function explanations user-authored: display the source filename, part name, and source bounds, and let the presenter save custom notes per model part in local browser storage. Never infer a specific function from geometry alone.
- Remove the studio grid and render its canvas transparently over the live webcam so the presenter’s face remains visible during a screen-shared explanation.
- Retain the air-drawn 2D profile and extrusion tools in the same studio. Keep presentations local to the browser; uploaded meshes are not sent to a service.
- Follow-up work: add animation playback, unit metadata import, durable presentation export/import, and classroom device profiling. Some specialized/DRACO-compressed formats and textures embedded through unsupported extensions may still require conversion to a regular self-contained GLB.

### Classroom and meeting workflows

- **Explain volume:** draw a rectangle, extrude it, and adjust the depth while discussing length, width, and height.
- **Compare forms:** place a sphere, cylinder, or cone; change colour to contrast examples and orbit the camera while presenting.
- **Show how profiles become solids:** draw a freeform outline or circle and use the resulting extruded volume to introduce cross-sections and extrusion.
- **Facilitate a meeting:** share the studio window, use Present to reduce on-screen controls, and keep the selected shape's plain-language explanation and approximate dimensions visible.
- **Recover live demonstrations:** undo the latest shape/clear/depth gesture or clear the board to start the next example.

### Follow-up roadmap for educator feedback

1. Add axis/plane selection and dimension labels with a configurable unit scale.
2. Add arrows, text notes, section-cut demos, and saved/exportable lesson scenes.
3. Add a short guided first-use lesson, presenter camera bubble, and accessibility options for gesture thresholds and left/right hand preference.
4. Profile on classroom hardware and tune camera inference cadence and render quality to meet the target device's smoothness budget.
