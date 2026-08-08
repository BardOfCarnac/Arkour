# Runner Pose Bank v1

This document names the first six canonical authored Runner poses and separates them from Arkour's runtime traversal phases.

## Source mapping

The authored shapes are preserved in two source files:

- **Candidate A** — `runner-glyph-v2-candidate-a.json`
  - `flying` → `travel_head_first`
  - `upright` → `neutral_base`
  - `landing` → `landing_recovery`
- **Candidate B** — `runner-glyph-v2-candidate-b.json`
  - `flying` → `travel_feet_first`
  - `upright` → `neutral_fall`
  - `landing` → `landing_impact`

Candidate A and Candidate B have different curve values (`0.47` and `0.58`). Cross-source morphs should therefore blend the curve as well as XYZ control points rather than snapping smoothing strength at pose boundaries.

## Canonical pose names

### `travel_head_first`
Aggressive head-first dive. This is never entered directly from a feet-first state; the body must visibly flip into it.

### `travel_feet_first`
Default travel/descent pose. This is the ordinary travelling state and the safe orientation from which landing transitions begin.

### `neutral_base`
Primary adaptable neutral pose. It may represent standing, hovering, hanging, holding, waiting, interacting, or a low-energy falling presentation. It deliberately carries no gameplay meaning by itself.

### `neutral_fall`
Secondary feet-first neutral/falling pose. It provides variation for low-speed travel and hover states without replacing `neutral_base` as the main neutral anchor.

### `landing_recovery`
Controlled landing / impact-absorption pose. It is both a valid standard landing and the recovery bridge between the dramatic impact pose and neutral.

### `landing_impact`
Extreme asymmetric first-impact pose for dramatic arrivals. One side can visually contact the surface; it should be brief and immediately resolve through `landing_recovery`.

## Transition grammar

The machine-readable timing defaults live in `runner-pose-bank-v1.json`. The intended sequences are:

- ordinary departure: `neutral_base|neutral_fall → travel_feet_first`
- deliberate aggressive dive: `travel_feet_first → FLIP → travel_head_first`
- prepare to land from head-first: `travel_head_first → FLIP → travel_feet_first`
- standard landing: `travel_feet_first|neutral_fall → landing_recovery → neutral_base`
- dramatic landing: `travel_feet_first|neutral_fall → landing_impact → landing_recovery → neutral_base`
- low-speed/hover variation: `neutral_base ↔ neutral_fall`

A flip is a transition behaviour, not a seventh authored pose. The current default is a 180° turn around the Runner's local X axis while the source and destination shapes blend.

## Runtime phase mapping

Current traversal phases (`FLYING`, `APPROACHING`, `ARRIVING`, `STATIONARY`, `DEPARTING`) remain higher-level run state. They should select or transition among these poses rather than be renamed after them.

Suggested first mapping:

- `STATIONARY` → `neutral_base`, with optional `neutral_fall` presentation variation
- `DEPARTING` → blend neutral to `travel_feet_first`
- `FLYING` → normally `travel_feet_first`; `travel_head_first` only after an explicit flip / speed choice
- `APPROACHING` → ensure feet-first orientation before the landing window
- `ARRIVING` → choose standard or dramatic landing sequence

No numeric speed thresholds are fixed yet. The source material supports the existence and intended orientation of the poses, but speed selection remains a runtime tuning decision to make after observing the glyph at Arkour scale.
