# Arkour

A lightweight browser runtime for traversing Cyberpunk RED-style NET architectures as continuous 3D spaces.

Arkour presents a logical NET architecture as an enormous shared machine-city: hard vertical/60-degree traversal routes pass through world-space architecture, industrial machinery and encounter forms while the presentation camera remains clearance-verified and deterministic.

## Stack

- Vite
- TypeScript
- Three.js
- DOM/CSS UI — no front-end framework
- Static-first — no backend required for the Run runtime

## Canonical architecture contract

The current production direction is recorded in [`docs/architecture-engine.md`](docs/architecture-engine.md).

The locked generation order is:

1. logical `ArchitectureDocument` / NET graph;
2. compiled hard traversal routes;
3. route, camera and physical-hold reservations;
4. large world-space macroarchitecture claims;
5. shared lattice machinery filling the remaining space;
6. sparse buses, conductors and structural chassis;
7. node-form geometry, holds and physical blockers;
8. materials, lighting and presentation detail.

The important distinction is **macro before infill**. Large architecture owns meaningful volumes and voids in the common world; ordinary lattice machinery fills what remains instead of trying to create the entire city by itself.

The current macro stack / open-frame / bridge shapes are deliberately crude acceptance proxies. Their silhouettes are not locked. Building portfolios, circuit-derived forms and software/code architecture should now plug into the macroarchitecture layer rather than become competing world generators.

## Runtime principles

- The logical graph remains gameplay truth.
- Every valid branch reserves real 3D space before scenery is admitted.
- Route geometry stays hard; camera presentation may arc smoothly around it.
- Player input selects NET traversal decisions rather than manually steering the camera.
- Encounter forms own physical hold/blocker behaviour as well as visual identity.
- Passwords are physical boundaries, not decorative gates that can be flown around.
- The environment is one shared world, not separate corridor scenery generated along each route.
- Large architecture and machinery are deterministic for a given architecture/seed.

## Current visual vocabulary

The global lattice currently uses grounded industrial machinery families including thermal exchangers, transformers, switchgear, capacitor banks, rotary machines, cable manifolds, relay racks and reactor coils. These are supporting machinery rather than the final city-scale silhouette language.

Node forms currently include Password bulkheads, File memory canyons, Control relay/manifold forms, Black ICE habitats and Demon transformer/core forms. The form system remains extensible while preserving the same interaction and spatial contracts.

## Development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Still open for design

The engine is locked more tightly than the art vocabulary. Final macroarchitecture archetypes, building silhouettes, circuit/code-derived grammars, palette extraction, mottling, density tuning, hero landmarks, materials, lighting, animation, sound and WebXR can continue to evolve inside the canonical layering contract.
