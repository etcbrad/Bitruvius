Original prompt: get the joint tinkering from these files and add it to our current project.

- Added optional per-joint `rotation` to the rig model and state sanitizer.
- Updated dragging logic so Cardboard respects `stretchEnabled`, and Rubberband always allows stretch in the IK solver.
- Guarded `sacrum` special-case logic so rigs without that joint don't crash.
- Reduced rigid-mode drag jitter by disabling auto-bend during direct manipulation, and using more stable physics params in rigid drag modes.
