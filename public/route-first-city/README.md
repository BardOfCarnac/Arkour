# Route-first vertical city prototype

This folder is an isolated visual/structural prototype for the current Arkour world-building direction. It is intentionally under `public/` so Vite copies it verbatim into the Pages build and it can be inspected without changing the production runtime.

## What this prototype is testing

The prototype treats the NET Architecture as three related but distinct things:

1. **Logical graph** — game truth: Password → File → Hellhound → branches → Control Nodes → Efreet.
2. **Surface mirror** — a small above-ground extrusion of that graph, giving the runner a readable silhouette of the Architecture before entering it.
3. **Underground interpretation** — the same topology expanded into a huge vertical city / machine canyon rather than a literal scale copy of the graph.

The key construction rule is **route first**:

1. Generate every valid hard traversal route from the graph using vertical and angled/sideways segments.
2. Reserve a keep-out envelope around all of those routes, including branches that the runner is not currently taking.
3. Sample the curved presentation camera path and reserve a separate camera keep-out envelope.
4. Build major encounter/component masses around genuine route apertures.
5. Pack bridges, decks, narrows, utility stacks and city mass into the space that remains.
6. Reject any opaque piece whose bounding volume intersects either reserved envelope.

This is deliberately the reverse of "build scenery first, then try to steer the camera through it".

## Visual rules represented here

- Underground objects are **opaque hard-shell masses with wireframe surface edges**, not transparent cages.
- The red traversal rail remains hard and schematic; the camera is free to arc around it.
- Major nodes are large physical components with a route through, between, under or along them.
- The city layer is connective tissue between graph nodes: canyon walls, cantilevers, shelves, traffic and utility structures.
- Branch topology affects physical geometry. Hellhound is represented as a large junction component because it has one incoming and three outgoing routes in this Architecture.
- The central route is only the camera's chosen path for this demo; route clearance is reserved for all branches.

## Controls

- **Pause / Run** — stop or resume the automatic descent.
- **Reset** — return to the surface approach.
- **Show clearance** — display the reserved clearance guides around the red traversal network.
- **City** — change secondary city density. Major graph components remain.
- **Timeline scrubber** — inspect any part of the run directly.
- Pointer movement adds a small presentation-camera lean.

## Relationship to the production engine

This is not intended to replace the existing Three.js runtime directly. The renderer is deliberately lightweight and standalone so the design rules can be judged in isolation.

The parts worth migrating into the production architecture are the generation order and constraints:

- graph → route network
- route/camera keep-out volumes
- connectivity-aware node component selection
- route-safe city/chassis packing
- camera as presentation rather than world-layout authority

The existing `src/architecture/structural.ts` work is therefore complementary, but this prototype suggests a stronger ordering than the current `structural chassis → traversal corridor → mounted detail`: the traversal network and its reserved volumes should become the first geometric authority, with the chassis generated around them.
