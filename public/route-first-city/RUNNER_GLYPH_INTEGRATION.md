# Runner Glyph integration

The spectator prototype now renders the authored `arkour-runner-glyph` v2 body instead of the temporary wireframe humanoid.

## Candidate A

The accepted first 3D body is stored at:

`public/runner-glyph/runner-glyph-v2-candidate-a.json`

It preserves the supplied Flying, Upright and Landing poses exactly, including curve `0.47` and all authored XYZ coordinates.

## Local axes

The glyph definition keeps the editor convention:

- **X** = body left/right
- **Y** = head-to-foot / travel axis
- **+Z** = body front / facing direction

At runtime local +Y is aligned to the traversal route's forward direction. Local +Z becomes the body's facing normal perpendicular to the route. This keeps travel direction and facing direction distinct.

## Pose use

The three authored poses are intentionally treated as a small reusable vocabulary, not three hard gameplay states:

- **Flying** — normal high-speed traversal
- **Landing** — compression / impact pose when arriving at a node
- **Upright** — adaptable neutral base pose for held, hovering, standing, interacting or future action states

The current spectator prototype blends continuously through these poses using signed distance to the nearest node:

1. Flying → Landing over the final approach.
2. Landing → Upright immediately after contact.
3. Upright → Flying during departure.

This is presentation logic only. The glyph data remains independent of `ArchitectureDocument`, and a future authoritative runtime can drive these pose weights from real transit/hold/action state instead of prototype route distance.

## Rendering

The glyph remains a warped sheet rather than a conventional anatomical mesh. The spectator renderer:

- transforms all ten semantic control points into route-relative world space,
- smooths the authored contour using the preset curve value,
- renders a translucent face, bright outline and faint internal structure,
- preserves the temporary humanoid only as a load-failure fallback.

No procedural banking, velocity stretch, impact recoil or action gestures are applied yet. Those should be added around the authored poses only after the base silhouette has been judged at real Arkour scale.
