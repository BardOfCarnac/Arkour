# 60-degree spatial route grammar

Arkour's logical Architecture is deliberately not rendered as an arbitrary spline graph.

The compiler now interprets the editor's `floor` / `column` hints using a small spatial grammar:

- same-column edges are **straight vertical descents**;
- a one-column branch is a **hard 60-degree diagonal from the vertical trunk**;
- the diagonal's horizontal displacement is distributed across X and Z, so branches flare into real 3D space instead of lying on one flat diagram plane;
- the surface graph mirror uses the same proportions at a much smaller scale;
- the red traversal rail is rendered segment-by-segment so its hard corners remain visually exact.

For a vertical floor drop `d`, a one-column branch uses horizontal displacement `sqrt(3) * d`. That makes the angle between the vertical incoming route and the diagonal branch exactly 60 degrees in world space.

## Camera rule

The camera does **not** inherit the hard rail geometry.

The acceptance tour samples the selected logical route and constructs a separate Catmull-Rom presentation spline inside the reserved traversal corridor. Between nodes it drifts laterally around the rail; as an encounter approaches, that offset contracts so the camera lines itself up with the node's real aperture.

This preserves the intended contrast:

- **route:** angular, circuit-board / hex grammar;
- **camera:** smooth, arcing, anticipatory motion around that route.

The route remains geometric authority. The presentation curve is constrained to stay close enough to the reserved route volume that scenery generated under the route-first keep-out rules remains safe.

## Current canonical Architecture

The acceptance document now directly represents the `Cameras, Main` reference:

Password DV8 → File DV6 → Hellhound → three Control Node DV6 branches → second Control Node layer, with Efreet beneath the centre branch.
