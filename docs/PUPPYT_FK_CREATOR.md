# pyxl.puppyt — FK Character Creator (Standalone)

This repo includes a standalone, FK-only character creation tool for building a hierarchical cutout rig and exporting it as a `.puppt` JSON file.

## Open

- Run the app (`npm run dev` as usual), then navigate to `http://localhost:<port>/puppt-fk`

## What it does

- Load a sprite sheet image
- Auto-harvest rough part bounding boxes (optional)
- Adjust part bounding boxes and pivots
- Set parent hierarchy (FK chain)
- Preview FK pose by rotating parts
- Cut and merge parts (optional)
- Export a `.puppt` JSON file

## Export

- The exported file is downloaded as `bitruvius-rig.puppt`
- Format: `{ version: "0.2", parts: [{ name, role, bbox, pivot, rotation, parent }] }`

