# Runner Glyph integration

The spectator prototype renders the authored Runner Glyph body from `runner-pose-bank-v1.json` rather than treating a single three-pose file as the runtime contract.

## Pose bank

The source assets remain independent authored checkpoints:

- `public/runner-glyph/runner-glyph-v2-candidate-a.json`
- `public/runner-glyph/runner-glyph-v2-candidate-b.json`

The runtime vocabulary is defined by:

`public/runner-glyph/runner-pose-bank-v1.json`

Its six canonical poses are:

- `travel_head_first`
- `travel_feet_first`
- `neutral_base`
- `neutral_fall`
- `landing_recovery`
- `landing_impact`

The pose bank maps those names back to the exact authored source poses. Cross-source morphs blend both XYZ control points and the source curve values.

## Local axes and orientation

The glyph definition keeps the editor convention:

- **X** = body left/right
- **Y** = head-to-foot body axis
- **+Z** = body front / facing direction

For feet-first poses, local +Y is aligned to the traversal route's forward direction. Head-first travel is not faked by changing the silhouette: the runtime performs the bank's 180-degree local-X flip, which reverses local Y/Z relative to the route. The exit flip continues through 360 degrees so the tumble reads continuously before a landing.

Travel direction and facing direction therefore remain distinct.

## Prototype choreography

The current route-first demo does not yet have authoritative speed or action input, so pose selection is deliberately a presentation test rather than gameplay semantics.

Every traversal leg exercises the reusable neutral/fall chain:

1. `neutral_base` → `neutral_fall`
2. `neutral_fall` → `travel_feet_first`

To make the new flip visible without inventing speed thresholds, the legs terminating at **Hellhound** and **Efreet** are temporarily flagged as aggressive-dive demonstrations:

1. `travel_feet_first` → 180° flip-blend → `travel_head_first`
2. hold `travel_head_first` through the middle of the leg
3. 180° exit flip-blend back to `travel_feet_first`
4. complete the flip before the landing sequence starts

Other legs remain feet-first.

## Landing sequences

Ordinary nodes use the standard sequence from the pose bank:

`travel_feet_first` → `landing_recovery` → `neutral_base`

Hellhound and Efreet temporarily exercise the dramatic sequence:

`travel_feet_first` → `landing_impact` → `landing_recovery` → `neutral_base`

The bank durations are used directly and converted to route distance using the prototype's 27-second playback. At the final Efreet node, where route distance can no longer advance after contact, the post-impact recovery is completed against real animation time so the run can settle instead of freezing on the impact pose.

## Rendering

The glyph remains a warped sheet rather than a conventional anatomical mesh. The spectator renderer:

- resolves all six bank poses from Candidate A/B,
- transforms the ten semantic control points into route-relative world space,
- applies the current local-X orientation during flips,
- smooths the contour using the current blended curve value,
- renders a translucent face, bright outline and faint internal structure,
- exposes pose, transition, weights, curve and orientation through `window.ArkourRunSnapshot`,
- preserves the temporary humanoid only as a load-failure fallback.

The demo target sets are intentionally temporary. Real head-first selection should later be driven by speed/action intent, and dramatic landing selection by actual presentation/gameplay context rather than node names.
