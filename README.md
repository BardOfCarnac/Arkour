# Arkour

A lightweight browser runtime for traversing Cyberpunk RED-style NET architectures as continuous 3D spaces.

The first milestone is deliberately narrow: a production-quality **Run page** that can consume a finished 3D route network plus a separate visual scene plan, carry a traveller through it continuously, present encounters and spatial branches, and keep rendering/UI/input concerns separate from architecture generation.

## Stack

- Vite
- TypeScript
- Three.js
- DOM/CSS UI — no front-end framework
- Static-first — no backend required for the Run runtime

## Run v0.1 contract

The Run page owns traversal, camera motion, runtime state, proximity interactions, spatial branch selection, input, HUD, and rendering. It does **not** run or adjudicate Cyberpunk RED rules.

Gameplay topology and visual architecture are separate inputs. `RunWorld` describes real routes, encounters, and junctions; `ScenePlan` describes the visual space around those routes without creating additional gameplay choices.

The acceptance world exercises:

- continuous 3D travel;
- a descending trunk route;
- Password, File, and Black ICE approach HUD states;
- a genuine three-way spatial fork;
- upper-left, deep/down, and upper-right exit routes;
- smooth camera look-ahead and banking;
- Hold/Resume visual state;
- mouse/touch branch controls plus keyboard input;
- a continuous milled solid volume around traversal space;
- encounter-specific cavity proportions;
- enlarged, readable junction cavities;
- meaningful node machinery without unrelated city filler.

## Locked architecture baseline

The production architecture is now settled. See [`docs/architecture-baseline.md`](docs/architecture-baseline.md).

Arkour represents a NET Architecture as **negative space milled through an enormous continuous solid volume**:

- the route is a bore, slot or cut through the mass;
- ordinary transit stays comparatively tight and simple;
- encounters widen the cut into cavities shaped by their type;
- branch junctions open into the largest route cavities;
- Password, File, Control, Black ICE and Demon machinery is the meaningful authored content inside those spaces;
- the surrounding mass provides enclosure and scale rather than unrelated decorative scenery.

The shorthand rule is:

> **The route is the cut. The encounter determines the chamber. Everything else is mass.**

`generateRouteFirstArchitecture(...)` is the production composition seam for this model. Earlier structural chassis, component-field and vertical-city experiments remain in the repository as reference material but are not the default production direction.

The low-level renderer continues to operate on reusable `ScenePlan` primitives, keeping the runtime independent of NET Architecture semantics. Refinement should focus on cavity profiles, node machinery, materials, lighting, transitions, camera choreography and performance without reopening the fundamental spatial metaphor unless playtesting identifies a concrete failure that cannot be solved within it.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

### Controls

- `←` / `A` — previous branch
- `→` / `D` — next branch
- `Space` / `H` — hold/resume
- `Esc` / `P` — pause/unpause
- branch labels are also directly clickable/tappable

## Not in v0.1

Editing, multiplayer, rules automation, persistence, elaborate shaders, weather, sound systems, and WebXR remain out of scope until the Run loop and presentation seams are solid.
