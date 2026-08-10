import type { RouteAnchor, ScenePiece, ScenePlan } from '../run/scene-plan';
import type { RouteSpec, RunWorld, Vec3 } from '../run/types';
import type { ArchitectureOptions } from './generate';
import { generateNodeComponents } from './node-components';
import { generateStructuralArchitecture } from './structural';
import { generateVerticalCity } from './vertical-city';

const NODE_STRUCTURE_CLEARANCE = 15;

function pointDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function estimateRouteLength(route: RouteSpec): number {
  let length = 0;
  for (const segment of route.segments) {
    if (segment.kind === 'line') {
      length += pointDistance(segment.from, segment.to);
    } else {
      length += pointDistance(segment.from, segment.control)
        + pointDistance(segment.control, segment.to);
    }
  }
  return Math.max(1, length);
}

function anchorDistance(anchor: RouteAnchor, routeLength: number): number {
  if (anchor.distance !== undefined) return anchor.distance;
  return Math.max(0, Math.min(1, anchor.at)) * routeLength;
}

function structuralPieceEntersNodeZone(piece: ScenePiece, world: RunWorld): boolean {
  const route = world.routes.find((candidate) => candidate.id === piece.anchor.routeId);
  if (!route) return false;

  const routeLength = estimateRouteLength(route);
  const distance = anchorDistance(piece.anchor, routeLength);
  const reservedDistances = [
    ...(route.encounters ?? []).map((encounter) => encounter.at * routeLength),
    ...world.junctions
      .filter((junction) => junction.incomingRoute === route.id)
      .map((junction) => junction.at * routeLength),
  ];

  return reservedDistances.some((reserved) => Math.abs(distance - reserved) < NODE_STRUCTURE_CLEARANCE);
}

/**
 * Canonical production composition point for the Arkour architecture engine.
 *
 * The accepted engine contract lives in `docs/architecture-engine.md`. In short:
 * compiled 60-degree routes are geometric authority; encounter machinery gets
 * first claim around nodes; sparse chassis and volumetric city machinery occupy
 * the remaining space; blocker nodes may later seal/attach to nearby structure;
 * detail remains subordinate; and spatial admission has final veto before any
 * proposal enters Three.js. Camera presentation is derived last and never owns
 * gameplay topology.
 *
 * This function is intentionally the bridge while the current mixed generators
 * are separated into sibling node/chassis/district/attachment/detail providers.
 * Older map and city experiments are donor implementations, not alternate
 * production engines.
 */
export function generateRouteFirstArchitecture(
  world: RunWorld,
  options: ArchitectureOptions = {},
): ScenePlan {
  const structural = generateStructuralArchitecture(world, options);
  const nodes = generateNodeComponents(world);
  const city = generateVerticalCity(world, options);
  const connectiveStructure = structural.pieces.filter((piece) => !structuralPieceEntersNodeZone(piece, world));

  return {
    ...structural,
    pieces: [...nodes, ...connectiveStructure, ...city],
  };
}
