# Runner Glyph Editor

A touch-first design sandbox for defining Arkour's abstract Runner silhouette before the shape is wired into the runtime.

## Design model

The editor deliberately avoids a generic vector-tool workflow. Each pose is a closed silhouette driven by the same ten semantic outline handles:

- head / top
- left and right neck
- left and right hand / outer shoulder tip
- left and right under-arm
- left and right flank
- foot / travel tip

The shared handle vocabulary means Flying, Upright and Landing poses can be interpolated directly without a conventional skeletal animation rig.

## Controls

- drag any cyan handle with pointer or touch
- **Symmetry** mirrors paired left/right handles while editing
- **Ghost poses** overlays the other stored silhouettes for proportion comparison
- **Play morph** interpolates continuously through Flying → Upright → Landing → Upright
- **Curve** adjusts Catmull-Rom-style smoothing strength
- **Fill** changes only the preview opacity
- **Reset pose** restores the current default
- **Copy JSON** exports the reusable pose definition
- **Download SVG** exports the currently selected pose as a clean silhouette

Edits autosave to browser local storage under `arkour-runner-glyph-editor-v1`. This persistence is intentionally local and is not part of `ArchitectureDocument` or run-state data.

## Runtime direction

The editor's JSON is a design artifact, not yet a production contract. Once the silhouette and pose vocabulary are accepted, the small semantic point set can be reduced or adapted into the procedural Runner rig used by spectator, first-person embodiment, Black ICE and Demon animation systems.
