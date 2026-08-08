# Runner Glyph Editor

A touch-first 3D design sandbox for defining Arkour's abstract Runner before the shape is wired into the runtime.

## Design model

The editor keeps the same ten semantic outline handles established by the 2D prototype:

- head / top
- left and right neck
- left and right hand / outer shoulder tip
- left and right under-arm
- left and right flank
- foot / travel tip

Each handle is now `{x, y, z}`. The visible body is a curved, warped sheet rather than an extruded solid: the original front silhouette remains meaningful while hands, shoulders, flanks, head and foot can bow forwards or backwards in depth.

Flying, Upright and Landing share exactly the same handle vocabulary, so all three poses still interpolate directly without a conventional skeletal animation rig.

## Preset preservation

`presets/runner-glyph-v1.json` is the exact accepted 2D preset captured before the 3D upgrade. Resetting the editor promotes that definition to v2 by adding `z: 0` to every point.

The editor also migrates an existing `arkour-runner-glyph-editor-v1` browser autosave into v2 on first load, so phone edits from the 2D prototype are not discarded.

## Controls

- tap a cyan handle to select it
- drag a handle in the active view plane
- **Front** edits X/Y
- **Side** edits Z/Y
- **Top** edits X/Z
- **Orbit** enables free camera inspection; handle dragging uses a camera-facing plane
- **Selected depth** provides a precise mobile Z control
- **Symmetry** mirrors paired left/right handles in X while preserving Y/Z
- **Ghost poses** overlays the other stored silhouettes in 3D
- **Play morph** interpolates continuously through Flying → Upright → Landing → Upright, including depth
- **Curve** adjusts contour smoothing
- **Fill** changes only preview opacity
- **Flatten Z** returns the current pose to its 2D plane
- **Reset pose / Reset to v1** restores the saved design silhouette with zero depth
- **Copy JSON v2 / Download JSON** exports the reusable 3D pose definition

Edits autosave locally under `arkour-runner-glyph-editor-v2`. This persistence is intentionally local and is not part of `ArchitectureDocument` or run-state data.

## Runtime direction

The editor's JSON remains a design artifact rather than a production contract. Once the 3D pose vocabulary is accepted, this semantic point set can be reduced or adapted into the procedural Runner rig shared by spectator presentation and, potentially, the broader Black ICE / Demon creature language.
