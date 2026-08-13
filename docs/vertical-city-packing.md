# Route-safe vertical-city packing

> **SUPERSEDED DESIGN NOTE.** This document records an earlier scenery direction. Vertical-city packing is no longer part of the production architecture. The locked baseline is the milled-volume model in `docs/architecture-baseline.md`: routes are negative-space cuts through continuous mass, with meaningful encounter machinery inside type-shaped cavities. Keep this file only as historical reference.

The vertical-city pass was conceived as the third architectural scale in the earlier reconciled Arkour generator:

1. **Node scale** — Password, File, Control, ICE and Demon machinery owns the immediate encounter neighbourhood.
2. **Route scale** — the structural chassis connects those machines with continuous rails, ribs and conductors.
3. **City scale** — large secondary megastructure fills the remaining travel space with canyon walls, cantilever decks, service platforms and utility stacks.

## Authority and ordering

The city generator did not own traversal geometry. It only proposed route-relative scenery.

The runtime had already created keep-out volumes for **every valid route**, including branches that are not selected, plus the presentation-camera corridor. Every city piece was therefore passed through the same admission test as the node and chassis geometry. A city object that intersected any reserved route or camera volume was rejected before it reached the scene.

This preserved the route-first rule:

> traversal reserves the world first; architecture occupies only what remains.

That route-first authority remains useful. The city-filler implementation does not.

## Node neighbourhoods

City districts were only proposed away from encounter and junction anchors. This kept the large identity-defining node machines visually dominant and left the structural chassis room to bridge between node and city scales.

## District vocabulary

The experimental pass used a small reusable kit rather than thousands of decorative objects:

- **Canyon districts** — paired tall opaque slabs with a generous traversal gap and occasional attached masses.
- **Cantilever districts** — heavy split decks and support pylons that create underpass/overpass readings without spanning the protected route.
- **Service-deck districts** — hanging shelves, machinery cabinets and opposite-side masses that make the space feel occupied.
- **Utility-stack districts** — long conductor trunks and repeated equipment banks running beside the route.
- **Service traffic** — sparse secondary rails on the outside of the protected traversal envelope.

District selection and dimensions were deterministic from the Architecture seed. Density controlled how many districts were proposed, not whether route safety was respected.

## Why it was superseded

The city pass solved the problem of empty space by adding unrelated scenery. The milled-volume architecture removes that problem instead: the surrounding solid mass is already the environment, while the void, encounters and branches carry the information. This produces a clearer visual hierarchy and avoids making decorative city geometry compete with the NET Architecture itself.
