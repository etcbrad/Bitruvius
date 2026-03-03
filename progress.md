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
