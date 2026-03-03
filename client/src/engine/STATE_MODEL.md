# Bitruvius State Model (Single Engine)

This document describes the engine as **one coherent system** with **orthogonal state axes** and explicit transitions.

## Axes

### 1) Look (`lookMode`)
Render-only presets that affect how the scene is drawn (not the simulation math).

Available look modes (see `client/src/engine/lookModes.ts`):
- `default`: Standard rendering with full layers.
- `8-bitruvius`: Pixel snapping on a 4px grid (render-only).
- `16-bitruvius`: Pixel snapping on a 2px grid (render-only).
- `32-bitruvius`: Pixel snapping on a 1px grid (render-only).
- `noir`: Grayscale + higher contrast styling.
- `skeletal`: Rig-only: hides masks/cutouts and forces joint/connection visibility.
- `lotte`: Flat silhouette-inspired styling.
- `nosferatu`: White-on-black high-contrast look.

Render math notes:
- Pixel modes quantize **rendered** positions (joints, connection endpoints, and shape transforms). The underlying `SkeletonState` stays continuous.

### 2) Simulation (physics + control)
Simulation is controlled by:
- `controlMode`: `Cardboard | Rubberband | IK | JointDrag`
- `rigidity`: `cardboard | realistic | rubberhose`
- `physicsRigidity`: macro dial (0..1) used by `applyPhysicsMode`
- Toggles: `bendEnabled`, `stretchEnabled`, `leadEnabled`, `hardStop`, `snappiness`, `mirroring`

### 3) View presets (`views[]` + `activeViewId`)
Named snapshots that can apply (independently):
- Pose (`ViewPreset.pose`)
- Camera (`ViewPreset.camera`)
- Reference layers (`ViewPreset.reference`)

Switching views is decomposed by flags:
- apply pose
- apply camera
- apply reference

## Contradictions (invariants) and auto-fix
The reconcile layer enforces:
- `lookMode` must be valid; otherwise it becomes `default`.
- `physicsRigidity` is clamped to `0..1`.
- `activeViewId` must exist in `views`; otherwise it becomes the first view’s id.
- In `skeletal` look, `showJoints=true` and `jointsOverMasks=true` are enforced so the UI matches what is shown.

## Warning modal rules
The warning modal appears only when an auto-fix **overrides a user’s explicit requested change** (true contradiction).
Preset side-effects are logged as info and do not block.

