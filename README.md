# HoloHand (gesture-agent-3d)
## Dev / Creator = tubakhxn

Control exploded 3D models with your bare hands. Your webcam is the background, a hand skeleton and a gold ring follow your hand,
and each model is a glowing point cloud that pulls apart into labelled parts so you can see what is inside. A built-in whiteboard lets you sketch with a mouse, touch, or your tracked index finger.

Everything runs in the browser: MediaPipe Hand Landmarker + Three.js. No backend, no API keys, nothing is uploaded.

## Run

Needs Node.js 18+ and Chrome or Edge.

```bash
cd gesture-agent-3d
npm install
npm run dev
```

Open the URL Vite prints (normally http://localhost:5173) and click **Start camera**. Camera only works on `http://localhost` or `https`.
`npm install` copies the MediaPipe WASM and downloads the hand model into `public/`. If that download is blocked, the app fetches both from a CDN at runtime.

## Models

Turbofan Jet Engine (fan, guide vanes, compressors, combustor, turbines, shaft, nozzle) ·
Radial Aircraft Engine (crankcase, 9 cylinders, pistons, rods, crankshaft, exhaust ring, supercharger) ·
Sports Car (body panels, chassis, engine, drivetrain, seats, wheels, brakes) ·
Human Brain (4 lobes, cerebellum, brainstem, corpus callosum, thalamus, hippocampus, amygdala, hypothalamus)
· Solar System (the Sun, eight planets, Saturn’s rings and orbital paths) · DNA Double Helix (sugar-phosphate rails and base pairs) · Human Heart (four chambers and major vessels)

## Whiteboard

Choose **Open whiteboard** from the start screen or the drawing icon in the toolbar. The canvas is transparent, so the live camera or app background shows through. Click **Enable hand drawing** and allow camera access. An open palm moves the cursor with the pen up; close your hand into a fist to write, and open it to lift the chalk. The palm centre is used as the drawing point for a steadier stroke. Hand paths are filtered and rendered as quadratic curves with a light chalk core. Brief tracking gaps preserve the locked stroke; use **Finish stroke** to commit it manually if needed. A peace sign cycles chalk colours. Preset/custom colours, chalk size, eraser, undo, and clear are available. Mouse and touchscreen drawing remain available too.

## 3D teaching studio

Choose **Open 3D teaching studio** from the start screen or select **3D** in the toolbar. Choose Free sketch, Rectangle, Circle, Box, Sphere, Cylinder, or Cone. With hand drawing enabled, point to aim and pinch-and-move to draw or place a shape; release to finish. The same hand stays locked to the current sketch or push/pull task through tracking loss; use **Finish task** to commit it safely if needed. Point at an existing shape to select it. Open-palm movement orbits the view, a peace sign cycles colour, and a fist undoes. Select **Push / pull** to pinch-drag the depth of a selected solid. Mouse and touch drawing are available without a camera.

Use **Upload model** to load GLB/GLTF, OBJ, STL, FBX, or PLY files. For textured GLTF/OBJ/FBX, select the model and any companion material/texture files together; a self-contained GLB is simplest. The uploaded geometry is fitted to the view while its source bounds are reported; source units may be unspecified. Use the model-part navigator or point at a part to inspect its file-provided name, then add your own presenter notes. Notes for uploaded parts are stored locally in this browser for the same file/part. **Isolate part** hides sibling meshes; **Present** hides the tool palette while leaving the webcam background and explanation card visible. The app does not guess a model part's real-world function.

This studio is for explaining geometry and sketch-to-solid ideas in lessons or meetings. Its sketch units are illustrative and it is not a precision CAD tool. See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the educator workflow and next-step roadmap.

## Project handbook

The maintained project requirements, runtime architecture/data model, process diagrams, design-system rules, and AI-agent handoff/report are split into focused documents under [`docs/`](docs/README.md). Start with the [project map](docs/README.md).

## Performance

The viewer caps each model at 18,000 rendered points, caps canvas resolution at 1.4× device pixel ratio, and renders at up to 50 FPS (30 FPS in whiteboard mode). Camera tracking requests 640×480 video at up to 30 FPS. Auto-spin starts off; enable it when wanted.

## Gestures

| Gesture | Effect |
|---|---|
| Open hand slowly | Explode the model. The white arc on the gold ring shows how far. |
| Close your hand / fist | Pull it back together |
| Move or twist your hand | Rotate and tilt the model |
| Point (index finger) | Highlight the part under your fingertip. Hold still to lock it. |
| Pinch while over a part | Grab it, drag it out, release to snap it back |
| Two hands | Move them apart or together to zoom |
| Peace sign (hold ~0.3 s) | Jump to the next model |

## Mouse and keyboard

Drag = rotate · scroll = zoom · click a part = inspect it · `Space` = explode / assemble · `←` `→` or `1`–`7` = switch model · `R` = reset view. In the 3D studio, right-drag or open-palm movement orbits, scroll zooms, and `Ctrl+Z` undoes.
Sliders in the left panel control the explosion and its intensity. The top-right buttons toggle camera background, hand skeleton, labels and fullscreen.

## Tips

- Even light and a plain background help. Keep your hand 40–80 cm from the camera, palm facing it.
- Open and close your hand slowly. The peace sign needs a short hold so it does not trigger by accident.

## Files

```
src/main.js          app loop, hand overlay, gesture -> action, labels, UI
src/handTracking.js  MediaPipe wrapper (2 hands, local files then CDN, GPU then CPU)
src/gestureEngine.js landmarks -> gesture, openness, smoothed palm / fingertip / pinch, wrist roll
src/scene.js         Three.js point-cloud renderer: explode, scatter transition, picking, part dragging
src/studio.js        on-demand Three.js classroom sketching and solid modelling scene
src/models/          shapes.js (point sampling) + jet / radial / car / brain definitions
```

To add a model: write a `build()` returning parts (`P(name, description, color, [I(cloud, explodeDirection)])`) and register it in `src/models/index.js`.
