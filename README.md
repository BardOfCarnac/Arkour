# Arkour

A lightweight browser runtime for traversing Cyberpunk RED-style NET architectures as continuous 3D spaces.

The first milestone is deliberately narrow: a production-quality **Run page** that can consume a finished 3D route network, carry a traveller through it continuously, present encounters and spatial branches, and keep rendering/UI/input concerns separate from architecture generation.

## Initial technical direction

- Vite
- TypeScript
- Three.js
- DOM/CSS UI (no framework)
- Static-first; no backend required for the Run runtime

Architecture generation, editing, multiplayer, rules automation, and WebXR are intentionally out of scope for the first milestone.
