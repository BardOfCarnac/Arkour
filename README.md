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

The Run page owns traversal, camera motion, runtime state, proximity interactions, spatial branch selection, input, HUD, and rendering. It does **not** generate NET architecture.

Gameplay topology and visual architecture are separate inputs. `RunWorld` describes real routes, encounters, and junctions; `ScenePlan` describes route-relative machinery around those routes without creating additional gameplay choices.

The acceptance world exercises:

- continuous 3D travel;
- a descending trunk route;
- Password, File, and Black ICE approach HUD states;
- a genuine three-way spatial fork;
- upper-left, deep/down, and upper-right exit routes;
- smooth camera look-ahead and banking;
- Hold/Resume visual state;
- mouse/touch branch controls plus keyboard input;
- route-relative scenery and decorative infrastructure;
- deterministic seeded machinery-field and particle placement;
- false infrastructure that can imply routes without becoming selectable graph edges.

## Architecture generator

The next layer compiles `RunWorld` into a deterministic `ScenePlan`. The runtime remains unaware of architecture semantics: it still receives topology plus scenery as two separate inputs.

`generateArchitecture(world, { seed })` currently builds four visual passes:

- encounter architecture for Password, File, Control, Black ICE habitat, and Demon spaces;
- route infrastructure such as heatsink fins, bus spines, component fields, cables, and deep-route vias;
- junction switchyards with real exits surrounded by decorative false buses;
- macro architecture that makes a small graph read as a much larger circuit-board megastructure.

The low-level renderer only knows reusable primitives. Alongside the original boxes, apertures, canyons, fields, interchanges, and decorative tubes, `ScenePlan` now supports cylinders, rings, and regular repeated members. Semantic component ideas such as connector gates, memory banks, relay hubs, switchyards, and transformer-like Demon cores live exclusively in the generator.

Generation is seed-stable: route, encounter, junction, and field variations derive their own seeds so changing one generated area does not require rearranging the whole scene.

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

Editing, multiplayer, rules automation, persistence, elaborate shaders, weather, sound systems, and WebXR remain out of scope until the Run loop and architecture-generation seams are solid.
