# Arkour architecture baseline

**Status: LOCKED — 13 August 2026**

This document records the settled visual architecture for Arkour. Treat it as the default production direction, not as an experiment to be replaced by another scenery model unless playtesting exposes a concrete problem that this model cannot solve.

## Product purpose

Arkour is primarily a visualiser for a tabletop netrun. The tabletop game remains authoritative for rules and adjudication; Arkour makes the structure, movement, choices and encounters visible to the Netrunner, GM and spectators.

The architecture must therefore prioritise legibility and spectacle over simulating a literal cyber-city.

## Locked spatial metaphor

A NET Architecture is represented as **negative space milled through an enormous continuous solid volume**.

- Traversal routes are bores, slots and cuts through the mass.
- The descending route remains the main spatial grammar, with branches expressed physically in 3D.
- Ordinary transit space stays comparatively tight and visually simple.
- Encounters widen the cut into cavities whose proportions are driven by the encounter type.
- Junctions create the largest route cavities so branch choices remain immediately readable.
- Password, File, Control, Black ICE and Demon machinery is the meaningful authored content inside those cavities.
- The surrounding mass is environment, enclosure and scale; it is not a field of unrelated decorative buildings.

In shorthand:

> **The route is the cut. The encounter determines the chamber. Everything else is mass.**

## Visual hierarchy

The intended reading order is:

1. route / direction of travel;
2. cavity / spatial event;
3. meaningful NET element;
4. surface/material detail.

Nothing in the environment should compete with that hierarchy merely to make the scene feel populated.

## What is no longer part of the production direction

The following approaches are superseded as default architecture:

- city or skyscraper filler around routes;
- dense component fields used only to occupy empty space;
- decorative false infrastructure whose main purpose is visual population;
- vertical-city packing as a required scenery pass;
- large unrelated machinery districts between meaningful NET elements.

Those experiments remain useful reference material, but they should not silently return to the production generator.

## What may still evolve

Locking the architecture does **not** freeze presentation polish. The following remain open to refinement within this model:

- exact bore width and cavity dimensions;
- cavity profiles for each node family;
- material, machining marks, seams, embedded traces and lighting;
- node machinery and Black ICE / Demon forms;
- transitions between tight route cuts and large cavities;
- camera choreography and table-view cinematography;
- deterministic variation that changes detail without changing the core spatial grammar;
- performance and mesh-generation implementation.

## Reopening rule

Do not reopen the fundamental architecture because another visual metaphor is interesting. Reconsider it only when playtesting identifies a specific failure in comprehension, traversal, camera behaviour, encounter presentation or performance that cannot be addressed inside the milled-volume model.
