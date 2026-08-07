# Arkour

A lightweight browser runtime for traversing Cyberpunk RED-style NET architectures as continuous 3D spaces.

The first milestone is deliberately narrow: a production-quality **Run page** that can consume a finished 3D route network, carry a traveller through it continuously, present encounters and spatial branches, and keep rendering/UI/input concerns separate from architecture generation.

## Stack

- Vite
- TypeScript
- Three.js
- DOM/CSS UI — no front-end framework
- Static-first — no backend required for the Run runtime

## Run v0.1 contract

The Run page owns traversal, camera motion, runtime state, proximity interactions, spatial branch selection, input, HUD, and rendering. It does **not** generate NET architecture.

The acceptance world currently exercises the mechanics we need before architecture generation is introduced:

- continuous 3D travel;
- a descending trunk route;
- Password, File, and Black ICE approach HUD states;
- a genuine three-way spatial fork;
- upper-left, deep/down, and upper-right exit routes;
- smooth camera look-ahead and banking;
- Hold/Resume visual state;
- mouse/touch branch controls plus keyboard input;
- sparse test geometry for pass-by, aperture, overpass, occlusion, and depth cues.

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

Architecture generation, editing, multiplayer, rules automation, persistence, elaborate shaders, weather, sound systems, and WebXR are deliberately out of scope until the Run loop itself is solid.
