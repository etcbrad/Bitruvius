# Bone Builder Onboarding & Hover Copy

This roadmap recontextualizes the beginning screen, establishes the bone‑as‑rigid‑plate builder, and supplies hover copy for fast in‑tool guidance.

## Landing Screen
- **Pick a mannequin** — Load the default (and later, any added) mannequin and jump straight to the canvas.
- **Create a character** — Run the mini wizard (stance, species preset, scale sliders), then drop into the builder.
- Hover copy:
  - Mannequin card: “Load this mannequin and jump into plate building.”
  - Create character: “Pick stance and proportions, then start rigging.”

## Builder Handoff (Left Console)
- Stepper: Head → Shoulders → Arms → Torso → Pelvis → Leg → Foot → Extras; progression locks until each plate is confirmed.
- Status strip: mannequin name + “Rigid plates mode.”
- Hover copy:
  - Step item: “Define the rigid plate for this region to advance.”
  - Next/Continue: “Save this plate and continue.”

## Plate Model & Gizmos
- Plate = rigid mask spanning ≥2 joints; torso supports 4–6+ joints with a hardness slider for slight flex.
- Hover copy:
  - Plate gizmo: “Click joints to add/remove; needs at least two.”
  - Hardness slider: “Stiffer plates resist bending; lower for slight flex.”

## Pen Tool (Rapid Joint Seeding)
- Canvas toolbar toggle: socket → joint drops at one head‑length per click; chain stays live until Esc/double‑tap.
- Behaviors: drag to reposition, tap to delete, Alt to insert between nodes, snap/merge on proximity, HUD length readout.
- Hover copy:
  - Pen toggle: “Lay down joints a head‑length apart; snap to merge.”
  - Alt insert: “Hold Alt to insert a joint between two nodes.”
  - Delete hint: “Click a joint to remove; drag to reposition.”

## Leg Flow + Mirror
- Build Leg 1 (upper/lower/foot plates) → prompt “Clone & mirror leg?”
- Origin choices: shared hip (centered) vs separate hips (3/4/front).
- Hover copy:
  - Mirror prompt: “Clone this leg to the other side with your chosen hip origin.”
  - Hip origin toggle: “Shared hip for centered rigs; separate hips for 3/4/front.”

## Arm Flow + Mirror
- Build Arm 1 (upper/forearm/hand) → prompt to mirror with shoulder origin choice (shared vs separate girdle).
- Hover copy:
  - Mirror arms: “Duplicate arm to opposite side; pick shared or separate shoulder.”
  - Shoulder origin toggle: “Shared for humanoids; separate for wide/creature girdles.”

## Torso & Extras
- Torso plates allow extra joints; hardness slider controls flex. Extras reuse the same model for tails/wings/fins; pen tool stays available.
- Hover copy:
  - Add joints: “Include more torso points for long bodies or shells.”
  - Extras: “Use plates for tails, wings, or custom appendages.”

## Create‑Character Wizard
- Steps: stance (single vs dual hip), species preset, scale sliders, confirm → pre-seeded joints and defaults.
- Hover copy:
  - Stance picker: “Single hip for centered; dual hip for 3/4/front silhouettes.”
  - Species preset: “Starts with joints suited to this body type.”

## UX Polish & Preview
- Breadcrumb with ghost previews for mirrored limbs; ghost color reflects origin choice.
- Landing demo loop: short GIF explaining rigid plates.
- Validation toast: “Add at least two joints to form a plate.”

## Implementation Order
1) Landing screen + mannequin/wizard routing + hover copy.
2) Bone Builder stepper scaffolding and status strip.
3) Plate data model + gizmos + torso hardness slider.
4) Pen tool joint placement with head‑length spacing and snapping.
5) Leg build + mirror flow with hip‑origin options.
6) Arm build + mirror flow with shoulder‑origin options.
7) Torso multi‑joint support + Extras path.
8) UX polish: breadcrumbs, ghost previews, demo loop, validations.

## Remaining TODO (integration into live engine)
- Replace canvas placeholder with engine viewport; bind active step to joint/plate gizmos and snap highlights.
- Pen tool ↔ engine: create joints at head-length spacing, allow Alt-insert/delete/drag, snap/merge, HUD lengths.
- Mirror flows: on Leg/Arm confirmation, clone with shared/separate origin; show ghost before commit.
- Torso hardness slider: write through to plate stiffness for multi-joint torso chains.
- Extras path: enable tails/wings/fins using same plate model; pen tool stays active.
- Validation/toasts: enforce ≥2 joints per plate with inline feedback.
- Landing persistence: remember last mannequin/wizard settings and offer “resume builder” when returning from `/studio`.

## Latest progress (2026-03-10)
- Pen overlay writes placements into live joints; auto-mirrors the second leg and auto-builds arms from leg proportions. Dash markers (chin/sternum) render as thin gray lines. Auto-created limbs pop in over a short staggered sequence for a “draw to reveal” feel.
- BoneBuilder overlay uses engine state (schema v3) instead of a standalone page; routing restored to main App.
- TypeScript check now passes after cleaning socket easing, rig exporter, and RightConsole types; tests excluded from tsconfig.
