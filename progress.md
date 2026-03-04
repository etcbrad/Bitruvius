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

2026-03-03
- Added `footPlungerEnabled` (default ON) to allow clean grounded/ungrounded feet via hysteresis (toe + ankle contact points).
- Grounding now uses a foot touchdown line (toe/ankle) instead of ankle-only:
  - New `computeFootTouchdownYWorld` in `client/src/engine/rooting.ts`.
  - `computeGroundPivotWorld` + ground-root correction align to foot touchdown.
- App grounding: when plunger is ON, the ground root only corrects the rig while at least one foot is “latched”; when both feet detach, no auto-ground correction is applied.
- Added a `Foot Plunger` toggle under Root Controls (Edit widget).

2026-03-03
- Rigid cardboard: clamp drag pin targets to the maximum reachable distance from pinned roots, so over-pulling extends fully then stops (no flicker/tension).
- Added regression coverage in `script/tests/rigidity.test.ts`; `npm test` passes.
- Playwright smoke succeeded in this environment; latest artifacts: `output/web-game/shot-0.png`, `output/web-game/state-0.json`.

2026-03-03
- Slider smoothness pass:
  - Radix `Slider` now RAF-throttles `onValueChange` (reduces drag jank under heavy state updates).
  - All sliders (Radix + native `input[type=range]`) now stop pointer/mouse propagation so canvas/editor gestures don’t “fight” slider drags.
- Playwright smoke: still cannot launch Chromium here due to `bootstrap_check_in ... Permission denied (1100)` (same as earlier), so no automated screenshot verification yet.

2026-03-03
- Default state: starts in rigid IK (`rigidity=cardboard`, `controlMode=IK`) with both ankles rooted so feet are planted by default.
- Physics Rigidity dial no longer forces `controlMode=Cardboard` at 0%, allowing rigid IK posing.

2026-03-03
- Lotte-style rigid physics tuning: cardboard mode now allows a tiny (configurable) brace compliance and uses a blend-mode-based `wireCompliance` so rigid posing feels more like Reiniger cutouts (stiff, hinge-driven, low jitter).
- Playwright smoke regressed again in this environment (Chromium crash `bootstrap_check_in ... Permission denied (1100)`), so automated screenshot verification is flaky.

2026-03-03
- Balance-drag inertia: when feet are rooted, dragging balance handles (especially `head`/`neck_base`) now translates the body with a follow factor that decreases as more joints are pinned, producing a heavier “momentum matching” sway instead of instant/teleporty shifts (`client/src/engine/interaction.ts`).

2026-03-03
- Sidebar UX: activating a widget now auto-minimizes the Roots panel + Root Controls, and the active docked widget container is focused for keyboard UX. Added a reliable `Undock`/`Dock` toggle in the widget header (no drag required) (`client/src/App.tsx`).

2026-03-03
- FK rigidity pass:
  - Balance-drag inertia/sway now only applies in fluid modes (`IK` / `Rubberband`); FK modes stay crisp (`client/src/App.tsx`).
  - Cardboard FK now preserves base bone lengths even if stretch is enabled globally (`client/src/engine/interaction.ts`).
  - Rooted-joint lever rotation length math now treats Cardboard as base-length-only (`client/src/App.tsx`).
- Widget dock bloat + crash guard:
  - Active widget metadata now falls back safely if localStorage has stale ids (`client/src/App.tsx`).
  - Dock header help moved into a hover tooltip (keeps more content visible without overcrowding) (`client/src/App.tsx`).
- Coordinates UX:
  - Cursor-following coordinate label is hidden; coordinates display in a compact top HUD and only while hovering the canvas/grid (`client/src/App.tsx`).
- Added a lightweight TSX test runner and a rigidity regression test (`script/tests/run.ts`, `script/tests/rigidity.test.ts`, `package.json`).

2026-03-03
- Head drag smoothness:
  - When dragging `head`/`neck_base` under pose physics, collar motion is driven by a smoothed momentum delta and shoulders follow lightly (prevents collar twitch) (`client/src/App.tsx`).
  - Disabled the internal shoulder→collar bias constraint while head/neck is directly dragged to avoid competing targets (`client/src/engine/physics/posePhysics.ts`).

2026-03-03
- Default drag rigidity + top-handle jitter fix:
  - Balance-drag follow factor increased (less lag/sway) for `head`/`neck_base` (`client/src/engine/interaction.ts`).
  - Added target smoothing for `head`/`neck_base` balance drags with pinned feet to prevent micro-jitter (`client/src/App.tsx`).

2026-03-03
- UX: editor state now loads from + autosaves to `localStorage` (throttled; queued only from user-intent transitions) with `?reset=1` to force a clean default state (`client/src/App.tsx`).
- Added `SYSTEM_AUDIT_2026-03-03.md` with a prioritized UI/feel/engineering audit and roadmap.

2026-03-03
- Sidebar/screen separation: moved `backgroundColor` styling onto the main viewport and isolated stacking so the sidebar behaves like a separate “console” (`client/src/App.tsx`).
- Sidebar interactions: switched widget-dock resize + joint-hierarchy row selection to `onPointerDown` so clicks/taps register reliably (`client/src/App.tsx`).
- Added automatic tension reliever:
  - Computes max wire strain each physics step and temporarily increases `wireCompliance` when strain exceeds a threshold.
  - Shows a red `TENSION RELIEF` label near the cursor while active (brief linger), and exposes `tensionRelief` in `render_game_to_text` for debugging (`client/src/App.tsx`, `client/src/index.css`).
- Playwright smoke: `output/web-game/tension-relief-2026-03-03-2/shot-0.png`, `output/web-game/tension-relief-2026-03-03-2/state-0.json` (dev server shifted to port `5001`).

2026-03-04
- Removed the dedicated Physics tab (replaced by Procgen): sidebar tab label now shows `Procgen`, and the former physics widgets are no longer in the sidebar tab lists (`client/src/app/widgets/registry.tsx`, `client/src/App.tsx`).
- Moved core physics controls onto the on-canvas bottom bar: `Rig Feel` (physicsRigidity dial) + `Root Drag` (rigid vs physics) live on-canvas now; removed the redundant sidebar toggle and removed duplicate Rig Feel/Bone Color/rigidity/control-mode blocks from the legacy Rig Controls widget (`client/src/App.tsx`).
- Bone color controls moved under `Look` so they stay accessible without a Physics tab (`client/src/App.tsx`).
- Procgen artifact fix: while procgen is actively driving the preview pose, the pose-physics solver no longer runs on top (prevents “double physics” fighting locomotion/grounding) (`client/src/App.tsx`).
- Mask placement no longer “floats” under camera zoom: mask offsets are now stored in canvas-space pixels (pre-zoom), and drag deltas convert from screen px → canvas px via `/ viewScale` (`client/src/App.tsx`).
  - Project export/import: bumped engine state schema to `state@2` and migrated `state@1` mask offsets on import so existing projects preserve placement (`client/src/engine/serialization.ts`).
  - Build/test: `npm run check` + `npm test` pass; Playwright smoke artifacts: `output/web-game/mask-placement-snap-2026-03-04b/shot-0.png`, `output/web-game/mask-placement-snap-2026-03-04b/state-0.json`.

2026-03-04
- Pose-physics anti-flicker: detect A↔B 2-cycle jitter at rest and snap to the midpoint (“median of two states”), then re-apply hard root pins and convert back to offsets (`client/src/App.tsx`).
  - Resets stabilizer history on engine reset, physics handshake changes, and when pose-physics is inactive.
- Build/test: `npm run check` + `npm test` pass.
- Playwright smoke artifacts: `output/web-game/flicker-median-2cycle-2026-03-04/shot-0.png`, `output/web-game/flicker-median-2cycle-2026-03-04/state-0.json` (Playwright crashed mid-run with page closed).
