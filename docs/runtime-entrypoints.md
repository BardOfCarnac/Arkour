# Arkour runtime entrypoints

Arkour now has one canonical Run implementation and two explicit reference surfaces.

## `/` — canonical Run

The root page is the production route-first runtime formerly presented under `/next/`.

Its authority chain is:

1. `ArchitectureDocument`
2. compiled runtime routes and junctions
3. hard traversal and presentation keep-outs
4. connectivity-aware node machinery
5. continuous structural chassis
6. route-safe vertical-city packing
7. Runner entity and pose presentation
8. separate Runner and Spectator presentation cameras

Player input controls NET decisions and progression. View mode changes only how the same run is observed: **Runner** uses the guided traversal presentation, while **Spectator** renders the same production scene and Runner entity from an external chase/orbit camera. Neither view owns gameplay state.

## `/next/` — temporary compatibility alias

`/next/` currently loads the same production Run module as `/` so existing preview links remain valid while the root promotion settles.

It is not a second engine and should not acquire unique behaviour. Once old links no longer matter it can be removed.

## `/legacy/` — previous Run shell

The former root Run runtime is preserved at `/legacy/` for comparison and regression reference. New features should not be developed there.

## `/route-first-city/` — experimental laboratory

The standalone route-first vertical-city prototype remains under `public/route-first-city/` as a visual and interaction test bench.

Successful experiments should be promoted into the canonical Run rather than leaving production dependencies inside the prototype.

The Runner pose vocabulary is already shared through `public/runner-glyph/runner-pose-bank-v1.json`; the canonical Run now consumes that bank directly.
