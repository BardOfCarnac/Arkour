# Arkour architecture engine

This document records the accepted production environment contract for Arkour. It is an engine boundary, not a commitment to the current placeholder building shapes.

## Canonical generation order

1. **ArchitectureDocument / logical NET graph**
   - Gameplay topology remains the source of truth.
   - Floors, branches, encounters and junctions define the logical architecture.

2. **Compiled traversal routes**
   - Routes use the hard vertical / 60-degree spatial grammar.
   - Every valid branch exists in shared 3D world space whether or not the Runner chooses it.

3. **Traversal, camera and hold reservations**
   - Route, presentation-camera and node-owned hold paths reserve space before scenery is admitted.
   - Scenery may not compromise route legibility, camera clearance or physical hold movement.
   - Logical blockers are the explicit exception: their authored blocking geometry may intentionally occupy traversal space until resolved.

4. **World-space macroarchitecture**
   - Large architectural masses are generated in absolute shared world space, not independently along each route.
   - Macrostructures claim substantial volumes of the common environment.
   - Claims may contain intentional voids, openings and attachment regions.
   - All non-blocking solid macrostructure geometry remains subject to the same spatial-admission authority as other scenery.
   - The current stack / open-frame / bridge forms are test proxies only and are not canonical visual archetypes.

5. **Global lattice machinery**
   - The shared 60-degree lattice fills unclaimed world space around routes, nodes and macrostructure claims.
   - Lattice cells must not populate the interior of accepted macrostructure claims.
   - Machinery is deterministic and assembled from grounded industrial families rather than free-floating decorative props.

6. **Sparse structural chassis**
   - Buses, conductors, braces and junction webs connect the shared world without enclosing routes in repeated rooms or tunnels.
   - Chassis geometry obeys final route/camera/hold admission rules.

7. **Node forms and logical boundaries**
   - Each encounter form owns its visual identity together with its hold/blocker behaviour.
   - Password, File, Control, Black ICE and Demon geometry may differ internally, but must participate in the same world-space architecture.
   - Passwords remain complete physical boundaries with one authored continuation when unresolved.

8. **Surface detail and presentation**
   - Materials, lighting, wire accents, colour fields, mottling, animation and later image-derived treatment sit above the spatial architecture.
   - These layers may change the read of a structure but may not redefine gameplay topology or spatial admission.

## Locked invariants

- **Route first.** The environment never gets first claim on traversal space.
- **One shared world.** Branches do not generate independent corridor cities around themselves.
- **Macro before infill.** Large architecture claims world volume before ordinary lattice machinery fills residual space.
- **Intentional voids matter.** Empty space is authored structure, not simply failed occupancy.
- **Connectivity over scatter.** Major masses and machinery should visibly belong to the larger machine-city rather than read as isolated floating props.
- **Node behaviour is physical.** Holds and blockers are spatial behaviours, not HUD-only states.
- **Deterministic generation.** Repeated generation from the same architecture/seed should reproduce the same environment.
- **Camera is presentation infrastructure.** Player choices affect NET traversal; they do not manually steer the protected presentation camera.

## What remains deliberately open

The following are vocabulary decisions and may continue to evolve without reopening the engine:

- the final macroarchitecture archetype library;
- exact building silhouettes and proportions;
- circuit-derived and software/code-derived building grammars;
- machinery family modelling and variation;
- density and distribution tuning;
- colour/palette extraction and mottled surface treatment;
- hero landmarks and long-range silhouettes;
- fine detail, materials, lighting and motion.

Experimental systems should now be evaluated as **donors to one of the canonical layers above**, rather than as competing world generators.

## Current acceptance criterion

A successful Arkour environment should read as a Runner moving at great speed through a vast constructed computational place: clear traversal routes passing through and between enormous architectural masses, with machinery and structural systems filling and connecting the remaining world at smaller scales.
