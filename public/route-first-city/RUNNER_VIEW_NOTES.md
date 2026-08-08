# Runner / spectator view experiment

This prototype deliberately keeps the existing route-first renderer intact and adds the first presentation seam beside it.

## Current experiment

- `demo.js` remains the existing immersive Runner view.
- `runner-view.js` maintains a lightweight Runner pose from the shared scrub/timeline state.
- The Runner follows the hard central traversal route rather than the presentation camera.
- A mobile-friendly `VIEW: RUNNER / VIEW: SPECTATOR` control switches to an independent external camera.
- The spectator renderer draws a deliberately crude wireframe Runner against a simplified version of the route-first megastructure.
- `window.ArkourRunSnapshot` exposes a serialisable version-1 snapshot containing view mode, route progress, Runner phase, current/next node identity, position and forward direction.

## Runner phases

The proof-of-concept vocabulary is:

`FLYING -> APPROACHING -> ARRIVING -> STATIONARY -> DEPARTING`

These are presentation/runtime states, not ArchitectureDocument fields.

## Architectural intent

`ArchitectureDocument` remains game topology and editor/import data only. Runner state, cameras and spectator/table/GM presentations stay outside that interchange contract.

The next integration step, if this visual experiment works, is to move the Runner pose/snapshot into the production runtime so all views consume one authoritative runtime state rather than deriving it from the prototype timeline.
