Original prompt: get the joint tinkering from these files and add it to our current project.

- Added optional per-joint `rotation` to the rig model and state sanitizer.
- Updated dragging logic so Cardboard respects `stretchEnabled`, and Rubberband always allows stretch in the IK solver.
- Guarded `sacrum` special-case logic so rigs without that joint don't crash.
- Reduced rigid-mode drag jitter by disabling auto-bend during direct manipulation, and using more stable physics params in rigid drag modes.

2026-03-03
- Rebuilt the Procgen widget into a simpler "watch" flow (Idle / Walk / Run presets, seed, cycle frames, key options).
- Fixed procgen preview speed: preview now respects `procgen.bake.cycleFrames` (previously hard-coded to 120 frames).
- Added `run_in_place` mode with a code-driven gait boost (and bake support) so runs are viewable without external tooling.

2026-03-03
- Added bone appearance customization: violet→magenta palette with darken/lighten controls (Physics tab).
- Updated Rig Feel slider to a color tension scale using bone color + green-glow thumb.
- Added soft light-green joint glow that scales with Rig Feel (physicsRigidity), plus extra glow on selected/pinned joints.
- Added new bone render shapes (`bone`, `capsule`, `diamond`, `ribbon`) and a per-bone Shape override in Bone Inspector.

2026-03-03
- Fixed TS build breakage in `client/src/App.tsx` (stale `activePins`/`widget.kind` references) so `npm run check` is clean again.
- Added procgen ground plane option fields (`groundPlaneY`, `groundPlaneVisible`) and exposed them in the Procgen widget.
- Implemented a draggable on-canvas ground line in procedural mode; dragging updates `procgen.options.groundPlaneY` and respects `pauseWhileDragging`.
- Improved Bitruvian grounding scale + floor alignment:
  - `baseUnitH` now inferred from the neutral rig’s leg lengths (instead of hard-coded 100).
  - Grounding uses an override floor derived from the draggable ground line (relative to neutral hip center).
  - Alternates stance pins (L/R) based on phase for less “both-feet glued” sliding.
  - Grounding uses ankle position (not toe tip) for consistency with the 2-bone IK solve.
- Restored locomotion-style gait controls in the Procgen widget (per-factor enable + sliders), plus quick Speed/Intensity presets.
- Added torso/pelvis bracing constraints (including cross braces) so hips/shoulders behave more like stretchable triangular masses under rigid posing.

2026-03-03
- Implemented sternum-centric rig + rooting overhaul:
  - Added technical `root` joint; `navel` now parents to `root` (world translation moved off navel).
  - Replaced Pins with Roots (`activeRoots`) + triple-click toggling; Root Controls moved above Joint Hierarchy.
  - Added Ground Root mode: clearing roots anchors a sternum-heavy CoG (`groundRootTarget`) and translates `root` to keep CoG fixed.
  - Navel now proxies to Sternum for manipulation (drag + angle slider), while rooting still applies to the clicked joint id.
  - Updated cutout defaults: `Torso` (navel→sternum) + optional `Waist` (l_hip↔r_hip); removed degenerate pelvis slot.
- Build: `npm run build` passes.
- Playwright smoke: `web_game_playwright_client.js` fails to launch Chromium in this environment with `bootstrap_check_in ... Permission denied (1100)` / Crashpad permission errors, so no automated screenshot verification yet.

2026-03-03
- Root UX tweaks:
  - Root target dragging is no longer the default interaction for rooted joints (hold Ctrl while dragging to move a root target).
  - Added a green root “lever” handle for rotating around the selected root.
  - Recolored selection/root highlights from orange to green across the UI.

2026-03-03
- Added canvas-background root rotation: clicking/dragging empty space rotates the whole rig around the current ground root (or around the average rooted targets when roots exist), letting the active physics mode determine how planted roots react.

2026-03-03
- Ground plane semantics: ground root now uses ankle-touchdown Y as the ground plane; ground shading/line renders beneath it, and ground target Y auto-updates downward when ankles step lower (so “everything beneath is ground”).

2026-03-03
- Widgets now activate immediately in the sidebar (default focuses `Edit` instead of the non-interactive `Tools` info widget).
- Temporarily disabled widget drag/pop-out DnD since it was interfering with activation; can re-enable via `WIDGET_DND_ENABLED` once fixed.
- TS check: imported missing `unwrapAngleRad`; disabled `tsconfig.json` incremental build-info output (was writing into `node_modules`).

2026-03-03
- Added joint-mask shape transform drag modes: `widen`, `expand`, `shrink` (in addition to existing move/rotate/scale/stretch/skew/anchor).
- While mask placement/transform is armed, joints are forced above masks so FK rotation + IK dragging stays usable for locking poses.
- Split FK vs IK-ish simulation toggles by caching `Auto-Bend`, `Elasticity`, `Lead`, `Hard Stop`, and `Snappiness` per mode-group (Cardboard vs everything else) via localStorage.
- Build: `npm run check` + `npm run build` pass (server build still warns about `import.meta` under CJS).

2026-03-03
- Fix attempt for navel 180° flip on activation: when `navel` proxies manipulation to `sternum`, we now apply a drag target offset so the sternum doesn’t snap to the mouse-down world position.

2026-03-03
- Ground root target no longer auto-drifts downward to match the lowest ankle; the “ground” stays rigid/static and grounding only adjusts the figure (`client/src/App.tsx` ground-root correction effect).

2026-03-03
- Unified rotation math so canvas root-rotate and Joint Hierarchy angle edits use the same rigid world-space transform + re-derived local offsets (subtree rotates as a proper hierarchy instead of “only the one offset vector”).
- Procedural Bitruvius: `bodyRotation` now applies as a global rotation around `root` by rotating all non-root local offsets (so gait/IK rotation and the rig share the same angle basis).
