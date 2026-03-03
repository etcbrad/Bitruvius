# Bitruvius System Audit (Editor + Coder + Animator)
Date: 2026-03-03

This audit is biased toward: (1) clean, user-friendly UI, (2) lots of power toggles without “UI bloat”, and (3) stable, jitter-free manipulation for posing/animation.

---

## Executive Summary (What to fix first)

### Highest-leverage UX wins (same-day)
- Stop wiping user state on startup; provide an explicit “Reset project / Reset UI” action instead.
- Add a compact “Quick Toggles” strip for the top 8 actions (one click / one key) and keep everything else in widgets.
- Make interaction modes clearly distinct (Rigid FK vs Fluid IK): remove hybrid behaviors that feel like bugs (lag/sway in rigid contexts, snapping in fluid contexts).
- Replace persistent help text blocks with `HelpTip`/tooltips everywhere; keep the canvas and primary controls visible.

### Highest-leverage stability wins (same-day)
- Add invariant guards (finite numbers, nonzero lengths) at the boundaries: input → interaction → physics → render.
- Expand lightweight regression tests to cover “no jitter / no NaN / preserve lengths in FK”.

---

## Editor Audit (UI/UX)

### What’s working
- Sidebar tab grouping (`Character / Physics / Animation / Global`) is the right shape.
- Widget system gives a scalable place to put advanced controls without blocking the canvas.
- Hover-based help (`HelpTip`, `TooltipProvider`) is already available: good foundation for “dense but not crowded”.

### Friction points (prioritized)
1. **State persistence**: the app currently clears saved state on load (`localStorage.removeItem(...)`). This breaks the mental model of an “editor” and adds steps back into every session.
2. **Too many always-visible controls**: several panels are “always on” and compete with the canvas. The rule should be: *only the current task’s controls get screen real estate*.
3. **Help placement**: help text should be hover-based, contextual, and brief; long help blocks should live behind a single affordance (e.g. `?`).
4. **Mode clarity**: the user needs to understand “what will happen when I drag” without reading docs. Right now, some behaviors blend (balance sway vs rigid, pinned vs rooted) and reads as jitter.
5. **Discoverability of gestures**: Shift / Ctrl / Alt modifiers are powerful but invisible. Provide a tiny always-available “gesture hint” overlay or cheat-sheet.

### Recommended UI structure
- **Top row (always visible, small)**:
  - `Mode` (Rigid FK / IK / Elastic)
  - `Roots` (toggle + “clear roots”)
  - `Snap` (toggle)
  - `Mirror` (toggle)
  - `Stretch` (toggle; disabled/hidden in FK)
  - `Bend` (toggle; disabled/hidden in FK)
  - `Grid` (toggle)
  - `Help` (opens cheat-sheet)
- **Everything else** goes in widgets and uses `HelpTip` for explanations.

### Copy/labels consistency (small but important)
- Pick one term and stick to it:
  - `Roots` vs `Pins` (legacy terms should be hidden or migrated).
  - `Rigid` vs `Cardboard` (UI label can be “Rigid”, internal mode “Cardboard”).
- Tooltips should be written as “Do X” and “Hold Y to do Z” (action-first).

---

## Animator Audit (Feel, Motion, Manipulation)

### Core principle
- **FK should be rigid and deterministic** (no stretch, no lag, no “settle wobble” while dragging).
- **IK should be fluid and forgiving** (optional stretch, soft settle, momentum, but never jitter).

### Known jitter sources (what to watch)
- Competing constraints (e.g. shoulder→collar bias while head is directly dragged).
- Mixing “balance drag” translation with spine FABRIK corrections when feet are pinned.
- Target quantization/snap interacting with per-frame solver iterations.

### Recommended animation-feel knobs (editor-facing)
- `Rigidity` (global) stays, but add:
  - `Top Handle Stability` (head/neck smoothing, 0–100)
  - `Balance Follow` (how much body follows head when feet pinned)
  - `IK Stretch` (only in IK/Elastic)
  - `Settle` (auto-bend / damping) with a “Disable while dragging” note

### Success criteria for manipulation
- Dragging `head` in default state:
  - **No twitch** in collar/shoulders.
  - **No buzzing** when mouse is mostly still.
  - **Stops immediately** on mouse-up (no residual rotation drift).

---

## Coder Audit (Architecture, Performance, Reliability)

### What’s risky right now
- `client/src/App.tsx` is a monolith (input, physics, UI, export, widgets). This increases the chance that “small UI changes” break interaction/physics.
- Several systems bypass React for performance (cursor HUD DOM updates). That’s good, but it needs clear boundaries and invariants.

### Target architecture (incremental refactor)
1. **Input + gestures** → `useEditorGestures()` hook
2. **Physics stepping** → `usePosePhysicsLoop()` hook
3. **Widget dock + floating widgets** → `WidgetDock` component
4. **HUD overlays** → `EditorHud` component (coords/debug)

This can be done file-by-file without rewriting the app.

### Invariant guards (low cost, high value)
Add “guard rails” at:
- world/canvas coordinate transforms
- solver inputs (targets, lengths)
- render outputs (offsets must be finite)

If anything goes invalid, fail safe:
- clamp values
- skip the step
- log once to Console widget

---

## Testing & Safeguards (Regression Coverage)

### Current state
- Lightweight test runner exists under `script/tests/` and is runnable with `npm test`.

### Add next (fast unit tests)
- “No NaN” test: run a few interaction steps and ensure all joint offsets remain finite.
- “FK rigid invariants”:
  - Cardboard preserves base lengths (already covered).
  - Stretch/bend toggles do not affect FK drag.
- “Balance drag stability”:
  - With rooted feet, head target smoothing does not overshoot and remains monotonic.

### Add later (integration tests)
- Automated “drag head / drag wrist / rotate root / edit mask” sequence with screenshot diffs.
  - Note: Playwright is flaky in this environment; treat this as a future improvement once Chromium sandboxing is resolved.

---

## Roadmap (Concrete, small-to-large)

### Quick wins (1–3 hours)
- Remove startup state wipe; add explicit reset actions.
- Implement “Quick Toggles” strip.
- Standardize `HelpTip` usage for widget/panel help.

### Medium (1–3 days)
- Split App into 3–5 components/hooks as listed above.
- Add 5–10 regression tests around invariants and top-handle stability.

### Larger (1–2 weeks)
- Command palette for toggles + search (widgets, joints, views, exports).
- Full “View Presets + Cutouts + DragonBones export” workflow polish:
  - presets, per-view overrides UI, and export validation.

