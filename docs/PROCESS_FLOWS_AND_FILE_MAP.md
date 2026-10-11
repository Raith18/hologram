# Process flows and file map

**Audit date:** 2026-10-11

## 1. App startup and camera flow

```mermaid
flowchart TD
  A[Load index.html] --> B[src/main.js creates viewer and UI state]
  B --> C{User chooses mode}
  C -->|Mouse/touch| D[Viewer usable without camera]
  C -->|Enable hand controls| E[Request getUserMedia video]
  E -->|Denied or unavailable| F[Show reason; retain mouse/touch]
  E -->|Video stream| G[Load MediaPipe adapter on demand]
  G --> H{Local WASM/model available?}
  H -->|No| I[Try configured CDN fallback]
  H -->|Yes| J[Try GPU then CPU delegate]
  I --> J
  J -->|Success| K[Infer on new camera frames]
  J -->|Failure| F
  K --> L[GestureEngine smooths/classifies landmarks]
  L --> M[Mode-specific control handler]
```

## 2. Gesture continuity and active-task lock

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> TaskStarted: pinch begins a stroke, push/pull, or drag
  TaskStarted --> Locked: save hand ID and last usable pose
  Locked --> Updating: hand visible and same ID tracked
  Updating --> Locked: update gesture target
  Locked --> ShortTrackingGap: temporary missing/relabelled frames
  ShortTrackingGap --> Locked: same hand returns or unique nearby hand rebinds
  ShortTrackingGap --> Locked: keep last pose; never assign task to a different unrelated hand
  Locked --> Completed: deliberate release or explicit Finish control
  Updating --> Completed: deliberate release or explicit Finish control
  Completed --> Idle
```

## 3. Sketch-to-solid workflow

```mermaid
flowchart LR
  A[Choose profile or primitive tool] --> B[Point/position cursor]
  B --> C[Pinch + move, or pointer drag]
  C --> D{Tool}
  D -->|Free / rectangle / circle| E[Build 2D profile]
  E --> F[Extrude through selected depth]
  D -->|Box / sphere / cylinder / cone| G[Create primitive geometry]
  F --> H[Add object and select it]
  G --> H
  H --> I[Explain approximate dimensions]
  I --> J[Orbit / zoom / change material colour]
  J --> K[Undo, clear, or continue lesson]
```

## 4. Uploaded-model presentation flow

```mermaid
flowchart TD
  A[Select one model and optional companion files] --> B{Supported extension?}
  B -->|No| X[Explain supported formats]
  B -->|Yes| C[Load decoder on demand]
  C --> D[Resolve referenced assets from selected local files]
  D -->|Missing reference| Y[Report missing companion file]
  D -->|Resolved| E[Parse geometry locally]
  E --> F[Fit to view; retain source bounds]
  F --> G[Expose mesh names in part navigator]
  G --> H[Select or isolate part]
  H --> I[Presenter adds factual notes]
  I --> J[Enter Present mode]
  J --> K[Share application window with meeting software]
```

## 5. Source file map

```mermaid
flowchart TB
  HTML[index.html] --> MAIN[src/main.js]
  CSS[src/styles.css] --> HTML
  MAIN --> VIEW[src/scene.js]
  MAIN --> TRACK[src/handTracking.js]
  MAIN --> GEST[src/gestureEngine.js]
  MAIN -. lazy import .-> STUDIO[src/studio.js]
  VIEW --> REG[src/models/index.js]
  REG --> MODELS[src/models/*.js]
  MODELS --> SHAPES[src/models/shapes.js]
  TRACK --> MP[@mediapipe/tasks-vision]
  VIEW --> THREE[three]
  STUDIO --> THREE
  SETUP[scripts/setup.mjs] --> ASSETS[public tracker assets, when setup succeeds]
  README[README.md] --> HANDBOOK[docs/]
  HANDBOOK --> ROADMAP[IMPLEMENTATION_PLAN.md]
```

### Code locations by task

| Task | Start here | Related files |
|---|---|---|
| Add a built-in teaching model | `src/models/index.js` | `src/models/*.js`, `src/models/shapes.js`, `src/scene.js` |
| Change gesture recognition | `src/gestureEngine.js` | `src/handTracking.js`, `src/main.js` |
| Change camera/tracker lifecycle | `src/main.js` | `src/handTracking.js`, `index.html` |
| Change whiteboard behavior | `src/main.js` | `index.html`, `src/styles.css` |
| Change 3D sketching, extrusion, import, notes | `src/studio.js` | `src/main.js`, `index.html`, `src/styles.css` |
| Change the no-mat/transparent composition | `src/studio.js` | `src/styles.css`, video layer in `index.html`, camera styles in `src/styles.css` |
| Change visual tokens/layout | `src/styles.css` | `index.html`, design system |
| Change dependency/setup behavior | `package.json` | lockfiles, `scripts/setup.mjs`, `public/` |

## 6. Handbook dependency map

```mermaid
flowchart LR
  REQ[PRODUCT_REQUIREMENTS.md] --> ARC[ARCHITECTURE_AND_DATA.md]
  REQ --> DS[DESIGN_SYSTEM.md]
  ARC --> FLOW[PROCESS_FLOWS_AND_FILE_MAP.md]
  DS --> FLOW
  FLOW --> AGENT[AI_AGENT_GUIDE_AND_REPORT.md]
  AGENT --> PLAN[../IMPLEMENTATION_PLAN.md]
  PLAN --> SRC[../src/]
  SRC --> GUIDE[../README.md]
```
