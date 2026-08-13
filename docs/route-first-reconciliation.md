# Route-first / structural reconciliation

> **Historical design note.** The route-first keep-out and authority ideas here remain relevant, but the structural chassis / vertical-city scenery direction has been superseded by the locked milled-volume architecture. See `docs/architecture-baseline.md`.

Arkour originally treated two architecture models as complementary rather than competing: route-first traversal authority plus a generated structural/city scenery layer.

## Authority order that remains valid

1. `ArchitectureDocument` supplies the logical NET Architecture.
2. The runtime builds every valid traversal route, including branches the runner may not choose.
3. Those routes reserve hard scenery keep-out volumes.
4. The presentation camera reserves a separate keep-out volume.
5. Visual generation must respect those route and camera reservations.

The important inversion remains that the visual generator is a **builder**, not the geometric authority. It can determine how the surrounding mass and node machinery look, but not where traversal space is allowed to exist.

## Superseded implementation direction

Earlier versions then proposed continuous chassis machinery, vertical-city packing, decorative infrastructure and a surface mirror composed through `generateRouteFirstArchitecture(...)`.

That filler model is no longer the production direction. `generateRouteFirstArchitecture(...)` now expresses routes as negative-space cuts through a continuous solid volume, widening those cuts around encounters and junctions while preserving the route-first authority described above.

The current production rule is:

> **The route is the cut. The encounter determines the chamber. Everything else is mass.**

See `docs/architecture-baseline.md` for the locked architecture decision and the conditions under which it may be reconsidered.
