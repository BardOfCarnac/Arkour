# Runner Pose Lab

Standalone comparison and deformation tool for Arkour's authored Runner glyph poses.

This page intentionally does **not** drive the live Runner runtime. It is a design workbench for exploring what can be derived from the shared ten-point glyph topology.

## Sources

The board loads Candidate A, Candidate B and Candidate C. Candidate C preserves the third user-authored v2 file and is not added to `runner-pose-bank-v1.json` by this tool.

The initial board contains nine authored poses plus a derived mirrored `stride_b`.

## Deformers

All changes are non-destructive and are calculated from the source points at render time:

- body length / squash-stretch
- width
- depth
- longitudinal lean
- Z bow
- progressive body-axis twist
- top/bottom taper
- curve offset
- X mirror

`LINK DEFORMERS` applies the same deformation values to every authored thumbnail so the user can compare how one transformation behaves across the complete vocabulary. When unlinked, each pose keeps its own values.

## Morphing

The selected pose can morph into any other board pose because every authored glyph shares the same ten semantic points. Morphing is preview-only and can be combined with deformers.

## Snapshots

`SNAPSHOT` freezes the current morphed/deformed result into a local comparison card. Snapshots persist in localStorage on that browser and do not change repository assets or runtime data.

`COPY VARIANT JSON` exports an `arkour-runner-pose-variant` record containing the resulting points, curve and deformation metadata for later review.
