# Route-first / structural reconciliation

Arkour now treats the two recent architecture models as complementary rather than competing.

## Authority order

1. `ArchitectureDocument` supplies the logical NET Architecture.
2. The runtime builds every valid traversal route, including branches the runner may not choose.
3. Those routes reserve hard scenery keep-out volumes.
4. The presentation camera reserves a separate keep-out volume.
5. The structural generator proposes the continuous chassis and encounter machinery.
6. The scenery admission pass rejects any proposed piece that intrudes into either reservation.
7. Future connectivity-aware node families, vertical-city packing and the surface mirror compose through `generateRouteFirstArchitecture(...)`.

The important inversion is that the structural chassis is now a **builder**, not the geometric authority. It can determine how the machine looks, but not where traversal space is allowed to exist.

## First production integration

`src/run/keepout.ts` now owns the combined route/camera reservations. Route reservations are generated from **all** runtime routes, rather than only the active route, so unchosen branches cannot later be blocked by scenery.

Opaque boxes and instanced pieces are tested against line-segment corridors expanded by their configured clearances. Rings use a torus-specific check so their intentional central route aperture is not rejected by a coarse bounding box.

`src/run/scenery.ts` is now the reconciliation point: the existing structural plan is still generated, but every piece must pass route-first admission before it enters the Three.js scene.

`src/architecture/route-first.ts` is the new production composition seam. For now it delegates to the structural generator; later node-family, city and surface passes should be added there.

## Next work

- make node component selection explicitly connectivity-aware;
- add route-safe vertical-city packing as a second scenery pass;
- generate the surface graph mirror from the same `ArchitectureDocument`;
- replace current generic route layout with the final hard vertical/60-degree route grammar;
- add visual keep-out diagnostics for acceptance testing.
