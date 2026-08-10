# Black ICE Quadruped Glyph Editor

Standalone 15-point 3D Black ICE design editor for bilateral beast forms such as hounds, cats, panthers, wolves and related ICE silhouettes.

## Rig

The quadruped uses 12 authored contour points plus three real internal surface anchors:

- contour: nose, paired ears, paired neck pits, paired fore/shoulder points, paired waist pits, paired hind/haunch points, tail
- internal spine: `chest`, `core`, `pelvis`

The editor uses the same coordinate convention as the flat Black ICE starfish editor:

- X/Z = ground plane
- Y = height
- -Z = front
- Top is the default authoring view

## Surface behaviour

`chest`, `core`, and `pelvis` are part of the mesh construction. Contour sectors are triangulated directly to them, so moving the spine tents, folds and holds the body surface instead of moving only guide lines.

## Symmetry

`SYMMETRY: ON` is the default. Left/right ears, neck pits, fore points, waist pits and hind points mirror across X=0. Nose, tail, chest, core and pelvis stay on the centreline. Turning symmetry back on averages paired points before reapplying the constraint.

## Controls

- Top: X/Z drag plane
- Front: X/Y drag plane
- Side: Z/Y drag plane
- Orbit: camera-facing drag plane
- Selected Height Y: precise vertical editing on mobile
- Curve and Fill preview controls
- Symmetry toggle
- Flatten to Ground
- Reset, Copy JSON, Download JSON

Seed asset: `quadruped-v1.json`.

This is a standalone design tool. It does not alter the Runner runtime, Black ICE gameplay behaviour, route generation or ArchitectureDocument.
