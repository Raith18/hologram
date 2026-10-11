# Instructions for coding agents

Before changing this project, read [`docs/AI_AGENT_GUIDE_AND_REPORT.md`](docs/AI_AGENT_GUIDE_AND_REPORT.md), [`docs/ARCHITECTURE_AND_DATA.md`](docs/ARCHITECTURE_AND_DATA.md), and [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md). Use [`docs/README.md`](docs/README.md) to navigate the full handbook.

## Project rules

- Keep hand tasks locked to their initiating hand through brief tracking loss; preserve mouse and touch alternatives.
- Keep uploaded models, presenter notes, camera frames, and hand landmarks local to the browser. Resolve imported model dependencies only from files the user selected.
- Never invent a function for an uploaded model part. Use source-provided names/bounds and presenter-authored notes.
- Preserve the 3D studio's transparent rendering: WebGL alpha clear, `scene.background = null`, `scene.fog = null`, and no floor, grid, mat, or backdrop geometry. Colored materials on the actual teaching shapes are expected.
- Keep studio/decoder loading on demand and respect existing render/tracking caps; profile before adding per-frame work.
- Treat sketch dimensions as educational unless explicit unit support is implemented. Do not describe the studio as precision CAD.
- Update applicable docs, diagrams, root README, and implementation plan when behavior or architecture changes. Mark planned, implemented, and verified states accurately.
- Do not add or run tests unless the user requests them. Run `pnpm build` after code changes and report build warnings.
- Do not delete user files or repository/download artifacts as cleanup without explicit user authorization.
