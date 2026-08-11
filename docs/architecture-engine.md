# Arkour architecture engine

**Status:** Accepted  
**Decision date:** 2026-08-10

This document records the canonical architecture model for Arkour. Earlier map, city, route, and scenery prototypes remain useful as donor experiments, but they are no longer competing engine candidates.

## Canonical pipeline

Arkour builds a run in this order:

1. **Architecture graph** — logical NET topology, encounters, junctions, and route choices.
2. **60-degree spatial route compiler** — turns graph/editor hints into a real 3D route skeleton using vertical segments and 60-degree diagonals distributed through X/Z.
3. **Traversal reservations** — reserves the real Runner corridor around every route and the interaction volume around encounters.
4. **Interactive node machinery + holding routes** — each logical NET element becomes a large physical machine. A node form owns its geometry, entry/exit ports, clearances, and any local holding motion used while the game waits for resolution.
5. **Structural chassis** — sparse continuous rails, buses, beams, conduits, and occasional frames physically bind the network together without turning the route into a tunnel of repeated rooms.
6. **Hex-volume city packing** — larger machinery, canyons, cantilevers, decks, stacks, bridges, and other districts occupy unused lattice-relative 3D volume, including space between branches rather than merely attaching scenery to the nearest route.
7. **Attachment / sealing pass** — special nodes may extend into nearby structure so their gameplay meaning is physically enforced.
8. **Detail pass** — fins, conductors, transformers, cable runs, vias, rings, cylinders, false buses, and other circuitry-scale detail decorate the larger forms.
9. **Spatial admission** — route/Runner keep-out is final authority over proposed geometry. Presentation-camera clearance may also reject unsafe scenery, but camera layout must not become gameplay topology.
10. **Camera / presentation** — the camera follows a separate smooth path inside the protected traversal volume. It may arc around the hard route geometry, but never changes connectivity.

## Locked invariants

### Route-first

The real route network is geometric authority. Scenery and machinery grow around it; they never silently move, replace, or invent gameplay routes.

### 60-degree spatial grammar

The hard route language is vertical plus 60-degree diagonals. Branches flare into genuine 3D space rather than remaining on a single diagram plane. The camera is intentionally smoother than the route.

### Nodes are architecture, not markers

Password, File, Control, Black ICE, Demon, and later NET elements are traversed machinery. A node may have several deterministic physical forms, but each form must preserve the logical role of the element.

A node form should be able to define:

- physical geometry;
- entry and exit ports;
- Runner clearance;
- local holding path or pose grammar;
- approach and release behaviour;
- optional attachment/sealing requirements.

### Logical blockers must physically block

If a NET element prevents progression in the rules, its physical form must prevent progression in the world.

A **Password** is therefore a bulkhead rather than decoration around a route. Before resolution it seals the local passage, extending or attaching to nearby enclosing structure so there is no plausible bypass. Its holding motion stays on the approach side. Once resolved, the node opens, retracts, splits, or otherwise exposes the legitimate continuation aperture.

This barrier/sealing capability is semantic and reusable: another future node may block progression without looking like a Password.

### Holding routes belong to node forms

Holding behaviour is not a generic camera wobble. It is local movement authored by the physical node form: orbiting/racing an aperture, perching on a gate, darting around a laser grid, circling ICE, and so on. Holding paths must never bypass a logical blocker.

### World filling is volumetric

The city/infill system targets unused 3D volumes, especially gaps between branch endpoints. It should not collapse into left/right roadside decoration or concentrate all mass on the central trunk.

### Avoid the room/tunnel regression

Continuous structure should make the NET feel like one enormous machine, but repeated ribs, walls, or enclosing boxes must not create a sequence of rooms the Runner simply falls through.

### Deterministic generation

Stable strings may seed generation so the same named architecture reproduces the same macro treatment and the same named node reproduces its local form/variables. Changing one node should not unnecessarily rearrange unrelated areas.

## Provider responsibilities

The production architecture composer should evolve toward sibling providers with clear ownership:

- **Node provider:** semantic NET-element machinery and node-owned hold paths.
- **Chassis provider:** sparse connective structure following the route network.
- **District provider:** lattice/volume-aware large-scale world filling.
- **Attachment provider:** boundary connections and blockers such as Password sealing.
- **Detail provider:** circuitry-scale decoration attached to larger structures.

Providers propose geometry. Spatial admission decides what is legal.

## Status of older experiments

Older route-first, vertical-city, structural-chassis, hex-grid, node-block, holding-route, and monolithic architecture-generator experiments remain sources of useful geometry, algorithms, and visual vocabulary. They should be harvested into this engine rather than maintained as alternate production architectures.

The current `generateRouteFirstArchitecture` composer remains the production bridge while these responsibilities are separated cleanly. Refactors should preserve the contract above rather than reopen the engine-selection question.
