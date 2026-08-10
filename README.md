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

## Architecture engine

The architecture engine compiles logical NET topology into deterministic, traversable machinery while keeping gameplay routes authoritative. The accepted engine contract is recorded in [`docs/architecture-engine.md`](docs/architecture-engine.md).

`generateRouteFirstArchitecture(world, { seed })` is the current production composer. The model is deliberately layered:

- graph/editor topology compiles to a real 3D route skeleton using the 60-degree spatial grammar;
- traversal and encounter volumes are reserved before scenery is admitted;
- large semantic node machinery gets first claim around NET elements and will own local holding routes;
- sparse chassis infrastructure binds routes into one continuous machine;
- volumetric city/district packing fills unused 3D space, including gaps between branches;
- blocker nodes may use an attachment/sealing pass so logical barriers are also physical barriers;
- circuitry-scale detail decorates the larger structure;
- route/Runner keep-out remains final authority over proposed geometry;
- camera presentation is derived last and never creates gameplay topology.

The current generators are an evolutionary bridge while node, chassis, district, attachment, and detail responsibilities are separated cleanly. Older map/city prototypes remain donor experiments rather than competing production engines.

Generation is seed-stable: route, encounter, junction, and field variations derive their own seeds so changing one generated area does not require rearranging the whole scene. The longer-term deterministic model also allows stable architecture/node strings to select repeatable macro and local forms.

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
