# Design system

**Audit date:** 2026-10-11

## 1. Experience goals

- Make hand-controlled 3D teaching understandable without requiring CAD experience.
- Keep the model or sketch visually dominant; place controls in compact glass panels.
- Provide immediate state feedback for camera, tracking, active gesture lock, selection, notes, and recovery.
- Preserve a live face-camera background in studio mode when the browser camera is available.
- Ensure there is no floor/grid/mat behind studio geometry; alpha pixels reveal the camera or the page fallback.
- Keep mouse and touch workflows aligned with hand gestures.

## 2. Visual foundations

| Token / pattern | Current value or rule | Usage |
|---|---|---|
| App background | Dark radial gradient; `#07080e` base | Main viewer and camera-off fallback |
| Text | `#eceef6` root, `#eef5fb` studio | Primary copy and controls |
| Muted text | `#8f95aa`; studio secondary `#8e9db0`–`#b3c0ce` | Help text, notes, status details |
| Accent gold | `#f2c94c` | Main app emphasis and studio selection toggle |
| Studio draw accent | `#65d6c4` | Default shape color, active tool, depth slider, cursor |
| Alternate draw accents | `#ffb454`, `#f27791`, `#8d9cff` | Material/ink palette |
| Glass panels | `rgba(13,21,33,.86)` studio; blur 14px | Tool, title, and explanation panels |
| Hairline borders | white/light blue at about 9–15% opacity | Panel separation without heavy chrome |
| Corner radii | 8–10px controls; 15–16px major panels | Consistent soft UI |
| Typography | system sans-serif; dense labels 9–11px; headings 14px | Compact meeting overlay; maintain readable contrast |

Tokens are currently expressed inline in `src/styles.css` rather than a generated token file. When adding repeated values, promote them to CSS custom properties instead of introducing a competing palette.

## 3. Layout and layering

### Studio z-order contract

1. Page/root backdrop (only exposed when video is unavailable/off).
2. Mirrored live video element when `.feed` is active.
3. Full-window transparent WebGL canvas containing geometry only.
4. Studio glass controls and explanation panels.
5. Hand cursor / transient interaction indicator.

`src/studio.js` must keep `renderer.alpha` on, clear alpha at zero, `scene.background = null`, and `scene.fog = null`. Do not add `GridHelper`, ground `PlaneGeometry`, a scene background quad, or CSS canvas fill. The existing colored material belongs on drawn geometry; “no mat” means no backing surface behind the geometry.

The face camera is not faked: when no camera stream is available, show the established dark page fallback and a truthful status. Camera permission is user-controlled.

### Presenter mode

- Keep title, essential camera/tracking action, Present toggle, and exit action available.
- Fade/hide the tool palette while in Present mode.
- Keep the explanation card and selected part context available so screen-share viewers can follow the talk.
- Glass panels may overlay the face/model. Preserve large unobstructed central space for geometry.

## 4. Interaction language

| Input | Meaning | Feedback |
|---|---|---|
| Point | Aim/select | Cursor follows smoothed point; selection title/details update |
| Pinch and move | Draw/place or adjust depth | Cursor changes to drawing state; status announces task lock |
| Release pinch | Commit current task | Brief completion status |
| Open palm | Move the whiteboard pointer with ink lifted | Bright cursor; no stroke is emitted |
| Closed fist | Draw chalk using the tracked palm centre | Cursor shows pen-down; stroke remains locked through brief tracking gaps |
| Open palm, move | Orbit 3D view | Smooth camera motion, bounded tilt |
| Peace sign | Cycle material colour | Status states active colour |
| Fist in model viewer | Assemble the exploded model | Viewer state updates |
| Fist in 3D studio | Undo the last compatible change | Status confirms undo |
| Undo button in whiteboard | Remove the last chalk stroke | Canvas redraws without that stroke |
| Mouse/touch drag | Draw selected tool | Same geometry creation path as gesture path |
| Right/middle drag or scroll | Orbit/zoom | Camera changes without adding geometry |
| Finish task | Commit active operation safely | Control hides and completion is announced |

## 5. Motion and performance

- Main view has an up-to-50-FPS cap; whiteboard is capped at 30 FPS.
- Whiteboard filters sub-pixel hand jitter and paints smoothed quadratic curves incrementally. A small low-opacity inner stroke suggests chalk without particles or blur.
- Studio renders at the app frame cadence, uses low-power WebGL preference, antialiasing off, and device pixel ratio capped at 1.25.
- Camera requests 640×480 ideal video at up to 30 FPS. Tracking assets/format decoders load on demand.
- Use short, purposeful transitions (current palette transition: 220 ms) and cursor easing (about 40 ms position / 120 ms state). Avoid animated idle movement that steals attention or compute.
- Respect `prefers-reduced-motion` for future/nonessential transitions. Current global reduced-motion coverage has not been verified; do not claim complete support.
- Profile frame pacing, inference latency, and memory with representative classroom hardware and large imports before increasing quality defaults.

## 6. Components and states

- **Tool button:** default / hover / selected / disabled. Selected tool uses accent border and tinted fill.
- **Camera/tracking action:** idle / starting / hand tracking on / mouse-only fallback. Text/status must be explicit.
- **Active task:** idle / locked / short tracking gap / recovered / completed. Keep last valid pose during gaps and show an explicit finish route.
- **Selected object card:** empty / generated solid / imported model part. Imported explanation must distinguish source dimensions, unit uncertainty, and presenter-authored notes.
- **Color:** circular preset swatches plus native custom color input; active swatch gets a visible outline.
- **Destructive clear:** visually differentiated and undoable when history supports it.

## 7. Content, accessibility, and privacy

- Use plain language and short active instructions; distinguish a teaching sketch from precision CAD.
- Keep semantic HTML controls, associated labels, keyboard undo, visible status roles, and usable mouse/touch alternatives.
- Avoid color-only communication: selection, task lock, and camera states need labels/icons/status as well as color.
- Never claim camera or hand tracking is active without a live stream/tracker-ready state.
- Do not transmit uploaded models, notes, camera frames, or hand landmarks to third parties. The tracker’s documented CDN fallback is an asset fetch and must remain an explicit implementation fact.
